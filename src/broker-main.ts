import net from "node:net";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { ClientController } from "./client-controller.js";
import { parseClientSnapshot } from "./client-state.js";
import { getBrokerPaths, proof, equalProof } from "./broker-paths.js";

export async function startBroker(options: { endpoint?: string; stateFile?: string; controller?: Pick<ClientController, "sync" | "release" | "stop">; idleMs?: number } = {}) {
  const paths = getBrokerPaths();
  await mkdir(paths.cacheDir, { recursive: true, mode: 0o700 });
  const endpoint = options.endpoint ?? paths.endpoint;
  const stateFile = options.stateFile ?? paths.stateFile;
  const token = randomBytes(32).toString("hex");
  const entry = pathToFileURL(path.resolve(process.argv[1] ?? "dist/broker.cjs"));
  const controller = options.controller ?? new ClientController({ workerURL: new URL("../src/keyboard-worker.cjs", entry) });
  const clients = new Map<string, { socket: net.Socket; sequence: number; expires: number }>();
  const sockets = new Set<net.Socket>();
  let idleSince = performance.now();
  let stopping = false;
  const release = (id: string) => { clients.delete(id); controller.release(id); if (!clients.size) idleSince = performance.now(); };
  const server = net.createServer((socket) => {
    if (stopping) { socket.destroy(); return; }
    sockets.add(socket);
    const nonce = randomBytes(24).toString("hex");
    let authenticated = false, buffer = "";
    socket.setEncoding("utf8");
    socket.setTimeout(3000, () => { if (!authenticated) socket.destroy(); });
    socket.write(JSON.stringify({ nonce, proof: proof(token, nonce, "server"), protocol: 2 }) + "\n");
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      if (Buffer.byteLength(buffer) > 1024 * 1024) { socket.destroy(); return; }
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
        try {
          const message = JSON.parse(line) as Record<string, unknown>;
          if (!authenticated) {
            if (!equalProof(message.proof, proof(token, nonce, "client"))) { socket.destroy(); return; }
            authenticated = true; socket.setTimeout(0); socket.write('{"ready":true}\n'); continue;
          }
          const input = parseClientSnapshot(message.snapshot);
          const previous = clients.get(input.clientID);
          if (previous && previous.socket !== socket) throw new Error("Client owner mismatch");
          if (!previous || input.sequence > previous.sequence) {
            if (input.closed) release(input.clientID);
            else {
              clients.set(input.clientID, { socket, sequence: input.sequence, expires: performance.now() + 30000 });
              controller.sync(input.clientID, input.sessions);
            }
          }
          socket.write(JSON.stringify({ id: message.id, ok: true }) + "\n");
        } catch { socket.write('{"ok":false}\n'); socket.destroy(); }
      }
    });
    socket.on("error", () => {});
    socket.on("close", () => { sockets.delete(socket); for (const [id, client] of clients) if (client.socket === socket) release(id); });
  });
  const listen = () => new Promise<void>((resolve, reject) => { const onError = (error: Error) => { server.off("listening", onListen); reject(error); }; const onListen = () => { server.off("error", onError); resolve(); }; server.once("error", onError); server.once("listening", onListen); server.listen(endpoint); });
  try { await listen(); }
  catch (error) {
    if (process.platform !== "win32" && (error as NodeJS.ErrnoException).code === "EADDRINUSE") {
      const alive = await new Promise<boolean>((resolve) => { const socket = net.connect(endpoint); socket.once("connect", () => { socket.destroy(); resolve(true); }); socket.once("error", () => resolve(false)); });
      if (alive) throw error;
      await unlink(endpoint); await listen();
    } else throw error;
  }
  await writeFile(stateFile, JSON.stringify({ token, pid: process.pid, protocol: 2 }), { mode: 0o600 });
  const stop = async () => {
    if (stopping) return;
    stopping = true; clearInterval(timer);
    for (const socket of sockets) socket.destroy();
    // Keep the endpoint bound until HID is released, so a replacement cannot race us.
    await controller.stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    let ownsEndpoint = false;
    try { const state = JSON.parse(await readFile(stateFile, "utf8")); if (state.pid === process.pid) { ownsEndpoint = true; await unlink(stateFile); } } catch {}
    if (ownsEndpoint && process.platform !== "win32") { try { await unlink(endpoint); } catch {} }
  };
  const timer = setInterval(() => {
    for (const [id, client] of clients) if (client.expires <= performance.now()) release(id);
    if (!clients.size && !sockets.size && performance.now() - idleSince > (options.idleMs ?? 10000)) void stop();
  }, 1000);
  return { endpoint, token, stop };
}
if (process.argv.includes("--serve")) {
  startBroker().then((broker) => {
    process.once("SIGTERM", () => { void broker.stop(); });
    process.once("SIGINT", () => { void broker.stop(); });
  }).catch(() => { process.exitCode = 1; });
}
