import { Worker } from "node:worker_threads";
import type { KeyboardDevice } from "./keyboard-renderer.js";

export interface WorkerKeyboardDevice extends KeyboardDevice {
  /** Resolves only after the worker has actually exited (not merely after a timeout). */
  readonly released: Promise<void>;
}
export interface WorkerKeyboardOptions {
  workerURL?: URL;
  workerData?: unknown;
  openTimeoutMs?: number;
  requestTimeoutMs?: number;
}
interface Reply { id: number; ok: boolean; result?: { keys: string[]; slotKeys: string[] }; }
const OWNER = Symbol.for("ask87_opencode.keyboard-worker-owner.v1");
const owners = globalThis as typeof globalThis & { [OWNER]?: object };

/** The main thread never imports native HID code. At most one command may be in flight. */
export async function openWorkerKeyboard(options: WorkerKeyboardOptions = {}): Promise<WorkerKeyboardDevice> {
  if (owners[OWNER]) throw new Error("Previous keyboard worker is still releasing; retry later");
  const owner = {};
  owners[OWNER] = owner;
  const releaseOwner = () => { if (owners[OWNER] === owner) delete owners[OWNER]; };
  let worker: Worker;
  try {
    worker = new Worker(options.workerURL ?? new URL("./keyboard-worker.cjs", import.meta.url), {
      workerData: options.workerData,
    });
  } catch (error) { releaseOwner(); throw error; }
  let markReleased!: () => void;
  const released = new Promise<void>((resolve) => { markReleased = resolve; });
  let sequence = 0;
  let closed = false;
  let pending: { id: number; resolve: (reply: Reply) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> } | undefined;
  const stopWorker = () => { void worker.terminate().catch(() => {}); };
  const fail = (code: string) => {
    closed = true;
    if (pending) {
      clearTimeout(pending.timer);
      const request = pending;
      pending = undefined;
      request.reject(new Error(code));
    }
    stopWorker();
  };
  worker.on("error", () => fail("Keyboard worker failed"));
  worker.on("exit", () => { releaseOwner(); markReleased(); if (!closed) fail("Keyboard worker exited"); });
  worker.on("message", (reply: Reply) => {
    if (!reply || !pending || reply.id !== pending.id) return;
    const request = pending;
    pending = undefined;
    clearTimeout(request.timer);
    if (reply.ok) request.resolve(reply);
    else {
      request.reject(new Error("Keyboard operation failed"));
      fail("Keyboard operation failed");
    }
  });
  function request(operation: "open" | "frame" | "stop" | "close", frame?: Array<[string, readonly [number, number, number]]>): Promise<Reply> {
    if (closed) return Promise.reject(new Error("Keyboard worker closed"));
    if (pending) return Promise.reject(new Error("Keyboard request already in flight"));
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timeout = operation === "open" ? (options.openTimeoutMs ?? 3000) : (options.requestTimeoutMs ?? (operation === "frame" ? 2000 : 1000));
      const timer = setTimeout(() => fail("Keyboard request timed out"), timeout);
      pending = { id, resolve, reject, timer };
      try { worker.postMessage({ id, operation, ...(frame ? { frame } : {}) }); }
      catch { fail("Keyboard message failed"); }
    });
  }
  let opened: Reply;
  try { opened = await request("open"); }
  catch (error) {
    fail("Keyboard open failed");
    // Give normal termination a bounded chance to release the ownership lease.
    await Promise.race([released, new Promise<void>((resolve) => setTimeout(resolve, 100))]);
    throw error;
  }
  const metadata = opened.result;
  if (!metadata || !Array.isArray(metadata.keys) || !Array.isArray(metadata.slotKeys)
    || !metadata.keys.every((key) => typeof key === "string") || !metadata.slotKeys.every((key) => typeof key === "string")) {
    fail("Keyboard worker returned invalid metadata");
    throw new Error("Keyboard worker returned invalid metadata");
  }
  let closing = false;
  return {
    released,
    keys: metadata.keys,
    slotKeys: metadata.slotKeys,
    sendFrame: async (frame) => {
      if (closing) throw new Error("Keyboard worker closed");
      await request("frame", [...frame]);
    },
    stopRealtime: async () => {
      if (closing) return;
      await request("stop");
    },
    close: () => {
      if (closing || closed) return;
      closing = true;
      if (pending) { fail("Keyboard worker closed"); return; }
      void request("close").catch(() => {}).finally(() => { closed = true; stopWorker(); });
    },
  };
}
