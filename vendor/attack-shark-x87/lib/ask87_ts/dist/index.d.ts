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
import { EventEmitter } from 'node:events';
import { ControllerAction, Effect, Key, KeyGroup } from './enums';
export { ControllerAction, Effect, Key, KeyGroup };
export declare const VERSION: string;
/** Base error for ATTACK SHARK X87 operations. */
export declare class X87Error extends Error {
    name: string;
}
/** No keyboard (USB or 2.4G receiver) was found. */
export declare class NotFoundError extends X87Error {
    name: string;
}
/** An argument was rejected before talking to the keyboard. */
export declare class InvalidArgumentError extends X87Error {
    name: string;
}
/** The 2.4G keyboard is asleep or off; press any key to wake it and retry. */
export declare class AsleepError extends X87Error {
    name: string;
}
/** The keyboard returned an unexpected response, timed out or disconnected. */
export declare class DeviceError extends X87Error {
    name: string;
}
/** A rectangle in vendor keyboard-image pixels (x2/y2 exclusive). */
export declare class Rect {
    readonly x1: number;
    readonly y1: number;
    readonly x2: number;
    readonly y2: number;
    constructor(x1: number, y1: number, x2: number, y2: number);
    get width(): number;
    get height(): number;
    contains(x: number, y: number): boolean;
}
export declare const IMAGE_WIDTH: number;
export declare const IMAGE_HEIGHT: number;
/** Metadata for a {@link Key}. */
export declare const Keys: {
    /** Every key, in keyboard order. */
    readonly all: () => Key[];
    /** Printed legend, e.g. "Caps Lock". */
    readonly label: (k: Key) => string;
    /** Hardware LED / key-matrix index. */
    readonly index: (k: Key) => number;
    readonly rect: (k: Key) => Rect;
    /** The area (FKey, Main, Navigation, Arrows) containing the key. */
    readonly group: (k: Key) => KeyGroup;
    readonly cluster: (k: Key) => KeyGroup;
    /** Row 0..5, top to bottom. */
    readonly row: (k: Key) => number;
    readonly left: (k: Key) => Key | null;
    readonly right: (k: Key) => Key | null;
    /** The key under a point of the vendor keyboard image. */
    readonly at: (x: number, y: number) => Key | null;
};
/** Metadata for a {@link KeyGroup}. */
export declare const KeyGroups: {
    readonly all: () => KeyGroup[];
    /** The four areas, top-left to bottom-right. */
    readonly areas: () => KeyGroup[];
    /** The physical clusters, in keyboard order. */
    readonly clusters: () => KeyGroup[];
    readonly isArea: (g: KeyGroup) => boolean;
    /** Clusters of adjacent keys (an area has several, a cluster one). */
    readonly layout: (g: KeyGroup) => Key[][];
    readonly keys: (g: KeyGroup) => Key[];
    readonly rect: (g: KeyGroup) => Rect;
    /** The area under a point of the vendor keyboard image. */
    readonly at: (x: number, y: number) => KeyGroup | null;
};
/**
 * Combine keys and groups into one ordered key list (duplicates dropped);
 * the TypeScript counterpart of Python's `KeyGroup.A + KeyGroup.B`.
 *
 * ```ts
 * const row = keys(KeyGroup.NUMBER_ROW, KeyGroup.INSERT_HOME_PGUP);
 * const wasd = keys(Key.W, Key.A, Key.S, Key.D);
 * ```
 */
