// Pure session -> key-slot state. No SDK, hardware, timers, or I/O.

export const SLOT_COUNT = 10;
/** Physical key label per slot index (order 1..9, then 0). */
export const SLOT_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"] as const;

export type ExecutionState = "running" | "done" | "failed" | "interrupted";
export type SlotColor = "white" | "green" | "blue" | "red";
export interface SlotView {
  sessionID?: string;
  color: SlotColor;
  blink: boolean;
}

interface Entry {
  exec?: ExecutionState;
  perms: Set<string>;
  forms: Set<string>;
}

export class SessionBank {
  private readonly parents = new Map<string, string>();
  private readonly defined = new Set<string>();
  private readonly records = new Map<string, Entry>();
  private readonly presence = new Map<string, Set<string>>();
  private readonly slots: Array<string | undefined> = new Array(SLOT_COUNT).fill(undefined);
  private queue: string[] = [];

  /** Register session metadata. A missing parentID never clears a known parent. Child may precede parent. */
  defineSession(id: string, parentID?: string): void {
    if (!id) return;
    this.defined.add(id);
    if (parentID && parentID !== id) this.parents.set(id, parentID);
  }

  /** True if metadata was defined or the id is a root listed by some client. */
  hasSession(id: string): boolean {
    return this.defined.has(id) || this.isPresent(id);
  }

  getParent(id: string): string | undefined {
    return this.parents.get(id);
  }

  /** Top of the known ancestor chain; stops at a presence-listed root. Unknown ancestor id is returned as-is. */
  rootOf(id: string): string {
    const seen = new Set<string>();
    let cur = id;
    while (!seen.has(cur) && !this.isPresent(cur)) {
      seen.add(cur);
      const p = this.parents.get(cur);
      if (p === undefined) break;
      cur = p;
    }
    return cur;
  }

  /** Slot index (0..9) of the group containing id, if its root holds a slot. */
  slotOf(id: string): number | undefined {
    const i = this.slots.indexOf(this.rootOf(id));
    return i < 0 ? undefined : i;
  }

  /** Replace the set of root session tabs listed by one client. */
  syncPresence(clientID: string, rootIDs: Iterable<string>): void {
    const next = new Set<string>();
    for (const id of rootIDs) if (id) next.add(id);
    if (next.size === 0) this.presence.delete(clientID);
    else this.presence.set(clientID, next);
    this.reconcile(next);
  }

  releaseClient(clientID: string): void {
    if (this.presence.delete(clientID)) this.reconcile();
  }

  presentRoots(): string[] {
    return [...new Set([...this.presence.values()].flatMap((roots) => [...roots]))];
  }

  /** Replace authoritative pending snapshots after reconnect; live events are serialized after this. */
  replacePermissions(id: string, requestIDs: Iterable<string>): void {
    this.record(id).perms = new Set(requestIDs);
  }

  resetExecution(id: string): void {
    const entry = this.records.get(id);
    if (entry) delete entry.exec;
  }

  execution(id: string, state: ExecutionState): void {
    if (!id) return;
    const r = this.record(id);
    r.exec = state;
    // Pending requests are independent: only explicit replies/cancellation or snapshots clear them.
  }

  permission(id: string, requestID: string, pending: boolean): void {
    this.setPending(id, "perms", requestID, pending);
  }

  question(id: string, formID: string, pending: boolean): void {
    this.setPending(id, "forms", formID, pending);
  }

  /** Always 10 entries, indexed by slot. Unassigned slots are white solid. */
  snapshot(): SlotView[] {
    const agg = new Map<string, { perm: boolean; form: boolean; run: boolean; any: boolean }>();
    for (const root of this.slots) if (root) agg.set(root, { perm: false, form: false, run: false, any: false });
    for (const [id, r] of this.records) {
      const a = agg.get(this.rootOf(id));
      if (!a) continue;
      if (r.perms.size) a.perm = true;
      if (r.forms.size) a.form = true;
      if (r.exec === "running") a.run = true;
      if (r.exec) a.any = true;
    }
    return this.slots.map((root): SlotView => {
      const a = root && agg.get(root);
      if (!root || !a) return { color: "white", blink: false };
      if (a.perm) return { sessionID: root, color: "red", blink: true };
      if (a.form) return { sessionID: root, color: "blue", blink: true };
      if (a.run) {
        const mainState = this.records.get(root)?.exec;
        const mainStopped = mainState !== undefined && mainState !== "running";
        return { sessionID: root, color: mainStopped ? "green" : "white", blink: true };
      }
      if (a.any) return { sessionID: root, color: "green", blink: false };
      return { sessionID: root, color: "white", blink: false };
    });
  }

  private record(id: string): Entry {
    let r = this.records.get(id);
    if (!r) this.records.set(id, (r = { perms: new Set(), forms: new Set() }));
    return r;
  }

  private setPending(id: string, key: "perms" | "forms", pid: string, pending: boolean): void {
    if (!id || !pid) return;
    if (pending) this.record(id)[key].add(pid);
    else this.records.get(id)?.[key].delete(pid);
  }

  private isPresent(id: string): boolean {
    for (const s of this.presence.values()) if (s.has(id)) return true;
    return false;
  }

  /** Compact surviving assignments, then promote waiting roots in opening order. */
  private reconcile(arrivals: Iterable<string> = []): void {
    const live = new Set<string>();
    for (const roots of this.presence.values()) for (const id of roots) live.add(id);
    const ordered = [...this.slots, ...this.queue].filter((id): id is string => id !== undefined && live.has(id));
    for (const id of arrivals) {
      if (live.has(id) && !ordered.includes(id)) ordered.push(id);
    }
    for (let i = 0; i < SLOT_COUNT; i++) this.slots[i] = ordered[i];
    this.queue = ordered.slice(SLOT_COUNT);
  }
}
