"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/broker-main.ts
var broker_main_exports = {};
__export(broker_main_exports, {
  startBroker: () => startBroker
});
module.exports = __toCommonJS(broker_main_exports);
var import_node_net = __toESM(require("node:net"), 1);
var import_node_crypto2 = require("node:crypto");
var import_promises = require("node:fs/promises");
var import_node_url = require("node:url");
var import_node_path2 = __toESM(require("node:path"), 1);

// src/keyboard-device.ts
var import_node_worker_threads = require("node:worker_threads");
var import_meta = {};
var OWNER = /* @__PURE__ */ Symbol.for("ask87_opencode.keyboard-worker-owner.v1");
var owners = globalThis;
async function openWorkerKeyboard(options = {}) {
  if (owners[OWNER]) throw new Error("Previous keyboard worker is still releasing; retry later");
  const owner = {};
  owners[OWNER] = owner;
  const releaseOwner = () => {
    if (owners[OWNER] === owner) delete owners[OWNER];
  };
  let worker;
  try {
    worker = new import_node_worker_threads.Worker(options.workerURL ?? new URL("./keyboard-worker.cjs", import_meta.url), {
      workerData: options.workerData
    });
  } catch (error) {
    releaseOwner();
    throw error;
  }
  let markReleased;
  const released = new Promise((resolve) => {
    markReleased = resolve;
  });
  let sequence = 0;
  let closed = false;
  let pending;
  const stopWorker = () => {
    void worker.terminate().catch(() => {
    });
  };
  const fail = (code) => {
    closed = true;
    if (pending) {
      clearTimeout(pending.timer);
      const request2 = pending;
      pending = void 0;
      request2.reject(new Error(code));
    }
    stopWorker();
  };
  worker.on("error", () => fail("Keyboard worker failed"));
  worker.on("exit", () => {
    releaseOwner();
    markReleased();
    if (!closed) fail("Keyboard worker exited");
  });
  worker.on("message", (reply) => {
    if (!reply || !pending || reply.id !== pending.id) return;
    const request2 = pending;
    pending = void 0;
    clearTimeout(request2.timer);
    if (reply.ok) request2.resolve(reply);
    else {
      request2.reject(new Error("Keyboard operation failed"));
      fail("Keyboard operation failed");
    }
  });
  function request(operation, frame) {
    if (closed) return Promise.reject(new Error("Keyboard worker closed"));
    if (pending) return Promise.reject(new Error("Keyboard request already in flight"));
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timeout = operation === "open" ? options.openTimeoutMs ?? 3e3 : options.requestTimeoutMs ?? (operation === "frame" ? 2e3 : 1e3);
      const timer = setTimeout(() => fail("Keyboard request timed out"), timeout);
      pending = { id, resolve, reject, timer };
      try {
        worker.postMessage({ id, operation, ...frame ? { frame } : {} });
      } catch {
        fail("Keyboard message failed");
      }
    });
  }
  let opened;
  try {
    opened = await request("open");
  } catch (error) {
    fail("Keyboard open failed");
    await Promise.race([released, new Promise((resolve) => setTimeout(resolve, 100))]);
    throw error;
  }
  const metadata = opened.result;
  if (!metadata || !Array.isArray(metadata.keys) || !Array.isArray(metadata.slotKeys) || !metadata.keys.every((key) => typeof key === "string") || !metadata.slotKeys.every((key) => typeof key === "string")) {
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
      if (pending) {
        fail("Keyboard worker closed");
        return;
      }
      void request("close").catch(() => {
      }).finally(() => {
        closed = true;
        stopWorker();
      });
    }
  };
}