export declare function keys(...parts: readonly (Key | KeyGroup | Iterable<Key>)[]): Key[];
/** Bounding box of a set of keys. */
export declare function keysRect(ks: Iterable<Key>): Rect;
/** Physical layout: keyboard -> row -> cluster. */
export declare const LAYOUT: readonly (readonly KeyGroup[])[];
/** Hardware id of an {@link Effect}. */
export declare const effectId: (e: Effect) => number;
export interface ControllerInfo {
    readonly label: string;
    /** The key that triggers this control with FN1 by default. */
    readonly factoryKey: Key;
    /** Triggering it can disconnect the keyboard or erase settings. */
    readonly sensitive: boolean;
}
export declare function controllerInfo(a: ControllerAction): ControllerInfo;
/** How a macro bound to a key plays back: a repeat count (1..255) or a mode. */
export type MacroRepeat = number | 'untilReleased' | 'untilAnyKey';
/** What a key does. Build with the {@link KeyAction} helpers. */
export type KeyAction = {
    readonly kind: 'none';
}
/** `modifiers`: HID mask (bit 0 LCtrl .. bit 7 RGui); `usage`: HID usage (0x04 = A). */
 | {
    readonly kind: 'key';
    readonly modifiers: number;
    readonly usage: number;
    readonly usage2: number;
}
/** Consumer-control usage (media keys), e.g. 0xE9 volume up. */
 | {
    readonly kind: 'consumer';
    readonly usage: number;
}
/** Mouse button 1..5. */
 | {
    readonly kind: 'mouse';
    readonly button: number;
} | {
    readonly kind: 'fn';
} | {
    readonly kind: 'fn2';
}
/** Onboard macro slot (0-based). */
 | {
    readonly kind: 'macro';
    readonly slot: number;
    readonly repeat: MacroRepeat;
} | {
    readonly kind: 'controller';
    readonly action: ControllerAction;
} | {
    readonly kind: 'raw';
    readonly value: number;
};
export declare const KeyAction: {
    readonly none: () => KeyAction;
    readonly key: (usage: number, modifiers?: number, usage2?: number) => KeyAction;
    readonly consumer: (usage: number) => KeyAction;
    readonly mouse: (button: number) => KeyAction;
    readonly fn: () => KeyAction;
    readonly fn2: () => KeyAction;
    readonly macro: (slot: number, repeat?: MacroRepeat) => KeyAction;
    readonly control: (action: ControllerAction) => KeyAction;
    readonly raw: (value: number) => KeyAction;
};
/** Encode a key action to its 32-bit key-matrix word (validates it). */
export declare const encodeAction: (a: KeyAction) => number;
/** Decode a 32-bit key-matrix word. */
export declare const decodeAction: (word: number) => KeyAction;
/**
 * One macro step. `value` is a HID usage (`key`), a button mask
 * (`mouseButton`) or a signed -128..127 delta (`moveX`/`moveY`/`wheel`).
 * `down` only matters for `key` and `mouseButton`. `delayMs` is the wait
 * after this event.
 */
