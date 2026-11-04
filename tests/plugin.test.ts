import assert from "node:assert/strict";
import { test } from "node:test";
import type { Plugin } from "@opencode/plugin";
import plugin from "../src/index.js";
import { eventLabel, listenEvents, type SessionEvent } from "../src/events.js";

// These narrow fixtures exercise dispatch, not the full SDK event schema or hardware.
const fixture = (type: string) => ({ type, data: { privateText: "not for logs" } }) as unknown as SessionEvent;
type EventDomain = Plugin.Context["event"];
function mockEvents(stream: AsyncIterable<SessionEvent>, capture?: (signal: AbortSignal | undefined) => void): EventDomain {
  return {
    subscribe: (options?: { signal?: AbortSignal }) => {
      capture?.(options?.signal);
      return stream;
    },
  } as unknown as EventDomain;
}

test("plugin can be imported without initializing native hardware", () => {
  assert.equal(plugin.id, "ask87");
});

test("maps all requested V2 events to payload-free labels", () => {
  const expected = {
    "session.created": "Session created",
    "session.execution.started": "Execution started",
    "session.execution.succeeded": "Execution succeeded",
    "session.execution.failed": "Execution failed",
    "session.execution.interrupted": "Execution interrupted",
    "permission.asked": "Permission requested",
    "form.created": "Question/form presented",
  };
  for (const [type, label] of Object.entries(expected)) {
    assert.equal(eventLabel(fixture(type)), label);
  }
  assert.equal(eventLabel(fixture("unrelated")), undefined);
});

test("consumes the event stream and passes its abort signal", async () => {
  const controller = new AbortController();
  const logs: string[] = [];
  async function* stream() {
    yield fixture("session.created");
    yield fixture("unrelated");
    yield fixture("form.created");
  }
  await listenEvents(mockEvents(stream(), (signal) => assert.equal(signal, controller.signal)), controller.signal, (s) => logs.push(s), assert.fail);
  assert.deepEqual(logs, ["Session created", "Question/form presented"]);
});

test("reports stream failures without exposing error details", async () => {
  const warnings: string[] = [];
  async function* stream(): AsyncGenerator<SessionEvent> {
    throw new Error("sensitive details");
  }
  await listenEvents(mockEvents(stream()), new AbortController().signal, assert.fail, (s) => warnings.push(s));
  assert.deepEqual(warnings, ["OpenCode event listener stopped unexpectedly"]);
});

test("abort stops dispatch and does not log cancellation errors", async () => {
  const controller = new AbortController();
  async function* stream() {
    controller.abort();
    yield fixture("session.created");
  }
  await listenEvents(mockEvents(stream()), controller.signal, assert.fail, assert.fail);
  async function* rejected(): AsyncGenerator<SessionEvent> {
    throw new Error("aborted");
  }
  await listenEvents(mockEvents(rejected()), controller.signal, assert.fail, assert.fail);
});
