import assert from "node:assert/strict";
import { test } from "node:test";
import { KeyboardRenderer } from "../src/keyboard-renderer.js";

test("solid frames keep streaming at 40ms while blink phase remains 500ms", async () => {
  let callback!: () => void;
  let interval = 0, now = 0;
  const frames: Array<readonly number[] | undefined> = [];
  const renderer = new KeyboardRenderer({ now: () => now,
    schedule: (tick, ms) => { callback = tick; interval = ms; return () => {}; },
    open: async () => ({ keys: ["1"], slotKeys: ["1"],
      sendFrame: async (frame) => { frames.push(frame.get("1")); },
      stopRealtime: async () => {}, close: () => {},
    }),
  });
  try {
    renderer.setIndicators([{ color: "green", blink: false }]);
    renderer.start(); await renderer.tick();
    assert.equal(interval, 40);
    const initial = frames.length;
    now = 40; callback(); await renderer.tick();
    assert.ok(frames.length > initial);
    assert.deepEqual(frames.at(-1), [0, 255, 0]);
    now = 500; renderer.setIndicators([{ color: "green", blink: true }]); await renderer.tick();
    assert.deepEqual(frames.at(-1), [0, 0, 0]);
  } finally { await renderer.stop(); }
});
