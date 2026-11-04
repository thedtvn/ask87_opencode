import { Plugin } from "@opencode/plugin/tui";
import { createPresenceReporter } from "./presence.js";

export default Plugin.define({
  id: "ask87:tui",
  setup(ctx) {
    const reporter = createPresenceReporter({
      client: ctx.client,
      location: ctx.location ?? ctx.data.location.default(),
      getSessionIDs: () => {
        const tabs = ctx.ui.tabs.list().map((tab) => tab.sessionID);
        if (ctx.ui.tabs.enabled()) return tabs;
        // Single-session TUI mode has no tab bank; report the visible session instead.
        const route = ctx.ui.router.current();
        return route.type === "session" ? [ctx.data.session.root(route.sessionID)] : [];
      },
    });
    return () => reporter.stop();
  },
});
