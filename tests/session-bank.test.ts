import assert from "node:assert/strict";
import { test } from "node:test";
import { SessionBank, SLOT_COUNT } from "../src/session-bank.js";

const ids = (n: number, p = "r") => Array.from({ length: n }, (_, i) => `${p}${i}`);
const white = { color: "white", blink: false };

test("unassigned snapshot is ten white solid slots", () => {
  const s = new SessionBank().snapshot();
  assert.equal(s.length, SLOT_COUNT);
  for (const v of s) assert.deepEqual(v, white);
});

test("root with no executions is white solid, not green", () => {
  const b = new SessionBank();
  b.syncPresence("c", ["a"]);
  assert.deepEqual(b.snapshot()[0], { sessionID: "a", color: "white", blink: false });
});

test("capacity 10, FIFO queue, no steal, release grants waiter", () => {
  const b = new SessionBank();
  b.syncPresence("c", [...ids(10), "w1", "w2"]);
  let s = b.snapshot();
  assert.deepEqual(s.map((v) => v.sessionID), ids(10));
  assert.equal(b.slotOf("w1"), undefined);
  // finished green reserved; waiter does not steal
  b.execution("r3", "done");
  assert.equal(b.snapshot()[3]?.color, "green");
  assert.equal(b.slotOf("w1"), undefined);
  // Close r3: later roots shift left; first waiter is promoted to the end.
  b.syncPresence("c", [...ids(10).filter((x) => x !== "r3"), "w1", "w2"]);
  s = b.snapshot();
  assert.equal(s[3]?.sessionID, "r4");
  assert.deepEqual(s[9], { sessionID: "w1", color: "white", blink: false }); // fresh state, no stale green
  assert.equal(b.slotOf("w2"), undefined);
  // close r0 -> w2
  b.syncPresence("c", [...ids(10).filter((x) => x !== "r3" && x !== "r0"), "w1", "w2"]);
  assert.equal(b.snapshot()[9]?.sessionID, "w2");
});

test("survivors compact before new arrivals", () => {
  const b = new SessionBank();
  b.syncPresence("c", ["a", "b", "c"]);
  b.syncPresence("c", ["a", "c", "d"]);
  assert.deepEqual(b.snapshot().slice(0, 4).map((v) => v.sessionID), ["a", "c", "d", undefined]);
});

test("queued root that closes is dropped from queue", () => {
  const b = new SessionBank();
  b.syncPresence("c", [...ids(10), "w1", "w2"]);
  b.syncPresence("c", [...ids(10), "w2"]);
  b.syncPresence("c", ids(10).slice(1).concat("w2"));
  assert.equal(b.snapshot()[9]?.sessionID, "w2");
  assert.equal(b.slotOf("w1"), undefined);
});

test("multi-client ownership: release only after last client stops listing", () => {
  const b = new SessionBank();
  b.syncPresence("c1", ["a"]);
  b.syncPresence("c2", ["a", "b"]);
  assert.deepEqual(b.snapshot().slice(0, 2).map((v) => v.sessionID), ["a", "b"]);
  b.syncPresence("c1", []);
  assert.equal(b.snapshot()[0]?.sessionID, "a");
  b.releaseClient("c2");
  assert.deepEqual(b.snapshot()[0], white);
  assert.deepEqual(b.snapshot()[1], white);
});

test("same root across clients claims only one slot", () => {
  const b = new SessionBank();
  b.syncPresence("c1", ["a"]);
  b.syncPresence("c2", ["a"]);
  b.syncPresence("c1", ["a"]);
  assert.equal(b.snapshot().filter((v) => v.sessionID === "a").length, 1);
});

test("closing one root retains other roots and their state", () => {
  const b = new SessionBank();
  b.syncPresence("c", ["a", "b"]);
  b.execution("b", "done");
  b.syncPresence("c", ["b"]);
  const s = b.snapshot();
  assert.deepEqual(s[0], { sessionID: "b", color: "green", blink: false });
  assert.deepEqual(s[1], white);
});

test("recursive descendants aggregate into root; metadata may arrive late", () => {
  const b = new SessionBank();
  b.execution("grand", "running"); // before any metadata
  b.defineSession("grand", "child"); // child known before parent
  b.syncPresence("c", ["root"]); // presence before metadata
  assert.equal(b.snapshot()[0]?.blink, false);
  b.defineSession("child", "root");
  assert.equal(b.rootOf("grand"), "root");
  assert.equal(b.slotOf("grand"), 0);
  assert.equal(b.getParent("grand"), "child");
  assert.ok(b.hasSession("root") && b.hasSession("child"));
  assert.deepEqual(b.snapshot()[0], { sessionID: "root", color: "white", blink: true });
  b.permission("grand", "p1", true);
  assert.deepEqual(b.snapshot()[0], { sessionID: "root", color: "red", blink: true });
  // defineSession without parent does not erase parent; no duplicate claims
  b.defineSession("child");
  b.defineSession("root");
  assert.equal(b.getParent("child"), "root");
  assert.equal(b.snapshot().filter((v) => v.sessionID).length, 1);
});

