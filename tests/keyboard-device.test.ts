import assert from "node:assert/strict";
import { test } from "node:test";
import { openWorkerKeyboard } from "../src/keyboard-device.js";

const workerURL = new URL("./fixtures/keyboard-worker-fixture.cjs", import.meta.url);

test("worker opens, acknowledges frames and releases without native hardware", async () => {
  const device = await openWorkerKeyboard({ workerURL });
  try {
    assert.deepEqual(device.keys, ["A", "1"]);
    await device.sendFrame(new Map([["1", [255, 0, 0]]]));
    await device.stopRealtime();
  } finally { device.close(); await device.released; }
});

test("synchronous work stays off the parent event loop and request queue is bounded", async () => {
  const device = await openWorkerKeyboard({ workerURL, workerData: { busyMs: 150 } });
  try {
    let completed = false;
    const sending = device.sendFrame(new Map()).then(() => { completed = true; });
    await assert.rejects(device.sendFrame(new Map()), /already in flight/);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(completed, false); // Parent timer ran while worker was still synchronously busy.
    await sending;
    assert.equal(completed, true);
  } finally { device.close(); await device.released; }
});

test("hung worker open times out and terminates", async () => {
  await assert.rejects(openWorkerKeyboard({ workerURL, workerData: { hang: "open" }, openTimeoutMs: 100 }), /timed out/);
});

test("hung frame fails and closes the adapter instead of allowing more work", async () => {
  const device = await openWorkerKeyboard({ workerURL, workerData: { hang: "frame" }, requestTimeoutMs: 100 });
  try {
    await assert.rejects(device.sendFrame(new Map()), /timed out/);
    await assert.rejects(device.sendFrame(new Map()), /closed/);
  } finally { device.close(); await device.released; }
});

test("worker crash rejects its request", async () => {
  const device = await openWorkerKeyboard({ workerURL, workerData: { crash: "frame" } });
  try { await assert.rejects(device.sendFrame(new Map()), /exited|failed/); }
  finally { device.close(); await device.released; }
});
