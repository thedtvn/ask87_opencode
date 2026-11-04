import type { OpenCodeClient } from "@opencode/client";
import { Ask87Presence, type PresenceSnapshot } from "./rpc.js";

export function deduplicateSessionIDs(ids: Iterable<unknown>): string[] {
  return [...new Set([...ids].filter((id): id is string => typeof id === "string" && id.length > 0))];
}
export interface PresenceReporterOptions {
  client: Pick<OpenCodeClient, "rpc">;
  getSessionIDs: () => Iterable<unknown>;
  location: { directory: string };
  clientID?: string;
  heartbeatMs?: number;
}
export function createPresenceReporter(options: PresenceReporterOptions) {
  const clientID = options.clientID ?? `ask87-${crypto.randomUUID()}`;
  const rpc = options.client.rpc(Ask87Presence);
  let sequence = 0;
  let stopped = false;
  let lastIDs = "";
  let lastSent = -Infinity;
  let pending: PresenceSnapshot | undefined;
  let draining: Promise<void> | undefined;

  function drain(): Promise<void> {
    if (draining) return draining;
    const work = (async () => {
      while (pending) {
        const snapshot = pending;
        pending = undefined;
        try {
          await rpc.sync(snapshot, { location: options.location });
          if (!snapshot.closed) lastSent = performance.now();
        } catch {
          lastSent = -Infinity; // Retry on the next poll; never log private server errors.
        }
      }
    })();
    draining = work.finally(() => { draining = undefined; });
    return draining;
  }
  function sync(force = false): Promise<void> {
    if (stopped) return Promise.resolve();
    const sessionIDs = deduplicateSessionIDs(options.getSessionIDs());
    const key = JSON.stringify(sessionIDs);
    if (!force && key === lastIDs && performance.now() - lastSent < (options.heartbeatMs ?? 5000)) return Promise.resolve();
    lastIDs = key;
    pending = { clientID, sequence: ++sequence, sessionIDs };
    return drain();
  }
  // Polling also works if UI reactive ownership differs between host versions.
  const timer = setInterval(() => { void sync(); }, 250);
  void sync(true);
  let closing: Promise<void> | undefined;
  function stop(): Promise<void> {
    if (closing) return closing;
    stopped = true;
    clearInterval(timer);
    pending = { clientID, sequence: ++sequence, sessionIDs: [], closed: true };
    closing = drain();
    return closing;
  }
  return { clientID, sync, stop };
}
