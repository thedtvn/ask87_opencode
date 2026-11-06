import assert from "node:assert/strict";
import { test } from "node:test";
import { KeyboardRenderer } from "../src/keyboard-renderer.js";

test("solid frames send only once; blinking has one complete cycle per second", async () => {
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
    assert.equal(interval, 50); // Scheduler polling is not USB traffic.
    for (now = 50; now <= 1000; now += 50) { callback(); await renderer.tick(); }
    assert.equal(frames.length, 1);
    now = 1100; renderer.setIndicators([{ color: "green", blink: true }]); await renderer.tick();
    assert.equal(frames.length, 1); // Same visible on-frame, no resend.
    now = 1500; callback(); await renderer.tick();
    assert.deepEqual(frames.at(-1), [0, 0, 0]);
    now = 2000; callback(); await renderer.tick();
    assert.deepEqual(frames.at(-1), [0, 255, 0]);
    assert.equal(frames.length, 3);
  } finally { await renderer.stop(); }
});

test("rapid updates send only latest state with a 100ms minimum gap", async () => {
  let now = 0;
  const frames: Array<{ time: number; color: readonly number[] | undefined }> = [];
  const renderer = new KeyboardRenderer({ now: () => now, schedule: () => () => {},
    open: async () => ({ keys: ["1"], slotKeys: ["1"],
      sendFrame: async (frame) => { frames.push({ time: now, color: frame.get("1") }); },
      stopRealtime: async () => {}, close: () => {},
    }),
  });
  try {
    renderer.start(); await renderer.tick();
    now = 20; renderer.setIndicators([{ color: "red", blink: false }]);
    now = 40; renderer.setIndicators([{ color: "blue", blink: false }]);
    now = 99; renderer.setIndicators([{ color: "green", blink: false }]); await renderer.tick();
    assert.equal(frames.length, 1);
    now = 100; await renderer.tick();
    assert.deepEqual(frames[1], { time: 100, color: [0, 255, 0] });
    now = 150; renderer.setIndicators([{ color: "red", blink: false }]);
    await renderer.stop();
    now = 200; await renderer.tick();
    assert.equal(frames.length, 2); // Unsent pending state was cancelled on stop.
  } finally { await renderer.stop(); }
});
