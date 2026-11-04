import assert from "node:assert/strict";
import { test } from "node:test";
import type { Plugin } from "@opencode/plugin";
import { Coordinator } from "../src/coordinator.js";

test("closed green tab is removed before a remaining session's slow metadata request", async () => {
  const coordinator = new Coordinator({ start: () => {}, stop: async () => {}, setIndicators: () => {} });
  const fast = {
    session: { get: async ({ sessionID }: { sessionID: string }) => ({ id: sessionID, time: {}, outcome: "succeeded" }), list: async () => ({ data: [], cursor: {} }) },
    permission: { list: async () => [] },
  } as unknown as Plugin.Context;
  let unblock!: () => void;
  let requested!: () => void;
  const blocked = new Promise<void>((resolve) => { unblock = resolve; });
  const reached = new Promise<void>((resolve) => { requested = resolve; });
  const slow = {
    ...fast,
    session: { ...fast.session, get: async () => { requested(); await blocked; return { id: "new", time: {} }; } },
  } as unknown as Plugin.Context;
  try {
    await coordinator.presence(fast, { clientID: "ui", sequence: 1, sessionIDs: ["closed"] });
    assert.equal(coordinator.bank.snapshot()[0]?.color, "green");
    const update = coordinator.presence(slow, { clientID: "ui", sequence: 2, sessionIDs: ["new"] });
    await reached;
    assert.ok(coordinator.bank.snapshot().every((slot) => slot.sessionID !== "closed"));
    assert.equal(coordinator.bank.snapshot()[0]?.sessionID, "new");
    unblock(); await update;
  } finally { unblock(); await coordinator.stop(); }
});