test("unknown ancestor resolves to itself", () => {
  const b = new SessionBank();
  b.defineSession("x", "unknown");
  assert.equal(b.rootOf("x"), "unknown");
  assert.equal(b.hasSession("unknown"), false);
  assert.equal(b.slotOf("x"), undefined);
});

test("priority: red > blue > running white blink > green", () => {
  const b = new SessionBank();
  b.syncPresence("c", ["r"]);
  b.defineSession("k1", "r");
  b.defineSession("k2", "r");
  b.defineSession("k3", "r");
  b.execution("r", "done");
  assert.deepEqual(b.snapshot()[0], { sessionID: "r", color: "green", blink: false });
  b.execution("k1", "running");
  assert.deepEqual(b.snapshot()[0], { sessionID: "r", color: "green", blink: true });
  b.question("k2", "f1", true);
  b.execution("k2", "running");
  assert.deepEqual(b.snapshot()[0], { sessionID: "r", color: "blue", blink: true });
  b.permission("k3", "p1", true);
  assert.deepEqual(b.snapshot()[0], { sessionID: "r", color: "red", blink: true });
  b.permission("k3", "p1", false);
  assert.equal(b.snapshot()[0]?.color, "blue");
  b.question("k2", "f1", false);
  assert.deepEqual(b.snapshot()[0], { sessionID: "r", color: "green", blink: true });
  b.execution("k1", "done");
  b.execution("k2", "done");
  assert.deepEqual(b.snapshot()[0], { sessionID: "r", color: "green", blink: false });
});

test("duplicate events are idempotent; multiple pending ids tracked", () => {
  const b = new SessionBank();
  b.syncPresence("c", ["r"]);
  b.execution("r", "running");
  b.permission("r", "p1", true);
  b.permission("r", "p1", true);
  b.permission("r", "p2", true);
  b.permission("r", "p1", false);
  b.permission("r", "p1", false);
  assert.equal(b.snapshot()[0]?.color, "red"); // p2 still pending
  b.permission("r", "p2", false);
  assert.equal(b.snapshot()[0]?.color, "white");
  b.question("r", "f1", true);
  b.question("r", "f1", true);
  b.question("r", "f2", true);
  b.question("r", "f1", false);
  assert.equal(b.snapshot()[0]?.color, "blue");
  b.question("r", "f2", false);
  b.question("r", "nope", false); // resolving unknown id is harmless
  assert.equal(b.snapshot()[0]?.color, "white");
  b.execution("r", "running");
  b.execution("r", "running");
  b.syncPresence("c", ["r"]);
  b.syncPresence("c", ["r"]);
  assert.equal(b.snapshot().filter((v) => v.sessionID === "r").length, 1);
});

test("terminal execution preserves requests until explicit resolution", () => {
  const b = new SessionBank();
  b.syncPresence("c", ["r"]);
  b.defineSession("k", "r");
  b.execution("r", "running");
  b.execution("k", "running");
  b.permission("k", "p", true);
  b.question("k", "f", true);
  b.permission("r", "pr", true);
  for (const t of ["done", "failed", "interrupted"] as const) {
    b.execution("k", "running");
    b.permission("k", "p", true);
    b.question("k", "f", true);
    b.execution("k", t);
    assert.equal(b.snapshot()[0]?.color, "red"); // root's own pr remains
  }
  b.permission("r", "pr", false);
  assert.equal(b.snapshot()[0]?.color, "red"); // child's permission is still pending
  b.permission("k", "p", false);
  assert.equal(b.snapshot()[0]?.color, "blue");
  b.question("k", "f", false);
  assert.deepEqual(b.snapshot()[0], { sessionID: "r", color: "white", blink: true }); // r running
  b.execution("r", "failed");
  assert.deepEqual(b.snapshot()[0], { sessionID: "r", color: "green", blink: false });
});

test("child terminal while sibling still running keeps root running", () => {
  const b = new SessionBank();
  b.syncPresence("c", ["r"]);
  b.defineSession("a", "r");
  b.defineSession("b", "r");
  b.execution("r", "done"); // parent done waits for children
  b.execution("a", "running");
  b.execution("b", "running");
  b.execution("a", "done");
  assert.deepEqual(b.snapshot()[0], { sessionID: "r", color: "green", blink: true });
  b.execution("b", "interrupted");
  assert.deepEqual(b.snapshot()[0], { sessionID: "r", color: "green", blink: false });
});

test("parent done while child running stays running", () => {
  const b = new SessionBank();
  b.syncPresence("c", ["r"]);
  b.defineSession("k", "r");
  b.execution("k", "running");
  b.execution("r", "done");
  assert.deepEqual(b.snapshot()[0], { sessionID: "r", color: "green", blink: true });
  b.execution("k", "done");
  assert.equal(b.snapshot()[0]?.color, "green");
});

test("reacquiring a closed root slot reuses retained state only if still recorded (no stale pending after terminal)", () => {
  const b = new SessionBank();
  b.syncPresence("c", ["r"]);
  b.execution("r", "running");
  b.permission("r", "p", true);
  b.execution("r", "interrupted");
  b.permission("r", "p", false);
  b.syncPresence("c", []);
  b.syncPresence("c", ["r"]);
  assert.deepEqual(b.snapshot()[0], { sessionID: "r", color: "green", blink: false });
});
