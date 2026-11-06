import { openWorkerKeyboard } from "./keyboard-device.js";

export interface KeyIndicator {
  color: "white" | "green" | "blue" | "red";
  blink: boolean;
}
export interface KeyboardDevice {
  keys: readonly string[];
  slotKeys: readonly string[];
  sendFrame(colors: ReadonlyMap<string, readonly [number, number, number]>): Promise<void>;
  stopRealtime(): Promise<void>;
  close(): void;
}
export interface RendererOptions {
  open?: () => Promise<KeyboardDevice>;
  now?: () => number;
  schedule?: (callback: () => void, milliseconds: number) => () => void;
  warn?: (message: string) => void;
}
const COLORS = {
  white: [255, 255, 255], green: [0, 255, 0], blue: [0, 0, 255], red: [255, 0, 0],
} as const;
const MIN_FRAME_INTERVAL = 100;
const HALF_BLINK_PERIOD = 500;

/** Latest visual state only; no repeated solid frames, overlapping writes, or native main-thread calls. */
export class KeyboardRenderer {
  private indicators: readonly KeyIndicator[] = [];
  private device: KeyboardDevice | undefined;
  private pending: Promise<void> | undefined;
  private cancelTimer: (() => void) | undefined;
  private active = false;
  private desired = false;
  private stopping: Promise<void> | undefined;
  private retryAt = 0;
  private lastSendAt = -Infinity;
  private lastFrame = "";
  private readonly open: () => Promise<KeyboardDevice>;
  private readonly now: () => number;
  private readonly schedule: NonNullable<RendererOptions["schedule"]>;
  private readonly warn: (message: string) => void;

  constructor(options: RendererOptions = {}) {
    this.open = options.open ?? openWorkerKeyboard;
    this.now = options.now ?? (() => performance.now());
    this.schedule = options.schedule ?? ((callback, ms) => {
      const timer = setInterval(callback, ms);
      timer.unref();
      return () => clearInterval(timer);
    });
    this.warn = options.warn ?? (() => console.warn("[ask87] Keyboard unavailable; retrying"));
  }

  setIndicators(indicators: readonly KeyIndicator[]): void {
    this.indicators = indicators.map((item) => ({ ...item }));
    void this.tick();
  }

  start(): void {
    this.desired = true;
    if (this.stopping || this.active) return;
    this.active = true;
    this.retryAt = 0;
    this.lastSendAt = -Infinity;
    this.lastFrame = "";
    // This timer checks state; it does NOT send a frame on each tick.
    this.cancelTimer = this.schedule(() => { void this.tick(); }, 50);
    void this.tick();
  }

  async tick(): Promise<void> {
    if (this.pending) return this.pending;
    if (!this.active || this.now() < this.retryAt || this.now() - this.lastSendAt < MIN_FRAME_INTERVAL) return;
    const work = this.writeLatest();
    this.pending = work;
    try { await work; } finally { this.pending = undefined; }
    // Never drain a backlog: the next scheduler tick renders the newest state only.
  }

  private async writeLatest(): Promise<void> {
    try {
      if (!this.device) this.device = await this.open();
      if (!this.active) return;
      const frame = new Map<string, readonly [number, number, number]>();
      for (const key of this.device.keys) frame.set(key, COLORS.white);
      const on = Math.floor(this.now() / HALF_BLINK_PERIOD) % 2 === 0;
      this.device.slotKeys.forEach((key, index) => {
        const state = this.indicators[index];
        if (state) frame.set(key, state.blink && !on ? [0, 0, 0] : COLORS[state.color]);
      });
      const signature = JSON.stringify([...frame]);
      if (signature === this.lastFrame) return;
      this.lastSendAt = this.now();
      await this.device.sendFrame(frame);
      this.lastFrame = signature; // Failed frames must be eligible for retry.
    } catch {
      this.lastFrame = "";
      this.retryAt = this.now() + 5000;
      const failed = this.device;
      this.device = undefined;
      try { failed?.close(); } catch { /* disconnected */ }
      this.warn("[ask87] Keyboard unavailable; retrying");
    }
  }

  stop(): Promise<void> {
    this.desired = false;
    if (this.stopping) return this.stopping;
    const work = this.shutdown();
    this.stopping = work.finally(() => {
      this.stopping = undefined;
      if (this.desired) this.start();
    });
    return this.stopping;
  }

  private async shutdown(): Promise<void> {
    this.active = false;
    this.cancelTimer?.();
    this.cancelTimer = undefined;
    await this.pending;
    const device = this.device;
    this.device = undefined;
    this.lastFrame = "";
    if (device) {
      try { await device.stopRealtime(); } catch { /* disconnected */ }
      finally { try { device.close(); } catch { /* already closed */ } }
    }
  }
}
