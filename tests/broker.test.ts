import assert from "node:assert/strict";
import { test } from "node:test";
import net from "node:net";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startBroker } from "../src/broker-main.js";
import { proof } from "../src/broker-paths.js";

test("authenticated local broker accepts snapshots and releases on connection close without hardware", async () => {
  const id = randomUUID();
  const endpoint = process.platform === "win32" ? `\\\\.\\pipe\\ask87-test-${id}` : join(tmpdir(), `ask87-${id.slice(0, 8)}.sock`);
  const updates: string[] = [], released: string[] = [];
  const broker = await startBroker({ endpoint, stateFile: join(tmpdir(), `ask87-${id}.json`), idleMs: 60000,
    controller: { sync: (client) => { updates.push(client); }, release: (client) => { released.push(client); }, stop: async () => {} },
  });
  const socket = net.connect(endpoint); socket.setEncoding("utf8");
  let buffer = "";
  let resolveReply!: () => void;
  const reply = new Promise<void>((resolve) => { resolveReply = resolve; });
  socket.on("data", (chunk: string) => {
    buffer += chunk; let index: number;
    while ((index = buffer.indexOf("\n")) >= 0) {
      const message = JSON.parse(buffer.slice(0, index)); buffer = buffer.slice(index + 1);
      if (message.nonce) socket.write(JSON.stringify({ proof: proof(broker.token, message.nonce, "client") }) + "\n");
      else if (message.ready) socket.write(JSON.stringify({ id: 1, snapshot: { clientID: "test-ui", sequence: 1, sessions: [] } }) + "\n");
      else if (message.ok) resolveReply();
    }
  });
  try { await reply; assert.deepEqual(updates, ["test-ui"]); }
  finally { socket.destroy(); await broker.stop(); }
  assert.ok(released.includes("test-ui"));
});