export interface MacroEvent {
    readonly kind: 'key' | 'mouseButton' | 'moveX' | 'moveY' | 'wheel';
    readonly value: number;
    readonly down: boolean;
    readonly delayMs: number;
}
export declare const MacroEvent: {
    readonly keyDown: (usage: number, delayMs?: number) => MacroEvent;
    readonly keyUp: (usage: number, delayMs?: number) => MacroEvent;
};
/** A named macro (name: 1..30 UTF-16 units; 1..1023 events). */
export interface Macro {
    readonly name: string;
    readonly events: readonly MacroEvent[];
}
/** Validate a macro bank offline; returns its encoded size (of 4096 bytes). */
export declare const validateMacros: (macros: readonly Macro[]) => number;
/** An (r, g, b) colour, each 0..255. */
export type Rgb = readonly [r: number, g: number, b: number];
export interface Lighting {
    readonly effect: Effect | null;
    readonly brightness: number;
    readonly speed: number;
    readonly color: number;
}
export interface EffectOptions {
    /** 0..4, default 4. */
    readonly brightness?: number;
    /** 0..4, default 2. */
    readonly speed?: number;
    /** Palette index 0..6, or 7 = random (default). */
    readonly color?: number;
}
/** An open X87. I/O methods return Promises and run off the JS thread. */
export declare class Keyboard {
    #private;
    private constructor();
    /** Open the keyboard: USB first, then the 2.4G receiver (`auto`). Blocks briefly. */
    static open(mode?: 'auto' | 'usb' | 'wireless'): Keyboard;
    /** Like {@link Keyboard.open}, without blocking the event loop. */
    static openAsync(mode?: 'auto' | 'usb' | 'wireless'): Promise<Keyboard>;
    /** Release the device and stop watchers from {@link Keyboard.watch}. Safe to call twice; later calls reject. */
    close(): void;
    /**
     * Connection events (USB cable, 2.4G link / sleep, battery) until
     * {@link Keyboard.close} or `watcher.stop()`:
     *
     * ```ts
     * kb.watch().on('wireless', (e) => console.log(e.connected ? 'awake' : 'asleep'));
     * for await (const e of kb.watch()) console.log(e);
     * ```n   */
    watch(): Watcher;
    get closed(): boolean;
    /** `using kb = Keyboard.open()` closes it at the end of the scope. */
    [Symbol.dispose](): void;
    get connection(): 'usb' | 'wireless';
    firmwareVersion(): Promise<number>;
    /**
     * Battery level over 2.4G. `null` means the keyboard is connected by USB
     * cable (it reports no battery there) or the 2.4G link is down.
     */
    battery(): Promise<Battery | null>;
    /** `true` over USB; over 2.4G whether the keyboard is linked (not asleep / off). */
    isLinked(): Promise<boolean>;
    lighting(): Promise<Lighting>;
    setEffect(effect: Effect, { brightness, speed, color }?: EffectOptions): Promise<void>;
    lightsOff(): Promise<void>;
    effectPalette(effect: Effect): Promise<Rgb[]>;
    setEffectColor(effect: Effect, index: number, [r, g, b]: Rgb): Promise<void>;
    perKeyColors(): Promise<Map<Key, Rgb>>;
    /** Unlisted keys are set to black. */
    setPerKeyColors(colors: ReadonlyMap<Key, Rgb> | Partial<Record<Key, Rgb>>): Promise<void>;
    /** Every key's action on a layer (0 = base, 1 = FN, 2 = FN2). */
    layer(layer: number): Promise<Map<Key, KeyAction>>;
    keyAction(layer: number, key: Key): Promise<KeyAction>;
    remapKey(layer: number, key: Key, action: KeyAction): Promise<void>;
    getMacros(): Promise<Macro[]>;
    /** Write the whole macro bank in one go; `onProgress` gets 0..100. */
    saveMacros(macros: readonly Macro[], onProgress?: (percent: number) => void): Promise<void>;
    clearMacros(): Promise<void>;
    debounce(): Promise<number>;
    setDebounce(stage: number): Promise<void>;
    tap(): Promise<number | null>;
    setTap(sensitivity: number | null): Promise<void>;
    /** Seconds before sleep, or null when disabled. */
    sleepTimeout(): Promise<number | null>;
    setSleepTimeout(secs: number | null): Promise<void>;
    /** Show a realtime frame (unlisted keys black). `lossy` merges near colours. */
    sendFrame(colors: ReadonlyMap<Key, Rgb> | Partial<Record<Key, Rgb>>, lossy?: boolean): Promise<void>;
    stopRealtime(): Promise<void>;
    /** Destructive: restores factory settings. */
    factoryReset(): Promise<void>;
}
export interface Battery {
    /** 0..100. */
    readonly percent: number;
    readonly charging: boolean;
}
/** The keyboard was plugged in / unplugged over the USB cable. */
export interface UsbEvent {
    readonly kind: 'usb';
    readonly connected: boolean;
}
/** The 2.4G link went up / down (keyboard woke, slept, switched off...). */
export interface WirelessEvent {
    readonly kind: 'wireless';
    readonly connected: boolean;
    /** Whether the USB receiver is plugged in. */
    readonly receiver: boolean;
}
/** Battery reported by the receiver over 2.4G. */
export interface BatteryEvent {
    readonly kind: 'battery';
    readonly battery: Battery;
}
export type ConnectionEvent = UsbEvent | WirelessEvent | BatteryEvent;
export interface ConnectionStatus {
    /** The keyboard is plugged in by cable. */
    readonly usb: boolean;
    /** The 2.4G receiver is plugged in. */
    readonly receiver: boolean;
    /** The keyboard is linked to the receiver. */
    readonly wireless: boolean;
}
/** Current connection state, without opening the keyboard. */
export declare const connectionStatus: () => Promise<ConnectionStatus>;
interface WatcherEvents {
    event: [ConnectionEvent];
    usb: [UsbEvent];
    wireless: [WirelessEvent];
    battery: [BatteryEvent];
    /** The watcher was stopped. */
    stop: [];
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
export declare class Watcher extends EventEmitter<WatcherEvents> implements AsyncIterable<ConnectionEvent> {
    #private;
    constructor();
    /** Stop watching (safe to call twice). */
    stop(): void;
    get running(): boolean;
    [Symbol.dispose](): void;
    [Symbol.asyncIterator](): AsyncIterator<ConnectionEvent>;
}
