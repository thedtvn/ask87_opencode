"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Watcher = exports.connectionStatus = exports.Keyboard = exports.validateMacros = exports.MacroEvent = exports.decodeAction = exports.encodeAction = exports.KeyAction = exports.effectId = exports.LAYOUT = exports.KeyGroups = exports.Keys = exports.IMAGE_HEIGHT = exports.IMAGE_WIDTH = exports.Rect = exports.DeviceError = exports.AsleepError = exports.InvalidArgumentError = exports.NotFoundError = exports.X87Error = exports.VERSION = exports.KeyGroup = exports.Key = exports.Effect = exports.ControllerAction = void 0;
exports.keys = keys;
exports.keysRect = keysRect;
exports.controllerInfo = controllerInfo;
/**
 * Typed Node.js API for the ATTACK SHARK X87 keyboard (USB and 2.4G).
 *
 * ```ts
 * import { Keyboard, Effect, Key, KeyAction } from 'attack-shark-x87';
 *
 * const kb = Keyboard.open();
 * await kb.setEffect(Effect.FIXED_ON, { brightness: 4 });
 * await kb.remapKey(0, Key.CAPS_LOCK, KeyAction.key(0x29)); // Esc
 * ```
 */
const node_events_1 = require("node:events");
const enums_1 = require("./enums");
Object.defineProperty(exports, "ControllerAction", { enumerable: true, get: function () { return enums_1.ControllerAction; } });
Object.defineProperty(exports, "Effect", { enumerable: true, get: function () { return enums_1.Effect; } });
Object.defineProperty(exports, "Key", { enumerable: true, get: function () { return enums_1.Key; } });
Object.defineProperty(exports, "KeyGroup", { enumerable: true, get: function () { return enums_1.KeyGroup; } });
// The compiled Rust module (lib/ask87_ts/src), typed by its generated native.d.ts.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nativeTarget = (() => {
    const key = `${process.platform}-${process.arch}`;
    const target = {
        'win32-x64': 'win32-x64',
        'win32-arm64': 'win32-arm64',
        'linux-x64': 'linux-x64-gnu',
        'linux-arm64': 'linux-arm64-gnu',
        'darwin-x64': 'darwin-x64',
        'darwin-arm64': 'darwin-arm64',
    }[key];
    if (!target) throw new Error(`Unsupported ATTACK SHARK X87 native platform: ${key}`);
    if (process.platform === 'linux') {
        const report = process.report?.getReport?.();
        if (!report?.header?.glibcVersionRuntime) throw new Error('Linux native binding requires glibc');
    }
    return target;
})();
const native = require(`../native/${nativeTarget}/ask87.node`);
exports.VERSION = native.version();
// ---- errors -----------------------------------------------------------------
/** Base error for ATTACK SHARK X87 operations. */
class X87Error extends Error {
    name = 'X87Error';
}
exports.X87Error = X87Error;
/** No keyboard (USB or 2.4G receiver) was found. */
class NotFoundError extends X87Error {
    name = 'NotFoundError';
}
exports.NotFoundError = NotFoundError;
/** An argument was rejected before talking to the keyboard. */
class InvalidArgumentError extends X87Error {
    name = 'InvalidArgumentError';
}
exports.InvalidArgumentError = InvalidArgumentError;
/** The 2.4G keyboard is asleep or off; press any key to wake it and retry. */
class AsleepError extends X87Error {
    name = 'AsleepError';
}
exports.AsleepError = AsleepError;
/** The keyboard returned an unexpected response, timed out or disconnected. */
class DeviceError extends X87Error {
    name = 'DeviceError';
}
exports.DeviceError = DeviceError;
/** Map native `[Code] message` errors to the classes above. */
function wrapError(e) {
    if (!(e instanceof Error))
        return new X87Error(String(e));
    const m = /^\[(\w+)\] ([\s\S]*)$/.exec(e.message);
    if (!m)
        return e;
    const [, code, msg] = m;
    const Cls = code === 'NotFound'
        ? NotFoundError
        : code === 'InvalidArgument'
            ? InvalidArgumentError
            : code === 'Asleep'
                ? AsleepError
                : DeviceError;
    return new Cls(msg, { cause: e });
}
function call(f) {
    try {
        return f();
    }
    catch (e) {
        throw wrapError(e);
    }
}
async function callAsync(f) {
    try {
        return await call(f);
    }
    catch (e) {
        throw e instanceof X87Error ? e : wrapError(e);
    }
}
// ---- layout -------------------------------------------------------------------
/** A rectangle in vendor keyboard-image pixels (x2/y2 exclusive). */
class Rect {
    x1;
    y1;
    x2;
    y2;
    constructor(x1, y1, x2, y2) {
        this.x1 = x1;
        this.y1 = y1;
        this.x2 = x2;
        this.y2 = y2;
    }
    get width() {
        return this.x2 - this.x1;
    }
    get height() {
        return this.y2 - this.y1;
    }
    contains(x, y) {
        return this.x1 <= x && x < this.x2 && this.y1 <= y && y < this.y2;
    }
}
exports.Rect = Rect;
const rect = (r) => new Rect(r.x1, r.y1, r.x2, r.y2);
const IMAGE = native.imageSize();
exports.IMAGE_WIDTH = IMAGE.width;
exports.IMAGE_HEIGHT = IMAGE.height;
const keyInfo = new Map(native.keyTable().map((k) => [k.name, k]));
const groupInfo = new Map(native.groupTable().map((g) => [g.name, g]));
const controllers = new Map(native.controllerTable().map((c) => [c.name, c]));
const effectIds = new Map(native.effectTable().map((e) => [e.name, e.id]));
function info(map, k, what) {
    const v = map.get(k);
    if (v === undefined)
        throw new InvalidArgumentError(`unknown ${what}: ${String(k)}`);
    return v;
}
/** Metadata for a {@link Key}. */
exports.Keys = {
    /** Every key, in keyboard order. */
    all: () => [...keyInfo.keys()],
    /** Printed legend, e.g. "Caps Lock". */
    label: (k) => info(keyInfo, k, 'key').label,
    /** Hardware LED / key-matrix index. */
    index: (k) => info(keyInfo, k, 'key').index,
    rect: (k) => rect(info(keyInfo, k, 'key').rect),
    /** The area (FKey, Main, Navigation, Arrows) containing the key. */
    group: (k) => info(keyInfo, k, 'key').group,
    cluster: (k) => info(keyInfo, k, 'key').cluster,
    /** Row 0..5, top to bottom. */
    row: (k) => info(keyInfo, k, 'key').row,
    left: (k) => (info(keyInfo, k, 'key').left ?? null),
    right: (k) => (info(keyInfo, k, 'key').right ?? null),
    /** The key under a point of the vendor keyboard image. */
    at: (x, y) => (native.keyAt(x, y) ?? null),
};
/** Metadata for a {@link KeyGroup}. */
exports.KeyGroups = {
    all: () => [...groupInfo.keys()],
    /** The four areas, top-left to bottom-right. */
    areas: () => [...groupInfo.values()].filter((g) => g.isArea).map((g) => g.name),
    /** The physical clusters, in keyboard order. */
    clusters: () => exports.LAYOUT.flat(),
    isArea: (g) => info(groupInfo, g, 'key group').isArea,
    /** Clusters of adjacent keys (an area has several, a cluster one). */
    layout: (g) => info(groupInfo, g, 'key group').layout.map((c) => c.map((k) => k)),
    keys: (g) => exports.KeyGroups.layout(g).flat(),
    rect: (g) => rect(info(groupInfo, g, 'key group').rect),
    /** The area under a point of the vendor keyboard image. */
    at: (x, y) => (native.groupAt(x, y) ?? null),
};
const isKey = (x) => typeof x === 'string' && keyInfo.has(x);
/**
 * Combine keys and groups into one ordered key list (duplicates dropped);
 * the TypeScript counterpart of Python's `KeyGroup.A + KeyGroup.B`.
 *
 * ```ts
 * const row = keys(KeyGroup.NUMBER_ROW, KeyGroup.INSERT_HOME_PGUP);
 * const wasd = keys(Key.W, Key.A, Key.S, Key.D);
 * ```
 */
