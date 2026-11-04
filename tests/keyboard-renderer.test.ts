import assert from "node:assert/strict";
import { test } from "node:test";
import { KeyboardRenderer, type KeyboardDevice } from "../src/keyboard-renderer.js";

test("renders all other keys white and blinks only the assigned key", async () => {
  let time = 0;
  const frames: Array<Map<string, readonly number[]>> = [];
  let stopped = 0, closed = 0;
  const device: KeyboardDevice = {
    keys: ["Digit1", "Digit2", "Esc"], slotKeys: ["Digit1", "Digit2"],
    sendFrame: async (frame) => { frames.push(new Map(frame)); },
    stopRealtime: async () => { stopped++; }, close: () => { closed++; },
  };
  const renderer = new KeyboardRenderer({ open: async () => device, now: () => time, schedule: () => () => {} });
  renderer.setIndicators([{ color: "blue", blink: true }, { color: "green", blink: false }]);
  renderer.start(); await renderer.tick();
  assert.deepEqual(frames.at(-1)?.get("Digit1"), [0, 0, 255]);
  assert.deepEqual(frames.at(-1)?.get("Digit2"), [0, 255, 0]);
  assert.deepEqual(frames.at(-1)?.get("Esc"), [255, 255, 255]);
  time = 500; renderer.setIndicators([{ color: "blue", blink: true }, { color: "green", blink: false }]);
  await renderer.tick();
  assert.deepEqual(frames.at(-1)?.get("Digit1"), [0, 0, 0]);
  assert.deepEqual(frames.at(-1)?.get("Esc"), [255, 255, 255]);
  await renderer.stop(); assert.equal(stopped, 1); assert.equal(closed, 1);
});

test("serializes slow writes and coalesces updates", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let inflight = 0, max = 0, calls = 0;
  let latest: readonly number[] | undefined;
  const renderer = new KeyboardRenderer({
    schedule: () => () => {}, now: () => 0,
    open: async () => ({ keys: ["1"], slotKeys: ["1"],
      sendFrame: async (frame) => {
        max = Math.max(max, ++inflight); calls++;
        if (calls === 1) await gate;
        latest = frame.get("1"); inflight--;
      }, stopRealtime: async () => {}, close: () => {},
    }),
  });
  renderer.start(); await Promise.resolve();
  renderer.setIndicators([{ color: "red", blink: false }]);
  renderer.setIndicators([{ color: "green", blink: false }]);
  release(); await renderer.tick();
  assert.equal(max, 1); assert.deepEqual(latest, [0, 255, 0]);
  await renderer.stop();
});

test("unavailable hardware retries with backoff without unhandled rejection", async () => {
  let time = 0, attempts = 0, warnings = 0;
  const renderer = new KeyboardRenderer({ now: () => time, schedule: () => () => {},
    open: async () => { attempts++; throw Error("private error"); }, warn: () => { warnings++; },
  });
  renderer.start(); await renderer.tick(); await renderer.tick();
  assert.equal(attempts, 1); time = 5000; await renderer.tick();
  assert.equal(attempts, 2); assert.equal(warnings, 2); await renderer.stop();
});
