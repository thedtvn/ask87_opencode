import { createRequire } from "node:module";
import type { Key, Rgb } from "../vendor/attack-shark-x87/lib/ask87_ts/dist/index.js";

const requireNative = createRequire(import.meta.url);

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

async function openNative(): Promise<KeyboardDevice> {
  // Vendored, prebuilt Windows x64 package avoids Git/remote dependency installation.
  const { Keyboard, Key } = requireNative("../vendor/attack-shark-x87") as typeof import("../vendor/attack-shark-x87/lib/ask87_ts/dist/index.js");
  const device = await Keyboard.openAsync();
  return {
    keys: Object.values(Key),
    slotKeys: [Key.DIGIT_1, Key.DIGIT_2, Key.DIGIT_3, Key.DIGIT_4, Key.DIGIT_5, Key.DIGIT_6, Key.DIGIT_7, Key.DIGIT_8, Key.DIGIT_9, Key.DIGIT_0],
    sendFrame: async (colors) => {
      const frame = new Map<Key, Rgb>();
      for (const [key, color] of colors) frame.set(key as Key, [...color]);
      await device.sendFrame(frame);
    },
    stopRealtime: () => device.stopRealtime(),
    close: () => device.close(),
  };
}

/** One latest-frame writer. No persistent lighting writes; no native import until start. */
export class KeyboardRenderer {
  private indicators: readonly KeyIndicator[] = [];
  private device: KeyboardDevice | undefined;
  private pending: Promise<void> | undefined;
  private cancelTimer: (() => void) | undefined;
  private active = false;
  private desired = false;
  private stopping: Promise<void> | undefined;
  private dirty = true;
  private retryAt = 0;
  private readonly open: () => Promise<KeyboardDevice>;
  private readonly now: () => number;
  private readonly schedule: NonNullable<RendererOptions["schedule"]>;
  private readonly warn: (message: string) => void;

  constructor(options: RendererOptions = {}) {
    this.open = options.open ?? openNative;
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
    this.dirty = true;
    void this.tick();
  }

  start(): void {
    this.desired = true;
    if (this.stopping || this.active) return;
    this.active = true;
    this.dirty = true;
    this.retryAt = 0;
    // Realtime mode requires a continuous 20–60 ms stream, including solid frames.
    // Blink phase still changes only every 500 ms.
    this.cancelTimer = this.schedule(() => { this.dirty = true; void this.tick(); }, 40);
    void this.tick();
  }

  /** Public for deterministic testing; concurrent ticks coalesce into the latest desired frame. */
  async tick(): Promise<void> {
    if (!this.active || this.now() < this.retryAt) return;
    if (this.pending) return this.pending;
    const work = this.writeLatest();
    this.pending = work;
    try { await work; } finally { this.pending = undefined; }
    if (this.active && this.dirty && this.now() >= this.retryAt) await this.tick();
  }

  private async writeLatest(): Promise<void> {
    try {
      if (!this.device) this.device = await this.open();
      while (this.active && this.dirty) {
        this.dirty = false;
        const frame = new Map<string, readonly [number, number, number]>();
        for (const key of this.device.keys) frame.set(key, COLORS.white);
        const on = Math.floor(this.now() / 500) % 2 === 0;
        this.device.slotKeys.forEach((key, index) => {
          const state = this.indicators[index];
          if (state) frame.set(key, state.blink && !on ? [0, 0, 0] : COLORS[state.color]);
        });
        await this.device.sendFrame(frame);
      }
    } catch {
      this.dirty = true;
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
    if (device) {
      try { await device.stopRealtime(); } catch { /* disconnected */ }
      finally { try { device.close(); } catch { /* already closed */ } }
    }
  }
}