// src/keyboard-renderer.ts
var COLORS = {
  white: [255, 255, 255],
  green: [0, 255, 0],
  blue: [0, 0, 255],
  red: [255, 0, 0]
};
var MIN_FRAME_INTERVAL = 100;
var HALF_BLINK_PERIOD = 500;
var KeyboardRenderer = class {
  indicators = [];
  device;
  pending;
  cancelTimer;
  active = false;
  desired = false;
  stopping;
  retryAt = 0;
  lastSendAt = -Infinity;
  lastFrame = "";
  open;
  now;
  schedule;
  warn;
  constructor(options = {}) {
    this.open = options.open ?? openWorkerKeyboard;
    this.now = options.now ?? (() => performance.now());
    this.schedule = options.schedule ?? ((callback, ms) => {
      const timer = setInterval(callback, ms);
      timer.unref();
      return () => clearInterval(timer);
    });
    this.warn = options.warn ?? (() => console.warn("[ask87] Keyboard unavailable; retrying"));
  }
  setIndicators(indicators) {
    this.indicators = indicators.map((item) => ({ ...item }));
    void this.tick();
  }
  start() {
    this.desired = true;
    if (this.stopping || this.active) return;
    this.active = true;
    this.retryAt = 0;
    this.lastSendAt = -Infinity;
    this.lastFrame = "";
    this.cancelTimer = this.schedule(() => {
      void this.tick();
    }, 50);
    void this.tick();
  }
  async tick() {
    if (this.pending) return this.pending;
    if (!this.active || this.now() < this.retryAt || this.now() - this.lastSendAt < MIN_FRAME_INTERVAL) return;
    const work = this.writeLatest();
    this.pending = work;
    try {
      await work;
    } finally {
      this.pending = void 0;
    }
  }
  async writeLatest() {
    try {
      if (!this.device) this.device = await this.open();
      if (!this.active) return;
      const frame = /* @__PURE__ */ new Map();
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
      this.lastFrame = signature;
    } catch {
      this.lastFrame = "";
      this.retryAt = this.now() + 5e3;
      const failed = this.device;
      this.device = void 0;
      try {
        failed?.close();
      } catch {
      }
      this.warn("[ask87] Keyboard unavailable; retrying");
    }
  }
  stop() {
    this.desired = false;
    if (this.stopping) return this.stopping;
    const work = this.shutdown();
    this.stopping = work.finally(() => {
      this.stopping = void 0;
      if (this.desired) this.start();
    });
    return this.stopping;
  }
  async shutdown() {
    this.active = false;
    this.cancelTimer?.();
    this.cancelTimer = void 0;
    await this.pending;
    const device = this.device;
    this.device = void 0;
    this.lastFrame = "";
    if (device) {
      try {
        await device.stopRealtime();
      } catch {
      } finally {
        try {
          device.close();
        } catch {
        }
      }
    }
  }
};

