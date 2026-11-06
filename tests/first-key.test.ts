import assert from "node:assert/strict";
import { test } from "node:test";
import { KeyboardRenderer } from "../src/keyboard-renderer.js";
import { SessionBank } from "../src/session-bank.js";

test("first session blinks physical key 1, not the last number key 0", async () => {
  const bank = new SessionBank();
  bank.syncPresence("ui", ["first-session"]);
  bank.execution("first-session", "running");
  const keys = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9", "Digit0"];
  let frame: ReadonlyMap<string, readonly [number, number, number]> | undefined;
  const renderer = new KeyboardRenderer({
    now: () => 500, // The off phase exposes which physical key is blinking.
    schedule: () => () => {},
    open: async () => ({ keys, slotKeys: keys,
      sendFrame: async (next) => { frame = next; },
      stopRealtime: async () => {}, close: () => {},
    }),
  });
  try {
    renderer.setIndicators(bank.snapshot());
    renderer.start(); await renderer.tick();
    assert.equal(bank.slotOf("first-session"), 0);
    assert.deepEqual(frame?.get("Digit1"), [0, 0, 0]);
    assert.deepEqual(frame?.get("Digit0"), [255, 255, 255]);
    for (const key of keys.slice(1)) assert.deepEqual(frame?.get(key), [255, 255, 255]);
  } finally { await renderer.stop(); }
});
