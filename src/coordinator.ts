import type { Plugin } from "@opencode/plugin";
import { SessionBank } from "./session-bank.js";
import { KeyboardRenderer } from "./keyboard-renderer.js";
import { runEventStream, type SessionChange } from "./session-events.js";

type Context = Plugin.Context;
export class Coordinator {
  readonly bank = new SessionBank();
  private readonly renderer: Pick<KeyboardRenderer, "start" | "setIndicators" | "stop">;
  private readonly clients = new Map<string, { sequence: number; expires: number; closed: boolean }>();
  private rendererActive = false;
  private readonly seen = new Set<string>();
  private readonly versions = new Map<string, number>();
  private readonly hydrated = new Set<string>();
  private readonly uncertain = new Set<string>();
  private readonly contexts = new Set<Context>();
  private queue: Promise<void> = Promise.resolve();
  private readonly timer: ReturnType<typeof setInterval>;
  private refreshPending = false;

  constructor(renderer: Pick<KeyboardRenderer, "start" | "setIndicators" | "stop"> = new KeyboardRenderer()) {
    this.renderer = renderer;
    this.timer = setInterval(() => {
      this.sweep();
      if (!this.refreshPending && this.contexts.size) {
        this.refreshPending = true;
        const context = this.contexts.values().next().value!;
        void this.enqueue(async () => {
          this.hydrated.clear();
          for (const root of this.bank.presentRoots()) {
            this.uncertain.add(root);
            try { await this.hydrate(context, root); this.uncertain.delete(root); } catch { /* keep unknown non-green */ }
          }
          this.render();
        }).catch(() => {}).finally(() => { this.refreshPending = false; });
      }
    }, 5000);
    this.timer.unref();
  }

  sweep(now = performance.now()): void {
    for (const [id, client] of this.clients) {
      if (!client.closed && client.expires <= now) { this.bank.releaseClient(id); client.closed = true; }
    }
    this.render();
  }

  private render(): void {
    const active = [...this.clients.values()].some((client) => !client.closed);
    if (active !== this.rendererActive) {
      this.rendererActive = active;
      if (active) this.renderer.start();
      else void this.renderer.stop().catch(() => console.warn("[ask87] Keyboard release failed"));
    }
    this.renderer.setIndicators(this.bank.snapshot().map((slot) =>
      slot.color === "green" && slot.sessionID && this.uncertain.has(slot.sessionID)
        ? { ...slot, color: "white" as const, blink: false } : slot));
  }
  private enqueue(work: () => Promise<void>): Promise<void> {
    const result = this.queue.then(work);
    this.queue = result.catch(() => { console.warn("[ask87] Session synchronization unavailable"); });
    return this.queue;
  }

  async presence(ctx: Context, input: { clientID: string; sequence: number; sessionIDs: string[]; closed?: boolean }): Promise<void> {
    return this.enqueue(async () => {
      const previous = this.clients.get(input.clientID);
      if (previous && input.sequence <= previous.sequence) return;
      // Sequence numbers reject late snapshots; a newer heartbeat may renew an expired lease.
      if (input.closed) {
        this.clients.set(input.clientID, { sequence: input.sequence, expires: 0, closed: true });
        this.bank.releaseClient(input.clientID);
        this.render();
        return;
      }
      this.clients.set(input.clientID, { sequence: input.sequence, expires: performance.now() + 30000, closed: false });
      // Commit closures before slow metadata I/O; otherwise a closed tab can keep its old green key.
      const roots = input.sessionIDs.map((id) => this.bank.rootOf(id));
      this.bank.syncPresence(input.clientID, roots);
      this.render();
      for (const id of input.sessionIDs) {
        this.uncertain.add(this.bank.rootOf(id));
        try { await this.hydrate(ctx, id); this.uncertain.delete(this.bank.rootOf(id)); } catch { /* unknown subtree is not green */ }
      }
      this.clients.set(input.clientID, { sequence: input.sequence, expires: performance.now() + 30000, closed: false });
      this.bank.syncPresence(input.clientID, input.sessionIDs.map((id) => this.bank.rootOf(id)));
      this.render();
    });
  }