// src/session-bank.ts
var SLOT_COUNT = 10;
var SessionBank = class {
  parents = /* @__PURE__ */ new Map();
  defined = /* @__PURE__ */ new Set();
  records = /* @__PURE__ */ new Map();
  presence = /* @__PURE__ */ new Map();
  slots = new Array(SLOT_COUNT).fill(void 0);
  activations = [];
  everPresent = /* @__PURE__ */ new Set();
  /** Register session metadata. A missing parentID never clears a known parent. Child may precede parent. */
  defineSession(id, parentID) {
    if (!id) return;
    this.defined.add(id);
    if (parentID && parentID !== id) this.parents.set(id, parentID);
    this.reconcile();
  }
  /** True if metadata was defined or the id is a root listed by some client. */
  hasSession(id) {
    return this.defined.has(id) || this.isPresent(id);
  }
  getParent(id) {
    return this.parents.get(id);
  }
  /** Top of the known ancestor chain; stops at a presence-listed root. Unknown ancestor id is returned as-is. */
  rootOf(id) {
    const seen = /* @__PURE__ */ new Set();
    let cur = id;
    while (!seen.has(cur) && !this.isPresent(cur)) {
      seen.add(cur);
      const p = this.parents.get(cur);
      if (p === void 0) break;
      cur = p;
    }
    return cur;
  }
  /** Slot index (0..9) of the group containing id, if its root holds a slot. */
  slotOf(id) {
    const i = this.slots.indexOf(this.rootOf(id));
    return i < 0 ? void 0 : i;
  }
  /** Replace the set of root session tabs listed by one client. */
  syncPresence(clientID, rootIDs) {
    const next = /* @__PURE__ */ new Set();
    for (const id of rootIDs) if (id) next.add(id);
    if (next.size === 0) this.presence.delete(clientID);
    else this.presence.set(clientID, next);
    this.reconcile();
  }
  releaseClient(clientID) {
    if (this.presence.delete(clientID)) this.reconcile();
  }
  presentRoots() {
    return [...new Set([...this.presence.values()].flatMap((roots) => [...roots]))];
  }
  /** Replace authoritative pending snapshots after reconnect; live events are serialized after this. */
  replacePermissions(id, requestIDs) {
    this.record(id).perms = new Set(requestIDs);
  }
  replaceQuestions(id, formIDs) {
    this.record(id).forms = new Set(formIDs);
  }
  resetExecution(id) {
    const entry = this.records.get(id);
    if (entry) delete entry.exec;
  }
  activate(id) {
    const root = this.rootOf(id);
    if (!this.activations.includes(root)) this.activations.push(root);
    this.reconcile();
  }
  execution(id, state) {
    if (!id) return;
    const r = this.record(id);
    r.exec = state;
    if (state === "running") this.activate(id);
  }
  permission(id, requestID, pending) {
    if (pending) this.activate(id);
    this.setPending(id, "perms", requestID, pending);
  }
  question(id, formID, pending) {
    if (pending) this.activate(id);
    this.setPending(id, "forms", formID, pending);
  }
  /** Always 10 entries, indexed by slot. Unassigned slots are white solid. */
  snapshot() {
    const agg = /* @__PURE__ */ new Map();
    for (const root of this.slots) if (root) agg.set(root, { perm: false, form: false, run: false, any: false });
    for (const [id, r] of this.records) {
      const a = agg.get(this.rootOf(id));
      if (!a) continue;
      if (r.perms.size) a.perm = true;
      if (r.forms.size) a.form = true;
      if (r.exec === "running") a.run = true;
      if (r.exec) a.any = true;
    }
    return this.slots.map((root) => {
      const a = root && agg.get(root);
      if (!root || !a) return { color: "white", blink: false };
      if (a.perm) return { sessionID: root, color: "red", blink: true };
      if (a.form) return { sessionID: root, color: "blue", blink: true };
      if (a.run) {
        const mainState = this.records.get(root)?.exec;
        const mainStopped = mainState !== void 0 && mainState !== "running";
        return { sessionID: root, color: mainStopped ? "green" : "white", blink: true };
      }
      if (a.any) return { sessionID: root, color: "green", blink: false };
      return { sessionID: root, color: "white", blink: false };
    });
  }
  record(id) {
    let r = this.records.get(id);
    if (!r) this.records.set(id, r = { perms: /* @__PURE__ */ new Set(), forms: /* @__PURE__ */ new Set() });
    return r;
  }
  setPending(id, key, pid, pending) {
    if (!id || !pid) return;
    if (pending) this.record(id)[key].add(pid);
    else this.records.get(id)?.[key].delete(pid);
  }
  isPresent(id) {
    for (const s of this.presence.values()) if (s.has(id)) return true;
    return false;
  }
  /** Only tasks that started reserve keys; last-tab closure compacts the activation order. */
  reconcile() {
    const live = /* @__PURE__ */ new Set();
    for (const roots of this.presence.values()) for (const id of roots) live.add(this.rootOf(id));
    const canonical = [...new Set(this.activations.map((id) => this.rootOf(id)))];
    this.activations = canonical.filter((id) => live.has(id) || !this.everPresent.has(id));
    for (const id of live) this.everPresent.add(id);
    const ordered = this.activations.filter((id) => live.has(id));
    for (let i = 0; i < SLOT_COUNT; i++) this.slots[i] = ordered[i];
  }
};

// src/client-controller.ts
var ClientController = class {
  bank = new SessionBank();
  clients = /* @__PURE__ */ new Map();
  active = false;
  liveSessions = /* @__PURE__ */ new Set();
  renderer;
  constructor(options = {}) {
    this.renderer = options.renderer ?? new KeyboardRenderer({ open: () => openWorkerKeyboard(options.workerURL ? { workerURL: options.workerURL } : {}) });
  }
  sync(clientID, sessions) {
    this.clients.set(clientID, sessions);
    this.reconcile();
  }
  release(clientID) {
    this.clients.delete(clientID);
    this.bank.releaseClient(clientID);
    this.reconcile();
  }
  reconcile() {
    const merged = /* @__PURE__ */ new Map();
    for (const sessions of this.clients.values()) for (const session of sessions) {
      const previous = merged.get(session.id);
      if (!previous) merged.set(session.id, { ...session });
      else merged.set(session.id, {
        ...previous,
        state: previous.state === "running" || session.state === "running" ? "running" : previous.state !== "idle" ? previous.state : session.state,
        ...previous.parentID ?? session.parentID ? { parentID: previous.parentID ?? session.parentID } : {},
        open: previous.open || session.open,
        permissionIDs: [.../* @__PURE__ */ new Set([...previous.permissionIDs, ...session.permissionIDs])],
        questionIDs: [.../* @__PURE__ */ new Set([...previous.questionIDs, ...session.questionIDs])],
        ...session.startedAt !== void 0 ? { startedAt: Math.min(previous.startedAt ?? Infinity, session.startedAt) } : {}
      });
    }
    for (const id of this.liveSessions) if (!merged.has(id)) {
      this.bank.resetExecution(id);
      this.bank.replacePermissions(id, []);
      this.bank.replaceQuestions(id, []);
    }
    this.liveSessions.clear();
    for (const session of merged.values()) {
      this.liveSessions.add(session.id);
      this.bank.defineSession(session.id, session.parentID);
    }
    for (const [clientID, sessions] of this.clients) this.bank.syncPresence(clientID, sessions.filter((session) => session.open).map((session) => session.id));
    const ordered = [...merged.values()].sort((a, b) => (a.startedAt ?? Infinity) - (b.startedAt ?? Infinity));
    for (const session of ordered) {
      if (session.startedAt !== void 0) this.bank.activate(session.id);
      if (session.state === "idle") this.bank.resetExecution(session.id);
      else this.bank.execution(session.id, session.state);
      this.bank.replacePermissions(session.id, session.permissionIDs);
      this.bank.replaceQuestions(session.id, session.questionIDs);
    }
    const next = this.clients.size > 0;
    if (next !== this.active) {
      this.active = next;
      if (next) this.renderer.start();
      else void this.renderer.stop();
    }
    this.renderer.setIndicators(this.bank.snapshot());
  }
  async stop() {
    this.clients.clear();
    this.active = false;
    await this.renderer.stop();
  }
};

