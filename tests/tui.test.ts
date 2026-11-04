import assert from "node:assert/strict";
import { test } from "node:test";
import type { Plugin } from "@opencode/plugin/tui";
import tui from "../src/tui.js";
import { parsePresence } from "../src/rpc.js";

for (const tabsEnabled of [false, true]) {
  test(`TUI startup reports ${tabsEnabled ? "open tabs" : "the visible session with tabs disabled"}`, async () => {
    const snapshots: unknown[] = [];
    const context = {
      location: { directory: "/test/project" },
      client: { rpc: () => ({ sync: async (snapshot: unknown) => { snapshots.push(snapshot); return { ok: true }; } }) },
      data: { session: { root: () => "root" } },
      ui: {
        tabs: { enabled: () => tabsEnabled, list: () => tabsEnabled ? [{ sessionID: "root" }] : [] },
        router: { current: () => ({ type: "session", sessionID: "child" }) },
      },
    } as unknown as Plugin.Context;
    const cleanup = await tui.setup(context);
    try {
      assert.deepEqual(parsePresence(snapshots[0]).sessionIDs, ["root"]);
    } finally { if (cleanup) await cleanup(); }
  });
}
