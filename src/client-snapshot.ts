import type { ClientSession } from "./client-state.js";

/** Structural seam shared by the TUI and GUI's synchronized server data. */
export interface ClientData {
  session: {
    list(): ReadonlyArray<{ id: string; parentID?: string; outcome?: string; time?: { busy?: number; idle?: number } }>;
    get(id: string): { id: string; parentID?: string; outcome?: string; time?: { busy?: number; idle?: number } } | undefined;
    root(id: string): string;
    family(id: string): string[];
    status(id: string): "idle" | "running";
    permission: { list(id: string): ReadonlyArray<{ id: string }> | undefined };
    form: { list(id: string): ReadonlyArray<{ id: string }> | undefined };
  };
}
export function collectClientSessions(serverID: string, data: ClientData, rootIDs: string[], started: Map<string, number>): ClientSession[] {
  const namespace = (id: string) => `${serverID}\n${id}`;
  const roots = new Set(rootIDs.map((id) => data.session.root(id)));
  const included = new Set<string>(roots);
  for (const root of roots) for (const id of data.session.family(root)) included.add(id);
  // Include cached nested descendants even if the host's family cache is not ready yet.
  const all = data.session.list();
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of all) if (item.parentID && included.has(item.parentID) && !included.has(item.id)) { included.add(item.id); changed = true; }
  }
  const result: ClientSession[] = [];
  for (const id of included) {
    const info = data.session.get(id);
    const running = data.session.status(id) === "running";
    const key = namespace(id);
    if (running && !started.has(key)) started.set(key, info?.time?.busy ?? Date.now());
    const outcome = info?.outcome;
    result.push({ id: key, ...(info?.parentID ? { parentID: namespace(info.parentID) } : {}),
      state: running ? "running" : outcome === "succeeded" ? "done" : outcome === "failed" || outcome === "interrupted" ? outcome : "idle",
      permissionIDs: (data.session.permission.list(id) ?? []).map((request) => request.id),
      questionIDs: (data.session.form.list(id) ?? []).map((form) => form.id),
      open: roots.has(id), ...(started.has(key) ? { startedAt: started.get(key)! } : {}),
    });
  }
  const live = new Set(result.map((session) => session.id));
  for (const key of started.keys()) if (key.startsWith(`${serverID}\n`) && !live.has(key)) started.delete(key);
  return result;
}
