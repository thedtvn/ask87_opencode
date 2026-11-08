import { Plugin } from "@opencode/plugin/tui";
import { collectClientSessions } from "./client-snapshot.js";
import { reportLocalClient } from "./client-reporter.js";

export default Plugin.define({
  id: "ask87:tui",
  setup(ctx) {
    const started = new Map<string, number>();
    // OpenCode session IDs are globally generated; use the same namespace as Desktop
    // so a session open in both clients still reserves only one key.
    const identity = "opencode";
    return reportLocalClient(() => {
      const tabs = ctx.ui.tabs.list().map((tab) => tab.sessionID);
      const route = ctx.ui.router.current();
      const roots = ctx.ui.tabs.enabled() ? tabs : route.type === "session" ? [ctx.data.session.root(route.sessionID)] : [];
      return collectClientSessions(identity, ctx.data, roots, started);
    });
  },
});
