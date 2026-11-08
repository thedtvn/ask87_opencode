import { Plugin } from "@opencode/plugin/gui";
import { KeyboardIPC } from "./gui-ipc.js";
import { collectClientSessions } from "./client-snapshot.js";
import type { ClientSession, ClientSnapshot } from "./client-state.js";
import type { ServerRef } from "@opencode/plugin/gui";

export default Plugin.define({
  main: async (ctx) => {
    // The GUI build inlines this into one self-contained host-evaluated bundle.
    const { setupMain } = await import("./gui-main.js");
    return setupMain(ctx);
  },
  setup(ctx) {
    const clientID = `gui-${crypto.randomUUID()}`;
    const startedByServer = new Map<string, Map<string, number>>();
    const live = ctx.main(KeyboardIPC);

    let sequence = 0;
    let stopped = false;
    let busy = false;
    let last = "";
    let lastSent = -Infinity;

    const sendSnapshot = async (snapshot: ClientSnapshot): Promise<void> => {
      await live.sync(snapshot);
    };

    const tick = async () => {
      if (stopped || busy) return;
      busy = true;
      try {
        const tabs = ctx.tabs.list();
        const serverMap = new Map<ServerRef, string[]>();
        const currentServerIDs = new Set<string>();

        for (const tab of tabs) {
          const session = tab.session;
          if (!session?.id || !session.server?.data?.session) continue;
          currentServerIDs.add(session.server.id);
          let roots = serverMap.get(session.server);
          if (!roots) {
            roots = [];
            serverMap.set(session.server, roots);
          }
          roots.push(session.id);
        }

        for (const id of startedByServer.keys()) {
          if (!currentServerIDs.has(id)) startedByServer.delete(id);
        }

        const allSessions: ClientSession[] = [];
        for (const [server, roots] of serverMap) {
          let started = startedByServer.get(server.id);
          if (!started) {
            started = new Map<string, number>();
            startedByServer.set(server.id, started);
          }
          const collected = collectClientSessions("opencode", server.data, roots, started);
          allSessions.push(...collected);
        }

        const seen = new Set<string>();
        const sessions: ClientSession[] = [];
        for (const s of allSessions) {
          if (!seen.has(s.id)) {
            seen.add(s.id);
            sessions.push(s);
          }
        }

        const signature = JSON.stringify(sessions);
        if (signature === last && performance.now() - lastSent < 5000) return;

        await sendSnapshot({ clientID, sequence: ++sequence, sessions });
        last = signature;
        lastSent = performance.now();
      } catch {
        // Main IPC pending, restarting, or failed
      } finally {
        busy = false;
      }
    };

    const timer = setInterval(() => { void tick(); }, 250);
    void tick();

    return async () => {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      startedByServer.clear();
      const timeout = new Promise<void>((resolve) => setTimeout(resolve, 2000));
      const close = async () => {
        try {
          await sendSnapshot({ clientID, sequence: ++sequence, sessions: [], closed: true });
        } catch {
          // Closed or unavailable
        }
      };
      await Promise.race([close(), timeout]);
    };
  },
});
