import assert from "node:assert/strict";
import { test } from "node:test";
import { SessionBank } from "../src/session-bank.js";

test("idle and previously completed tabs reserve no keys", () => {
  const bank = new SessionBank(); bank.syncPresence("ui", ["idle", "done"]); bank.execution("done", "done");
  assert.ok(bank.snapshot().every((slot) => !slot.sessionID));
});
test("first running task gets key1 regardless of tab order and stays reserved when done", () => {
  const bank = new SessionBank(); bank.syncPresence("ui", ["idle", "later", "first"]);
  bank.execution("first", "running"); bank.execution("later", "running");
  assert.equal(bank.slotOf("first"), 0); assert.equal(bank.slotOf("later"), 1);
  bank.execution("first", "done"); assert.deepEqual(bank.snapshot()[0], { sessionID: "first", color: "green", blink: false });
  bank.syncPresence("ui", ["later", "idle"]); assert.equal(bank.slotOf("later"), 0);
});
test("recursive descendants share root; pending priorities survive parent completion", () => {
  const bank = new SessionBank(); bank.syncPresence("ui", ["root"]); bank.defineSession("child", "root"); bank.defineSession("grand", "child");
  bank.execution("root", "running"); bank.execution("grand", "running"); bank.execution("root", "done");
  assert.deepEqual(bank.snapshot()[0], { sessionID: "root", color: "green", blink: true });
  bank.question("grand", "q", true); assert.equal(bank.snapshot()[0]?.color, "blue");
  bank.permission("child", "p", true); assert.equal(bank.snapshot()[0]?.color, "red");
  bank.permission("child", "p", false); bank.question("grand", "q", false); bank.execution("grand", "done");
  assert.deepEqual(bank.snapshot()[0], { sessionID: "root", color: "green", blink: false });
});
test("running before presence and late hierarchy migrates activation to root", () => {
  const bank = new SessionBank(); bank.execution("child", "running"); bank.defineSession("child", "root"); bank.syncPresence("ui", ["root"]);
  assert.equal(bank.slotOf("root"), 0); assert.equal(bank.slotOf("child"), 0);
});
test("last tab ownership across clients controls release", () => {
  const bank = new SessionBank(); bank.syncPresence("a", ["root"]); bank.syncPresence("b", ["root"]); bank.execution("root", "running");
  bank.releaseClient("a"); assert.equal(bank.slotOf("root"), 0); bank.releaseClient("b"); assert.equal(bank.slotOf("root"), undefined);
});
test("capacity10 and overflow preserves first-run order while compacting", () => {
  const bank = new SessionBank(); const roots = Array.from({ length: 12 }, (_, i) => `s${i}`); bank.syncPresence("ui", roots);
  for (const id of roots) bank.execution(id, "running");
  assert.equal(bank.slotOf("s9"), 9); assert.equal(bank.slotOf("s10"), undefined);
  bank.syncPresence("ui", roots.filter((id) => id !== "s2"));
  assert.equal(bank.slotOf("s3"), 2); assert.equal(bank.slotOf("s10"), 9);
});
test("reordered heartbeats do not reshuffle and reopened completed tabs do not reclaim", () => {
  const bank = new SessionBank(); bank.syncPresence("ui", ["a", "b"]); bank.execution("a", "running"); bank.execution("b", "running");
  bank.syncPresence("ui", ["b", "a"]); assert.equal(bank.slotOf("a"), 0);
  bank.execution("a", "done"); bank.syncPresence("ui", ["b"]); bank.syncPresence("ui", ["a", "b"]);
  assert.equal(bank.slotOf("a"), undefined); bank.execution("a", "running"); assert.equal(bank.slotOf("a"), 1);
});
