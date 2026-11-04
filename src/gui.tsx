import { Plugin } from "@opencode/plugin/gui";
import { createPresenceReporter } from "./presence.js";

export default Plugin.define({
  setup(ctx) {
    // RPC registrations are project-scoped. Keep a reporter per server/directory,
    // retaining its original location so last-tab and window cleanup route correctly.
    const reporters = new Map<string, {
      serverID: string;
      directory: string;
      reporter: ReturnType<typeof createPresenceReporter>;
    }>();
    const refresh = () => {
      const sessions = ctx.sessions.list();
      for (const session of sessions) {
        if (!session.server.connected) continue;
        const directory = session.location?.directory;
        if (!directory) continue;
        const key = JSON.stringify([session.server.id, directory]);
        if (reporters.has(key)) continue;
        const serverID = session.server.id;
        reporters.set(key, {
          serverID, directory,
          reporter: createPresenceReporter({
            client: session.server.client,
            location: { directory },
            getSessionIDs: () => ctx.sessions.list()
              .filter((item) => item.server.id === serverID && item.location?.directory === directory)
              .map((item) => item.id),
          }),
        });
      }
      const serverIDs = new Set(ctx.servers.list());
      for (const [key, entry] of reporters) {
        if (!serverIDs.has(entry.serverID)) { void entry.reporter.stop(); reporters.delete(key); }
      }
    };
    refresh();
    const timer = setInterval(refresh, 250);
    return async () => {
      clearInterval(timer);
      await Promise.allSettled([...reporters.values()].map((entry) => entry.reporter.stop()));
      reporters.clear();
    };
  },
});