// src/client-state.ts
function parseClientSnapshot(input) {
  if (!input || typeof input !== "object") throw new Error("Invalid snapshot");
  const value = input;
  if (typeof value.clientID !== "string" || !value.clientID || value.clientID.length > 200 || !Number.isSafeInteger(value.sequence) || value.sequence < 0 || value.closed !== void 0 && typeof value.closed !== "boolean" || !Array.isArray(value.sessions) || value.sessions.length > 2e3) throw new Error("Invalid snapshot");
  const sessions = value.sessions.map((raw) => {
    if (!raw || typeof raw !== "object") throw new Error("Invalid session");
    const session = raw;
    const identifiers = (ids) => Array.isArray(ids) && ids.length <= 500 && ids.every((id) => typeof id === "string" && id.length <= 500);
    if (typeof session.id !== "string" || !session.id || session.id.length > 2e3 || session.parentID !== void 0 && typeof session.parentID !== "string" || !["idle", "running", "done", "failed", "interrupted"].includes(session.state) || typeof session.open !== "boolean" || !identifiers(session.permissionIDs) || !identifiers(session.questionIDs) || session.startedAt !== void 0 && (typeof session.startedAt !== "number" || !Number.isFinite(session.startedAt))) throw new Error("Invalid session");
    return {
      id: session.id,
      state: session.state,
      open: session.open,
      permissionIDs: session.permissionIDs,
      questionIDs: session.questionIDs,
      ...typeof session.parentID === "string" ? { parentID: session.parentID } : {},
      ...typeof session.startedAt === "number" ? { startedAt: session.startedAt } : {}
    };
  });
  return { clientID: value.clientID, sequence: value.sequence, sessions, ...typeof value.closed === "boolean" ? { closed: value.closed } : {} };
}

// src/broker-paths.ts
var import_node_os = require("node:os");
var import_node_path = require("node:path");
var import_node_crypto = require("node:crypto");
function getBrokerPaths() {
  const cacheDir = (0, import_node_path.join)((0, import_node_os.homedir)(), ".cache", "ask87-opencode");
  const key = (0, import_node_crypto.createHash)("sha256").update(`${(0, import_node_os.homedir)()}:v2`).digest("hex").slice(0, 20);
  return { cacheDir, endpoint: process.platform === "win32" ? `\\\\.\\pipe\\ask87-${key}` : (0, import_node_path.join)(cacheDir, "broker-v2.sock"), stateFile: (0, import_node_path.join)(cacheDir, "broker-v2.json"), lock: (0, import_node_path.join)(cacheDir, "startup-v2.lock") };
}
function proof(token, nonce, side) {
  return (0, import_node_crypto.createHmac)("sha256", token).update(`${side}:${nonce}`).digest("hex");
}
function equalProof(actual, expected) {
  if (typeof actual !== "string" || actual.length !== expected.length) return false;
  return (0, import_node_crypto.timingSafeEqual)(Buffer.from(actual), Buffer.from(expected));
}

