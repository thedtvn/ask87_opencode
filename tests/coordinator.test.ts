import assert from "node:assert/strict";
import { test } from "node:test";
import type { Plugin } from "@opencode/plugin";
import { Coordinator } from "../src/coordinator.js";

test("presence snapshots keep last-tab ownership and reject stale updates without hardware", async () => {
  const frames: unknown[] = [];
  let starts = 0, stops = 0;
  const coordinator = new Coordinator({ start: () => { starts++; }, stop: async () => { stops++; }, setIndicators: (f) => { frames.push(f); } });
  const ctx = {
    session: {
      get: async ({ sessionID }: { sessionID: string }) => ({ id: sessionID, time: {}, outcome: "succeeded" }),
      list: async () => ({ data: [], cursor: {} }),
    },
    permission: { list: async () => [] },
  } as unknown as Plugin.Context;
  try {
    await coordinator.presence(ctx, { clientID: "window1", sequence: 1, sessionIDs: ["root"] });
    await coordinator.presence(ctx, { clientID: "window2", sequence: 1, sessionIDs: ["root"] });
    assert.equal(coordinator.bank.snapshot()[0]?.color, "green");
    await coordinator.presence(ctx, { clientID: "window1", sequence: 2, sessionIDs: [] });
    assert.equal(coordinator.bank.snapshot()[0]?.sessionID, "root");
    await coordinator.presence(ctx, { clientID: "window1", sequence: 1, sessionIDs: ["other"] });
    assert.equal(coordinator.bank.snapshot()[1]?.sessionID, undefined);
    await coordinator.presence(ctx, { clientID: "window2", sequence: 2, sessionIDs: [] });
    assert.equal(coordinator.bank.snapshot()[0]?.sessionID, undefined);
    assert.ok(frames.length > 0);
  } finally { await coordinator.stop(); }
  assert.equal(starts, 1); assert.equal(stops, 1);
});