function keys(...parts) {
    const out = new Set();
    for (const p of parts) {
        if (isKey(p))
            out.add(p);
        else if (typeof p === 'string')
            for (const k of exports.KeyGroups.keys(p))
                out.add(k);
        else
            for (const k of p)
                out.add(k);
    }
    return [...out];
}
/** Bounding box of a set of keys. */
function keysRect(ks) {
    const rs = [...ks].map((k) => exports.Keys.rect(k));
    if (!rs.length)
        throw new InvalidArgumentError('no keys');
    return new Rect(Math.min(...rs.map((r) => r.x1)), Math.min(...rs.map((r) => r.y1)), Math.max(...rs.map((r) => r.x2)), Math.max(...rs.map((r) => r.y2)));
}
/** Physical layout: keyboard -> row -> cluster. */
exports.LAYOUT = native
    .layoutTable()
    .map((row) => row.map((c) => c));
/** Hardware id of an {@link Effect}. */
const effectId = (e) => info(effectIds, e, 'effect');
exports.effectId = effectId;
function controllerInfo(a) {
    const c = info(controllers, a, 'controller action');
    return { label: c.label, factoryKey: c.factoryKey, sensitive: c.sensitive };
}
exports.KeyAction = {
    none: () => ({ kind: 'none' }),
    key: (usage, modifiers = 0, usage2 = 0) => ({ kind: 'key', modifiers, usage, usage2 }),
    consumer: (usage) => ({ kind: 'consumer', usage }),
    mouse: (button) => ({ kind: 'mouse', button }),
    fn: () => ({ kind: 'fn' }),
    fn2: () => ({ kind: 'fn2' }),
    macro: (slot, repeat = 1) => ({ kind: 'macro', slot, repeat }),
    control: (action) => ({ kind: 'controller', action }),
    raw: (value) => ({ kind: 'raw', value }),
};
const REPEAT_TO_NATIVE = { untilReleased: 'until_released', untilAnyKey: 'until_any_key' };
function actionToNative(a) {
    switch (a.kind) {
        case 'key':
            return { kind: a.kind, modifiers: a.modifiers, usage: a.usage, usage2: a.usage2 };
        case 'consumer':
            return { kind: a.kind, usage: a.usage };
        case 'mouse':
            return { kind: a.kind, button: a.button };
        case 'macro':
            return typeof a.repeat === 'number'
                ? { kind: a.kind, slot: a.slot, repeat: 'times', count: a.repeat }
                : { kind: a.kind, slot: a.slot, repeat: REPEAT_TO_NATIVE[a.repeat] };
        case 'controller':
            return { kind: a.kind, action: a.action };
        case 'raw':
            return { kind: a.kind, value: a.value };
        default:
            return { kind: a.kind };
    }
}
function actionFromNative(a) {
    switch (a.kind) {
        case 'key':
            return exports.KeyAction.key(a.usage ?? 0, a.modifiers ?? 0, a.usage2 ?? 0);
        case 'consumer':
            return exports.KeyAction.consumer(a.usage ?? 0);
        case 'mouse':
            return exports.KeyAction.mouse(a.button ?? 0);
        case 'fn':
            return exports.KeyAction.fn();
        case 'fn2':
            return exports.KeyAction.fn2();
        case 'macro': {
            const repeat = a.repeat === 'until_released' ? 'untilReleased' : a.repeat === 'until_any_key' ? 'untilAnyKey' : (a.count ?? 1);
            return exports.KeyAction.macro(a.slot ?? 0, repeat);
        }
        case 'controller':
            return exports.KeyAction.control(a.action);
        case 'raw':
            return exports.KeyAction.raw(a.value ?? 0);
        default:
            return exports.KeyAction.none();
    }
}
/** Encode a key action to its 32-bit key-matrix word (validates it). */
const encodeAction = (a) => call(() => native.encodeAction(actionToNative(a)));
exports.encodeAction = encodeAction;
/** Decode a 32-bit key-matrix word. */
const decodeAction = (word) => actionFromNative(native.decodeAction(word));
exports.decodeAction = decodeAction;
exports.MacroEvent = {
    keyDown: (usage, delayMs = 0) => ({ kind: 'key', value: usage, down: true, delayMs }),
    keyUp: (usage, delayMs = 0) => ({ kind: 'key', value: usage, down: false, delayMs }),
};
const EVENT_KINDS = {
    key: 'key',
    mouseButton: 'mouse_button',
    moveX: 'move_x',
    moveY: 'move_y',
    wheel: 'wheel',
};
const EVENT_KINDS_BACK = Object.fromEntries(Object.entries(EVENT_KINDS).map(([k, v]) => [v, k]));
const macrosToNative = (macros) => macros.map((m) => ({
    name: m.name,
    events: m.events.map((e) => ({ kind: EVENT_KINDS[e.kind], value: e.value, down: e.down, delayMs: e.delayMs })),
}));
const macrosFromNative = (macros) => macros.map((m) => ({
    name: m.name,
    events: m.events.map((e) => ({
        kind: EVENT_KINDS_BACK[e.kind] ?? 'key',
        value: e.value,
        down: e.down,
        delayMs: e.delayMs,
    })),
}));
/** Validate a macro bank offline; returns its encoded size (of 4096 bytes). */
const validateMacros = (macros) => call(() => native.validateMacros(macrosToNative(macros)));
exports.validateMacros = validateMacros;
const toKeyColors = (colors) => {
    const entries = colors instanceof Map ? [...colors] : Object.entries(colors);
    return entries.flatMap(([key, c]) => (c ? [{ key, r: c[0], g: c[1], b: c[2] }] : []));
};
/** An open X87. I/O methods return Promises and run off the JS thread. */
class Keyboard {
    #native;
    #watchers = new Set();
    constructor(n) {
        this.#native = n;
    }
    /** Open the keyboard: USB first, then the 2.4G receiver (`auto`). Blocks briefly. */
    static open(mode = 'auto') {
        return new Keyboard(call(() => native.NativeKeyboard.open(mode)));
    }
    /** Like {@link Keyboard.open}, without blocking the event loop. */
    static async openAsync(mode = 'auto') {
        return new Keyboard(await callAsync(() => native.NativeKeyboard.openAsync(mode)));
    }
    /** Release the device and stop watchers from {@link Keyboard.watch}. Safe to call twice; later calls reject. */
    close() {
        for (const w of this.#watchers)
            w.stop();
        this.#watchers.clear();
        this.#native.close();
    }
    /**
     * Connection events (USB cable, 2.4G link / sleep, battery) until
     * {@link Keyboard.close} or `watcher.stop()`:
     *
     * ```ts
     * kb.watch().on('wireless', (e) => console.log(e.connected ? 'awake' : 'asleep'));
     * for await (const e of kb.watch()) console.log(e);
     * ```n   */
    watch() {
        const w = new Watcher();
        this.#watchers.add(w);
        w.once('stop', () => this.#watchers.delete(w));
        return w;
    }
    get closed() {
        return this.#native.closed;
    }
    /** `using kb = Keyboard.open()` closes it at the end of the scope. */
    [Symbol.dispose]() {
        this.close();
    }
    get connection() {
        return this.#native.connection === 'usb' ? 'usb' : 'wireless';
    }
    firmwareVersion() {
        return callAsync(() => this.#native.firmwareVersion());
    }
    /**
     * Battery level over 2.4G. `null` means the keyboard is connected by USB
     * cable (it reports no battery there) or the 2.4G link is down.
     */
    async battery() {
        const b = await callAsync(() => this.#native.battery());
        return b ? { percent: b.percent, charging: b.charging } : null;
    }
    /** `true` over USB; over 2.4G whether the keyboard is linked (not asleep / off). */
    isLinked() {
        return callAsync(() => this.#native.isLinked());
    }
    // lighting
    async lighting() {
        const l = await callAsync(() => this.#native.lighting());
        return { effect: (l.effect ?? null), brightness: l.brightness, speed: l.speed, color: l.color };
    }
    setEffect(effect, { brightness = 4, speed = 2, color = 7 } = {}) {
        return callAsync(() => this.#native.setEffect(effect, brightness, speed, color));
    }
    lightsOff() {
        return callAsync(() => this.#native.lightsOff());
    }
    async effectPalette(effect) {
        const p = await callAsync(() => this.#native.effectPalette(effect));
        return p.map((c) => [c.r, c.g, c.b]);
    }
    setEffectColor(effect, index, [r, g, b]) {
        return callAsync(() => this.#native.setEffectColor(effect, index, { r, g, b }));
    }
    async perKeyColors() {
        const c = await callAsync(() => this.#native.perKeyColors());
        return new Map(c.map((k) => [k.key, [k.r, k.g, k.b]]));
    }
    /** Unlisted keys are set to black. */
    setPerKeyColors(colors) {
        return callAsync(() => this.#native.setPerKeyColors(toKeyColors(colors)));
    }
    // keys
    /** Every key's action on a layer (0 = base, 1 = FN, 2 = FN2). */
    async layer(layer) {
        const l = await callAsync(() => this.#native.layer(layer));
        return new Map(l.map((b) => [b.key, actionFromNative(b.action)]));
    }
    async keyAction(layer, key) {
        return (await this.layer(layer)).get(key) ?? exports.KeyAction.none();
    }
    remapKey(layer, key, action) {
        return callAsync(() => this.#native.remapKey(layer, key, actionToNative(action)));
    }
    // macros
    async getMacros() {
        return macrosFromNative(await callAsync(() => this.#native.macros()));
    }
    /** Write the whole macro bank in one go; `onProgress` gets 0..100. */
    saveMacros(macros, onProgress) {
        return callAsync(() => this.#native.saveMacros(macrosToNative(macros), onProgress ?? null));
    }
    clearMacros() {
        return callAsync(() => this.#native.clearMacros());
    }
    // options
    debounce() {
        return callAsync(() => this.#native.debounce());
    }
    setDebounce(stage) {
        return callAsync(() => this.#native.setDebounce(stage));
    }
    tap() {
        return callAsync(() => this.#native.tap());
    }
    setTap(sensitivity) {
        return callAsync(() => this.#native.setTap(sensitivity));
    }
    /** Seconds before sleep, or null when disabled. */
    sleepTimeout() {
        return callAsync(() => this.#native.sleepTimeout());
    }
    setSleepTimeout(secs) {
        return callAsync(() => this.#native.setSleepTimeout(secs));
    }
    // realtime
    /** Show a realtime frame (unlisted keys black). `lossy` merges near colours. */
    sendFrame(colors, lossy = false) {
        return callAsync(() => this.#native.sendFrame(toKeyColors(colors), lossy));
    }
    stopRealtime() {
        return callAsync(() => this.#native.stopRealtime());
    }
    /** Destructive: restores factory settings. */
    factoryReset() {
        return callAsync(() => this.#native.factoryReset());
    }
}
exports.Keyboard = Keyboard;
/** Current connection state, without opening the keyboard. */
const connectionStatus = () => callAsync(() => native.connectionStatus());
exports.connectionStatus = connectionStatus;
function toEvent(e) {
    if (e.kind === 'usb')
        return { kind: 'usb', connected: e.connected ?? false };
    if (e.kind === 'wireless')
        return { kind: 'wireless', connected: e.connected ?? false, receiver: e.receiver ?? false };
    return { kind: 'battery', battery: { percent: e.battery?.percent ?? 0, charging: e.battery?.charging ?? false } };
}
/**
 * Watch USB cable / 2.4G receiver / wireless link changes and battery.
 *
 * ```ts
 * const w = new Watcher();
 * w.on('wireless', (e) => console.log(e.connected ? 'awake' : 'asleep', e.receiver));
 * w.on('battery', (e) => console.log(e.battery.percent));
 * // ...
 * w.stop();
 * ```
 *
 * Emits the current state first (a `usb` and a `wireless` event), then every
 * change. While running it keeps the Node process alive; call `stop()`. Also
 * an async iterator: `for await (const e of new Watcher()) ...`.
 */
class Watcher extends node_events_1.EventEmitter {
    #native;
    constructor() {
        super();
        this.#native = call(() => new native.NativeWatcher((e) => {
            const ev = toEvent(e);
            this.emit('event', ev);
            if (ev.kind === 'usb')
                this.emit('usb', ev);
            else if (ev.kind === 'wireless')
                this.emit('wireless', ev);
            else
                this.emit('battery', ev);
        }));
    }
    /** Stop watching (safe to call twice). */
    stop() {
        if (this.#native.running) {
            this.#native.stop();
            this.emit('stop');
        }
    }
    get running() {
        return this.#native.running;
    }
    [Symbol.dispose]() {
        this.stop();
    }
    async *[Symbol.asyncIterator]() {
        const queue = [];
        let wake = null;
        const onEvent = (e) => {
            queue.push(e);
            wake?.();
        };
        const onStop = () => wake?.();
        this.on('event', onEvent);
        this.on('stop', onStop);
        try {
            while (this.running || queue.length) {
                const e = queue.shift();
                if (e)
                    yield e;
                else
                    await new Promise((r) => (wake = r));
                wake = null;
            }
        }
        finally {
            this.off('event', onEvent);
            this.off('stop', onStop);
        }
    }
}
exports.Watcher = Watcher;