  private async hydrate(ctx: Context, id: string, visited = new Set<string>()): Promise<void> {
    if (this.hydrated.has(id) || visited.has(id)) return;
    visited.add(id);
    const info = await ctx.session.get({ sessionID: id });
    this.bank.defineSession(info.id, info.parentID);
    if (info.parentID) await this.hydrate(ctx, info.parentID, visited);
    // The plugin context does not expose the client's active/form snapshot methods.
    // Bootstrap execution from timestamps; live lifecycle events take precedence afterward.
    if (info.time.busy && info.time.busy > (info.time.idle ?? 0)) this.bank.execution(id, "running");
    else if (info.outcome) this.bank.execution(id, info.outcome === "succeeded" ? "done" : info.outcome);
    else this.bank.resetExecution(id);
    const permissions = await ctx.permission.list({ sessionID: id });
    this.bank.replacePermissions(id, permissions.map((request) => request.id));
    let cursor: string | undefined;
    do {
      const children = await ctx.session.list({ parentID: id, ...(cursor ? { cursor } : {}) });
      for (const child of children.data) await this.hydrate(ctx, child.id, visited);
      cursor = children.cursor.next ?? undefined;
    } while (cursor);
    this.hydrated.add(id);
  }

  attach(ctx: Context): () => Promise<void> {
    this.contexts.add(ctx);
    const controller = new AbortController();
    const task = runEventStream(ctx.event, controller.signal,
      (event) => this.enqueue(() => this.apply(ctx, event)),
      () => console.warn("[ask87] Event stream disconnected; retrying"),
      () => this.enqueue(async () => {
        // Re-read snapshots after transport gaps; preserve slots and ownership.
        this.hydrated.clear();
        for (const root of this.bank.presentRoots()) {
          this.uncertain.add(root);
          try { await this.hydrate(ctx, root); this.uncertain.delete(root); } catch { /* retry on reconciliation */ }
        }
        this.render();
      }));
    return async () => { controller.abort(); this.contexts.delete(ctx); await task; };
  }

  private async apply(ctx: Context, event: SessionChange): Promise<void> {
    if (this.seen.has(event.eventID)) return;
    if (event.durable) {
      const latest = this.versions.get(event.durable.aggregateID) ?? -1;
      if (event.durable.seq <= latest) return;
      this.versions.set(event.durable.aggregateID, event.durable.seq);
    }
    this.seen.add(event.eventID);
    if (this.seen.size > 10000) this.seen.delete(this.seen.values().next().value!);
    const change = event.change;
    if (change.kind === "session") this.bank.defineSession(change.sessionID, change.parentID);
    else {
      try { await this.hydrate(ctx, change.sessionID); } catch { /* metadata may follow creation */ }
      if (change.kind === "execution") this.bank.execution(change.sessionID, change.state);
      else if (change.kind === "permission") this.bank.permission(change.sessionID, change.requestID, change.pending);
      else this.bank.question(change.sessionID, change.requestID, change.pending);
    }
    this.render();
  }

  async stop(): Promise<void> { clearInterval(this.timer); await this.queue; await this.renderer.stop(); }
}

interface Shared { coordinator: Coordinator; references: number; stopping?: Promise<void>; }
const KEY = Symbol.for("ask87_opencode.coordinator.v1");
const host = globalThis as typeof globalThis & { [KEY]?: Shared };
// One keyboard owner per server process, even when multiple project instances load the plugin.
export async function acquireCoordinator(): Promise<{ coordinator: Coordinator; release: () => Promise<void> }> {
  if (host[KEY]?.stopping) await host[KEY]!.stopping;
  const shared = host[KEY] ??= { coordinator: new Coordinator(), references: 0 };
  shared.references++;
  let released = false;
  return { coordinator: shared.coordinator, release: async () => {
    if (released) return;
    released = true;
    if (--shared.references === 0) {
      shared.stopping = shared.coordinator.stop().finally(() => { if (host[KEY] === shared) delete host[KEY]; });
      await shared.stopping;
    }
  } };
}
