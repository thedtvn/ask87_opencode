import assert from "node:assert/strict";
import { test } from "node:test";
import { SessionBank } from "../src/session-bank.js";

test("closing third of six tabs shifts later assignments and their colors left", () => {
  const bank = new SessionBank();
  const roots = ["first", "second", "third", "fourth", "fifth", "sixth"];
  bank.syncPresence("ui", roots);
  for (const root of roots) bank.activate(root);
  bank.execution("fourth", "done");
  bank.execution("fifth", "running");
  bank.question("sixth", "question", true);
  bank.syncPresence("ui", roots.filter((id) => id !== "third"));
  assert.deepEqual(bank.snapshot().map((slot) => slot.sessionID), ["first", "second", "fourth", "fifth", "sixth", undefined, undefined, undefined, undefined, undefined]);
  assert.deepEqual(bank.snapshot()[2], { sessionID: "fourth", color: "green", blink: false });
  assert.deepEqual(bank.snapshot()[3], { sessionID: "fifth", color: "white", blink: true });
  assert.deepEqual(bank.snapshot()[4], { sessionID: "sixth", color: "blue", blink: true });
  bank.syncPresence("ui", ["sixth", "fifth", "fourth", "second", "first"]);
  assert.deepEqual(bank.snapshot().slice(0, 5).map((slot) => slot.sessionID), ["first", "second", "fourth", "fifth", "sixth"]);
  bank.syncPresence("ui", [...roots.filter((id) => id !== "third"), "third"]);
  bank.execution("third", "running");
  assert.equal(bank.slotOf("third"), 5); // Reopening appends, not its old position.
});
