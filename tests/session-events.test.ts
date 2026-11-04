import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeEvent, delay, type OpenCodeEvent } from "../src/session-events.js";
const event = (type: string, data: unknown, durable?: unknown) => ({ id: "event", type, data, ...(durable ? { durable } : {}) }) as unknown as OpenCodeEvent;
test("normalizes parent and execution state with durable ordering", () => {
  assert.deepEqual(normalizeEvent(event("session.created", { sessionID: "child", parentID: "root" })), {
    eventID: "event", change: { kind: "session", sessionID: "child", parentID: "root" },
  });
  for (const [type, state] of [["started", "running"], ["succeeded", "done"], ["failed", "failed"], ["interrupted", "interrupted"]]) {
    assert.deepEqual(normalizeEvent(event(`session.execution.${type}`, { sessionID: "s" }, { aggregateID: "s", seq: 4 }))?.change,
      { kind: "execution", sessionID: "s", state });
  }
});
test("uses correct permission and form request IDs on ask and resolve", () => {
  const cases = [
    ["permission.asked", { sessionID: "s", id: "p" }, "permission", "p", true],
    ["permission.replied", { sessionID: "s", requestID: "p" }, "permission", "p", false],
    ["form.created", { form: { sessionID: "s", id: "f" } }, "question", "f", true],
    ["form.replied", { sessionID: "s", id: "f" }, "question", "f", false],
    ["form.cancelled", { sessionID: "s", id: "f" }, "question", "f", false],
  ] as const;
  for (const [type, data, kind, requestID, pending] of cases) {
    assert.deepEqual(normalizeEvent(event(type, data))?.change, { kind, sessionID: "s", requestID, pending });
  }
  assert.equal(normalizeEvent(event("session.deleted", { sessionID: "s" })), undefined);
});
test("backoff is cancellable without waiting for timeout", async () => {
  const controller = new AbortController();
  const pending = delay(60000, controller.signal);
  controller.abort(); await pending;
});
