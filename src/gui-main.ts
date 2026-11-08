import type { MainContext } from "@opencode/plugin/gui/main";
import { KeyboardIPC } from "./gui-ipc.js";
import { materializeRuntime } from "./runtime-assets.js";
import { parseClientSnapshot, type ClientSnapshot } from "./client-state.js";
import { connectBroker, type BrokerConnection } from "./broker-client.js";

export function setupMain(ctx: MainContext) {
  let connection: BrokerConnection | undefined;
  let queue = Promise.resolve();
  const clients = new Set<string>();
  const sequences = new Map<string, number>();
  const owners = new Map<string, number>();
  const snapshots = new Map<string, ClientSnapshot>();
  const heartbeat = setInterval(() => {
    queue = queue.then(async () => {
      for (const [clientID, snapshot] of snapshots) {
        const next = { ...snapshot, sequence: (sequences.get(clientID) ?? 0) + 1 };
        await connection?.sync(next); sequences.set(clientID, next.sequence);
      }
    }).catch(() => { connection?.close(); connection = undefined; });
  }, 5000);
  const offClose = ctx.windows.on("close", (window) => {
    queue = queue.then(async () => {
      for (const [clientID, owner] of owners) if (owner === window.id) {
        try { await connection?.sync({ clientID, sequence: (sequences.get(clientID) ?? 0) + 1, sessions: [], closed: true }); } catch {}
        owners.delete(clientID); clients.delete(clientID); snapshots.delete(clientID);
      }
    }).catch(() => {});
  });
  ctx.provide(KeyboardIPC, {
      sync: (input, caller) => {
        const snapshot = parseClientSnapshot(input);
        const owner = owners.get(snapshot.clientID);
        if (owner !== undefined && owner !== caller.window) throw new Error("Window client owner mismatch");
        owners.set(snapshot.clientID, caller.window);
        const result = queue.then(async () => {
          connection ??= await connectBroker({ entryPath: await materializeRuntime() });
          snapshot.sequence = (sequences.get(snapshot.clientID) ?? 0) + 1;
          await connection.sync(snapshot);
          sequences.set(snapshot.clientID, snapshot.sequence);
          if (snapshot.closed) { clients.delete(snapshot.clientID); snapshots.delete(snapshot.clientID); }
          else { clients.add(snapshot.clientID); snapshots.set(snapshot.clientID, snapshot); }
        });
        queue = result.catch(() => { connection?.close(); connection = undefined; });
        return result.then(() => true);
      },
  });
  return async () => {
    offClose(); clearInterval(heartbeat);
    await queue;
    for (const clientID of clients) {
      try { await connection?.sync({ clientID, sequence: (sequences.get(clientID) ?? 0) + 1, sessions: [], closed: true }); } catch {}
    }
    connection?.close();
  };
}
