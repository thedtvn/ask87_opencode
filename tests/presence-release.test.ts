import assert from "node:assert/strict";
import { test } from "node:test";
import type { Plugin } from "@opencode/plugin";
import { Coordinator } from "../src/coordinator.js";
import { KeyboardRenderer } from "../src/keyboard-renderer.js";

test("last UI close releases realtime without unloading server, reconnect starts again", async () => {
  let opens = 0, releases = 0, closes = 0;
  const renderer = new KeyboardRenderer({ schedule: () => () => {}, open: async () => {
    opens++;
    return { keys: ["Digit1"], slotKeys: ["Digit1"], sendFrame: async () => {},
      stopRealtime: async () => { releases++; }, close: () => { closes++; } };
  } });
  const coordinator = new Coordinator(renderer);
  const ctx = {} as Plugin.Context;
  assert.equal(opens, 0);
  try {
    await coordinator.presence(ctx, { clientID: "a", sequence: 1, sessionIDs: [] }); await renderer.tick();
    await coordinator.presence(ctx, { clientID: "b", sequence: 1, sessionIDs: [] });
    assert.equal(opens, 1);
    await coordinator.presence(ctx, { clientID: "a", sequence: 2, sessionIDs: [], closed: true });
    assert.equal(releases, 0);
    await coordinator.presence(ctx, { clientID: "b", sequence: 2, sessionIDs: [], closed: true });
    await renderer.stop();
    assert.equal(releases, 1); assert.equal(closes, 1);
    await coordinator.presence(ctx, { clientID: "a", sequence: 3, sessionIDs: [] }); await renderer.tick();
    assert.equal(opens, 2);
    coordinator.sweep(Infinity); await renderer.stop();
    assert.equal(releases, 2); assert.equal(closes, 2);
  } finally { await coordinator.stop(); }
});

test("restart waits for a slow realtime release", async () => {
  let resolve!: () => void;
  const gate = new Promise<void>((done) => { resolve = done; });
  let opens = 0, closes = 0;
  const renderer = new KeyboardRenderer({ schedule: () => () => {}, open: async () => {
    opens++;
    return { keys: ["1"], slotKeys: ["1"], sendFrame: async () => {}, stopRealtime: async () => gate, close: () => { closes++; } };
  } });
  renderer.start(); await renderer.tick();
  const stopping = renderer.stop(); renderer.start();
  await Promise.resolve(); assert.equal(opens, 1);
  resolve(); await stopping; await renderer.tick();
  assert.equal(closes, 1); assert.equal(opens, 2);
  await renderer.stop();
});