// src/broker-main.ts
async function startBroker(options = {}) {
  const paths = getBrokerPaths();
  await (0, import_promises.mkdir)(paths.cacheDir, { recursive: true, mode: 448 });
  const endpoint = options.endpoint ?? paths.endpoint;
  const stateFile = options.stateFile ?? paths.stateFile;
  const token = (0, import_node_crypto2.randomBytes)(32).toString("hex");
  const entry = (0, import_node_url.pathToFileURL)(import_node_path2.default.resolve(process.argv[1] ?? "dist/broker.cjs"));
  const controller = options.controller ?? new ClientController({ workerURL: new URL("../src/keyboard-worker.cjs", entry) });
  const clients = /* @__PURE__ */ new Map();
  const sockets = /* @__PURE__ */ new Set();
  let idleSince = performance.now();
  let stopping = false;
  const release = (id) => {
    clients.delete(id);
    controller.release(id);
    if (!clients.size) idleSince = performance.now();
  };
  const server = import_node_net.default.createServer((socket) => {
    if (stopping) {
      socket.destroy();
      return;
    }
    sockets.add(socket);
    const nonce = (0, import_node_crypto2.randomBytes)(24).toString("hex");
    let authenticated = false, buffer = "";
    socket.setEncoding("utf8");
    socket.setTimeout(3e3, () => {
      if (!authenticated) socket.destroy();
    });
    socket.write(JSON.stringify({ nonce, proof: proof(token, nonce, "server"), protocol: 2 }) + "\n");
    socket.on("data", (chunk) => {
      buffer += chunk;
      if (Buffer.byteLength(buffer) > 1024 * 1024) {
        socket.destroy();
        return;
      }
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        try {
          const message = JSON.parse(line);
          if (!authenticated) {
            if (!equalProof(message.proof, proof(token, nonce, "client"))) {
              socket.destroy();
              return;
            }
            authenticated = true;
            socket.setTimeout(0);
            socket.write('{"ready":true}\n');
            continue;
          }
          const input = parseClientSnapshot(message.snapshot);
          const previous = clients.get(input.clientID);
          if (previous && previous.socket !== socket) throw new Error("Client owner mismatch");
          if (!previous || input.sequence > previous.sequence) {
            if (input.closed) release(input.clientID);
            else {
              clients.set(input.clientID, { socket, sequence: input.sequence, expires: performance.now() + 3e4 });
              controller.sync(input.clientID, input.sessions);
            }
          }
          socket.write(JSON.stringify({ id: message.id, ok: true }) + "\n");
        } catch {
          socket.write('{"ok":false}\n');
          socket.destroy();
        }
      }
    });
    socket.on("error", () => {
    });
    socket.on("close", () => {
      sockets.delete(socket);
      for (const [id, client] of clients) if (client.socket === socket) release(id);
    });
  });
  const listen = () => new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListen);
      reject(error);
    };
    const onListen = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListen);
    server.listen(endpoint);
  });
  try {
    await listen();
  } catch (error) {
    if (process.platform !== "win32" && error.code === "EADDRINUSE") {
      const alive = await new Promise((resolve) => {
        const socket = import_node_net.default.connect(endpoint);
        socket.once("connect", () => {
          socket.destroy();
          resolve(true);
        });
        socket.once("error", () => resolve(false));
      });
      if (alive) throw error;
      await (0, import_promises.unlink)(endpoint);
      await listen();
    } else throw error;
  }
  await (0, import_promises.writeFile)(stateFile, JSON.stringify({ token, pid: process.pid, protocol: 2 }), { mode: 384 });
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    clearInterval(timer);
    for (const socket of sockets) socket.destroy();
    await controller.stop();
    await new Promise((resolve) => server.close(() => resolve()));
    let ownsEndpoint = false;
    try {
      const state = JSON.parse(await (0, import_promises.readFile)(stateFile, "utf8"));
      if (state.pid === process.pid) {
        ownsEndpoint = true;
        await (0, import_promises.unlink)(stateFile);
      }
    } catch {
    }
    if (ownsEndpoint && process.platform !== "win32") {
      try {
        await (0, import_promises.unlink)(endpoint);
      } catch {
      }
    }
  };
  const timer = setInterval(() => {
    for (const [id, client] of clients) if (client.expires <= performance.now()) release(id);
    if (!clients.size && !sockets.size && performance.now() - idleSince > (options.idleMs ?? 1e4)) void stop();
  }, 1e3);
  return { endpoint, token, stop };
}
if (process.argv.includes("--serve")) {
  startBroker().then((broker) => {
    process.once("SIGTERM", () => {
      void broker.stop();
    });
    process.once("SIGINT", () => {
      void broker.stop();
    });
  }).catch(() => {
    process.exitCode = 1;
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  startBroker
});
