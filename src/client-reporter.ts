import { connectBroker, type BrokerConnection } from "./broker-client.js";
import type { ClientSession } from "./client-state.js";

export function reportLocalClient(getSessions: () => ClientSession[]) {
  const clientID = `tui-${crypto.randomUUID()}`;
  let connection: BrokerConnection | undefined;
  let stopped = false;
  let sequence = 0;
  let busy = false;
  let last = "", lastSent = -Infinity, retryAt = 0;
  const tick = async () => {
    if (stopped || busy || performance.now() < retryAt) return;
    busy = true;
    try {
      const sessions = getSessions();
      const signature = JSON.stringify(sessions);
      if (signature === last && performance.now() - lastSent < 5000) return;
      connection ??= await connectBroker();
      if (stopped) { connection.close(); connection = undefined; return; }
      await connection.sync({ clientID, sequence: ++sequence, sessions });
      last = signature; lastSent = performance.now();
    } catch {
      connection?.close(); connection = undefined; retryAt = performance.now() + 5000;
      console.warn("[ask87] Local keyboard broker unavailable; retrying");
    } finally { busy = false; }
  };
  const timer = setInterval(() => { void tick(); }, 250);
  void tick();
  return async () => {
    if (stopped) return;
    stopped = true; clearInterval(timer);
    try { await connection?.sync({ clientID, sequence: ++sequence, sessions: [], closed: true }); }
    catch { /* Connection closure also releases client presence. */ }
    finally { connection?.close(); }
  };
}
