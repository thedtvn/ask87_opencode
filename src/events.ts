import type { Plugin } from "@opencode/plugin";

type EventDomain = Plugin.Context["event"];
export type SessionEvent = ReturnType<EventDomain["subscribe"]> extends AsyncIterable<infer E> ? E : never;

/** Only emit labels: never log event payloads, prompts, paths, or device metadata. */
export function eventLabel(event: SessionEvent): string | undefined {
  switch (event.type) {
    case "session.created": return "Session created";
    case "session.execution.started": return "Execution started";
    case "session.execution.succeeded": return "Execution succeeded";
    case "session.execution.failed": return "Execution failed";
    case "session.execution.interrupted": return "Execution interrupted";
    case "permission.asked": return "Permission requested";
    case "form.created": return "Question/form presented";
    default: return undefined;
  }
}

export async function listenEvents(
  events: EventDomain,
  signal: AbortSignal,
  log: (message: string) => void,
  warn: (message: string) => void,
): Promise<void> {
  try {
    for await (const event of events.subscribe({ signal })) {
      if (signal.aborted) break;
      const label = eventLabel(event);
      if (label) log(label);
    }
  } catch {
    if (!signal.aborted) warn("OpenCode event listener stopped unexpectedly");
  }
}
