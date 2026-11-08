import net from "node:net";
import { readFile, mkdir, writeFile, rm, stat } from "node:fs/promises";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { getBrokerPaths, proof, equalProof } from "./broker-paths.js";
import type { ClientSnapshot } from "./client-state.js";
export interface BrokerConnection { sync(snapshot: ClientSnapshot): Promise<void>; close(): void; }
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function connectExisting(): Promise<BrokerConnection> {
  const paths = getBrokerPaths();
  const state = JSON.parse(await readFile(paths.stateFile, "utf8")) as { token: string; protocol: number };
  if (state.protocol !== 2 || typeof state.token !== "string") throw new Error("Broker version mismatch");
  return new Promise((resolve, reject) => {
    const socket = net.connect(paths.endpoint);
    let buffer = "", authenticated = false, ready = false, counter = 0;
    let pending: { id: number; resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> } | undefined;
    const timer = setTimeout(() => { socket.destroy(); reject(new Error("Broker connection timed out")); }, 3000);
    const fail = () => { clearTimeout(timer); if (pending) { clearTimeout(pending.timer); pending.reject(new Error("Broker disconnected")); pending = undefined; } if (!ready) reject(new Error("Broker unavailable")); };
    socket.on("error", fail); socket.on("close", fail); socket.setEncoding("utf8");
    const connection: BrokerConnection = {
      sync(snapshot) {
        if (socket.destroyed || !ready || pending) return Promise.reject(new Error("Broker unavailable or busy"));
        return new Promise((resolve, reject) => {
          const id = ++counter;
          const timeout = setTimeout(() => { pending = undefined; socket.destroy(); reject(new Error("Broker request timed out")); }, 3000);
          pending = { id, resolve, reject, timer: timeout };
          socket.write(JSON.stringify({ id, snapshot }) + "\n");
        });
      },
      close() { socket.destroy(); },
    };
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      if (buffer.length > 1024 * 1024) { socket.destroy(); return; }
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
        try {
          const message = JSON.parse(line) as Record<string, unknown>;
          if (!authenticated) {
            if (typeof message.nonce !== "string" || !equalProof(message.proof, proof(state.token, message.nonce, "server"))) throw new Error("Broker identity mismatch");
            socket.write(JSON.stringify({ proof: proof(state.token, message.nonce, "client") }) + "\n"); authenticated = true;
          } else if (!ready) {
            if (message.ready !== true) throw new Error("Broker unavailable");
            ready = true; clearTimeout(timer); resolve(connection);
          } else if (pending && message.id === pending.id) {
            clearTimeout(pending.timer); const request = pending; pending = undefined;
            if (message.ok === true) request.resolve(); else request.reject(new Error("Broker rejected snapshot"));
          }
        } catch { socket.destroy(); fail(); }
      }
    });
  });
}
export async function connectBroker(options: { entryPath?: string } = {}): Promise<BrokerConnection> {
  try { return await connectExisting(); } catch {}
  const paths = getBrokerPaths();
  await mkdir(paths.cacheDir, { recursive: true, mode: 0o700 });
  let locked = false;
  try { await mkdir(paths.lock); await writeFile(`${paths.lock}/owner`, String(process.pid)); locked = true; }
  catch {
    // Only recover a stale startup lock whose process is known dead; never kill a live owner.
    try {
      const age = Date.now() - (await stat(paths.lock)).mtimeMs;
      let owner = 0;
      try { owner = Number(await readFile(`${paths.lock}/owner`, "utf8")); } catch {}
      let alive = Number.isSafeInteger(owner) && owner > 0;
      if (alive) { try { process.kill(owner, 0); } catch (error) { alive = (error as NodeJS.ErrnoException).code !== "ESRCH"; } }
      if (!alive && age > 10000) { await rm(paths.lock, { recursive: true }); return connectBroker(options); }
    } catch {}
  }
  if (locked) {
    try {
      try { return await connectExisting(); } catch {}
      const node = process.env.ASK87_NODE ?? (process.platform === "win32" ? "node.exe" : "node");
      const result = await promisify(execFile)(node, ["-p", "process.versions.node"], { timeout: 2000, windowsHide: true });
      if (Number(result.stdout.trim().split(".")[0]) < 22) throw new Error("Node.js 22 is required for the local keyboard broker");
      const entry = options.entryPath ?? fileURLToPath(new URL("../dist/broker.cjs", import.meta.url));
      const child = spawn(node, [entry, "--serve"], { detached: true, stdio: "ignore", windowsHide: true });
      child.on("error", () => {}); child.unref();
      for (let attempt = 0; attempt < 25; attempt++) { await delay(200); try { return await connectExisting(); } catch {} }
      throw new Error("Local keyboard broker could not start");
    } finally { await rm(paths.lock, { recursive: true, force: true }); }
  }
  for (let attempt = 0; attempt < 25; attempt++) { await delay(200); try { return await connectExisting(); } catch {} }
  throw new Error("Local keyboard broker unavailable");
}
