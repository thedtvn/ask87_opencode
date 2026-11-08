import { KeyboardRenderer } from "./keyboard-renderer.js";
import { openWorkerKeyboard } from "./keyboard-device.js";
import { SessionBank } from "./session-bank.js";
import type { ClientSession } from "./client-state.js";

/** Local broker-owned state. Neither SSH servers nor UI renderers ever own HID. */
export class ClientController {
  readonly bank = new SessionBank();
  private readonly clients = new Map<string, ClientSession[]>();
  private active = false;
  private readonly liveSessions = new Set<string>();
  private readonly renderer: Pick<KeyboardRenderer, "start" | "stop" | "setIndicators">;
  constructor(options: { workerURL?: URL; renderer?: Pick<KeyboardRenderer, "start" | "stop" | "setIndicators"> } = {}) {
    this.renderer = options.renderer ?? new KeyboardRenderer({ open: () => openWorkerKeyboard(options.workerURL ? { workerURL: options.workerURL } : {}) });
  }
  sync(clientID: string, sessions: ClientSession[]): void {
    this.clients.set(clientID, sessions);
    this.reconcile();
  }
  release(clientID: string): void {
    this.clients.delete(clientID);
    this.bank.releaseClient(clientID);
    this.reconcile();
  }
  private reconcile(): void {
    const merged = new Map<string, ClientSession>();
    for (const sessions of this.clients.values()) for (const session of sessions) {
      const previous = merged.get(session.id);
      if (!previous) merged.set(session.id, { ...session });
      else merged.set(session.id, { ...previous,
        state: previous.state === "running" || session.state === "running" ? "running"
          : previous.state !== "idle" ? previous.state : session.state,
        ...(previous.parentID ?? session.parentID ? { parentID: previous.parentID ?? session.parentID! } : {}),
        open: previous.open || session.open,
        permissionIDs: [...new Set([...previous.permissionIDs, ...session.permissionIDs])],
        questionIDs: [...new Set([...previous.questionIDs, ...session.questionIDs])],
        ...(session.startedAt !== undefined ? { startedAt: Math.min(previous.startedAt ?? Infinity, session.startedAt) } : {}),
      });
    }
    for (const id of this.liveSessions) if (!merged.has(id)) {
      this.bank.resetExecution(id); this.bank.replacePermissions(id, []); this.bank.replaceQuestions(id, []);
    }
    this.liveSessions.clear();
    for (const session of merged.values()) { this.liveSessions.add(session.id); this.bank.defineSession(session.id, session.parentID); }
    for (const [clientID, sessions] of this.clients) this.bank.syncPresence(clientID, sessions.filter((session) => session.open).map((session) => session.id));
    // Apply first starts in timestamp order, not MRU/list order. Existing reservations remain stable.
    const ordered = [...merged.values()].sort((a, b) => (a.startedAt ?? Infinity) - (b.startedAt ?? Infinity));
    for (const session of ordered) {
      if (session.startedAt !== undefined) this.bank.activate(session.id);
      if (session.state === "idle") this.bank.resetExecution(session.id);
      else this.bank.execution(session.id, session.state);
      this.bank.replacePermissions(session.id, session.permissionIDs);
      this.bank.replaceQuestions(session.id, session.questionIDs);
    }
    const next = this.clients.size > 0;
    if (next !== this.active) { this.active = next; if (next) this.renderer.start(); else void this.renderer.stop(); }
    this.renderer.setIndicators(this.bank.snapshot());
  }
  async stop(): Promise<void> { this.clients.clear(); this.active = false; await this.renderer.stop(); }
}
