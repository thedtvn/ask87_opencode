import type { Plugin } from "@opencode/plugin";

type EventDomain = Plugin.Context["event"];
export type OpenCodeEvent = ReturnType<EventDomain["subscribe"]> extends AsyncIterable<infer E> ? E : never;
export type Change =
  | { kind: "session"; sessionID: string; parentID?: string }
  | { kind: "execution"; sessionID: string; state: "running" | "done" | "failed" | "interrupted" }
  | { kind: "permission" | "question"; sessionID: string; requestID: string; pending: boolean };
export interface SessionChange {
  eventID: string;
  durable?: { aggregateID: string; seq: number };
  change: Change;
}
export function normalizeEvent(event: OpenCodeEvent): SessionChange | undefined {
  let change: Change;
  switch (event.type) {
    case "session.created":
      change = { kind: "session", sessionID: event.data.sessionID, ...(event.data.parentID ? { parentID: event.data.parentID } : {}) }; break;
    case "session.execution.started": change = { kind: "execution", sessionID: event.data.sessionID, state: "running" }; break;
    case "session.execution.succeeded": change = { kind: "execution", sessionID: event.data.sessionID, state: "done" }; break;
    case "session.execution.failed": change = { kind: "execution", sessionID: event.data.sessionID, state: "failed" }; break;
    case "session.execution.interrupted": change = { kind: "execution", sessionID: event.data.sessionID, state: "interrupted" }; break;
    case "permission.asked": change = { kind: "permission", sessionID: event.data.sessionID, requestID: event.data.id, pending: true }; break;
    case "permission.replied": change = { kind: "permission", sessionID: event.data.sessionID, requestID: event.data.requestID, pending: false }; break;
    case "form.created": change = { kind: "question", sessionID: event.data.form.sessionID, requestID: event.data.form.id, pending: true }; break;
    case "form.replied":
    case "form.cancelled": change = { kind: "question", sessionID: event.data.sessionID, requestID: event.data.id, pending: false }; break;
    default: return undefined;
  }
  return {
    eventID: event.id,
    ...("durable" in event ? { durable: { aggregateID: event.durable.aggregateID, seq: event.durable.seq } } : {}),
    change,
  };
}

export function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => { clearTimeout(timer); signal.removeEventListener("abort", finish); resolve(); };
    const timer = setTimeout(finish, milliseconds);
    signal.addEventListener("abort", finish, { once: true });
  });
}

export async function runEventStream(
  events: EventDomain,
  signal: AbortSignal,
  consume: (event: SessionChange) => Promise<void>,
  warn: () => void,
  reconnect: () => Promise<void>,
): Promise<void> {
  while (!signal.aborted) {
    try {
      for await (const event of events.subscribe({ signal })) {
        if (signal.aborted) break;
        const normalized = normalizeEvent(event);
        if (normalized) await consume(normalized);
      }
    } catch { if (!signal.aborted) warn(); }
    if (!signal.aborted) {
      await delay(2000, signal);
      if (!signal.aborted) { try { await reconnect(); } catch { warn(); } }
    }
  }
}
