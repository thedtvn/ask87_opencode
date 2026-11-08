export type ClientExecution = "idle" | "running" | "done" | "failed" | "interrupted";
export interface ClientSession { id: string; parentID?: string; state: ClientExecution; permissionIDs: string[]; questionIDs: string[]; open: boolean; startedAt?: number; }
export interface ClientSnapshot { clientID: string; sequence: number; sessions: ClientSession[]; closed?: boolean; }
export function parseClientSnapshot(input: unknown): ClientSnapshot {
  if (!input || typeof input !== "object") throw new Error("Invalid snapshot");
  const value = input as Record<string, unknown>;
  if (typeof value.clientID !== "string" || !value.clientID || value.clientID.length > 200 || !Number.isSafeInteger(value.sequence) || (value.sequence as number) < 0
    || (value.closed !== undefined && typeof value.closed !== "boolean") || !Array.isArray(value.sessions) || value.sessions.length > 2000) throw new Error("Invalid snapshot");
  const sessions = value.sessions.map((raw: unknown): ClientSession => {
    if (!raw || typeof raw !== "object") throw new Error("Invalid session");
    const session = raw as Record<string, unknown>;
    const identifiers = (ids: unknown): ids is string[] => Array.isArray(ids) && ids.length <= 500 && ids.every((id) => typeof id === "string" && id.length <= 500);
    if (typeof session.id !== "string" || !session.id || session.id.length > 2000 || (session.parentID !== undefined && typeof session.parentID !== "string")
      || !["idle", "running", "done", "failed", "interrupted"].includes(session.state as string) || typeof session.open !== "boolean"
      || !identifiers(session.permissionIDs) || !identifiers(session.questionIDs)
      || (session.startedAt !== undefined && (typeof session.startedAt !== "number" || !Number.isFinite(session.startedAt)))) throw new Error("Invalid session");
    return { id: session.id, state: session.state as ClientExecution, open: session.open, permissionIDs: session.permissionIDs, questionIDs: session.questionIDs,
      ...(typeof session.parentID === "string" ? { parentID: session.parentID } : {}), ...(typeof session.startedAt === "number" ? { startedAt: session.startedAt } : {}) };
  });
  return { clientID: value.clientID, sequence: value.sequence as number, sessions, ...(typeof value.closed === "boolean" ? { closed: value.closed } : {}) };
}
