# attack_shark_x87_rs

Rust library for configuring the **ATTACK SHARK X87** keyboard, over the USB
cable or the 2.4G receiver, without the vendor software.

The protocol was reverse engineered from the vendor tool `OemDrv.exe` with
Ghidra. It is documented in [PROTOCOL.md](PROTOCOL.md).
Macro event encoding, buffer layout and repeat-mode research are in
[MACROS.md](MACROS.md).

Browser version (WebHID + React): [attack_shark_x87_web](https://github.com/thedtvn/attack_shark_x87_web)

## Features

| Feature | USB | 2.4G |
|---|---|---|
| Lighting effects (19), brightness, speed, palette colour | ✓ | ✓ verified |
| Per-effect 7-colour palettes | ✓ | ✓ |
| Per-key RGB (custom mode) | ✓ | ✓ |
| Key remap, 4 layers (keys, modifiers, media, mouse, Fn/Fn2, disable) | ✓ | ✓ verified (read) |
| Tap on/off + sensitivity | ✓ | ✓ verified |
| Sleep timeout | ✓ | ✓ verified |
| Debounce (including beyond the app's 5 stages) | ✓ | ✓ verified |
| Realtime frames ("music mode" transport) | ✓ | ✓ verified |
| Factory reset | ✓ | ✓ |
| Macro bank read/save (with progress) + repeat bindings | ✓ | ✓ paged read/write |

"Verified" means tested against a real keyboard.

## Install

```toml
[dependencies]
attack_shark_x87 = { git = "https://github.com/thedtvn/attack_shark_x87_rs" }
```

Uses [`hidapi`](https://crates.io/crates/hidapi). On Linux you need a udev rule
for `258a:010c` and `3554:fa09`, or root access.

## Python and Node.js

Both bindings are built from source, so a [Rust toolchain](https://rustup.rs)
is required. The packaging files are at the repo root and the binding crates are
in `lib/` (`lib/ask87_py`, `lib/ask87_ts`). Each binding is a typed Python or
TypeScript layer that wraps a thin native module.

### Python (3.9+)

```sh
pip install "git+https://github.com/thedtvn/attack_shark_x87_rs"
# or
uv add "git+https://github.com/thedtvn/attack_shark_x87_rs"
```

```python
from ask87 import Keyboard, Effect, Key, KeyAction, ControllerAction, Macro, MacroEvent

with Keyboard.open() as kb:  # "auto" | "usb" | "wireless"
    kb.set_effect(Effect.FIXED_ON, brightness=4)
    kb.remap_key(0, Key.CAPS_LOCK, KeyAction.key(0x29))  # Caps Lock -> Esc
    kb.remap_key(1, Key.F6, KeyAction.control(ControllerAction.BLUETOOTH_1))
    kb.save_macros([Macro("hi", [MacroEvent.key_down(0x0B, 20), MacroEvent.key_up(0x0B)])],
                   on_progress=lambda p: print(f"{p}%"))
    print(Key.CAPS_LOCK.label, Key.CAPS_LOCK.rect, Key.CAPS_LOCK.group)
```

Enum members are UPPER_SNAKE (`Key.CAPS_LOCK`, `KeyGroup.F1_F4`,
`Effect.FIXED_ON`), and each value is the Rust variant name. Keys and groups
combine with `+` into a `KeySet`, an ordered tuple of keys; `-` removes keys:

```python
from ask87 import Key, KeyGroup, LAYOUT

main_kb = [
    KeyGroup.ESC + KeyGroup.F1_F4 + KeyGroup.F5_F8 + KeyGroup.F9_F12 + KeyGroup.PRINT_SCROLL_PAUSE,
    KeyGroup.NUMBER_ROW + KeyGroup.INSERT_HOME_PGUP,
    KeyGroup.TOP_ROW + KeyGroup.DELETE_END_PGDN,
    KeyGroup.HOME_ROW,
    KeyGroup.SHIFT_ROW + KeyGroup.ARROW_UP,
    KeyGroup.BOTTOM_ROW + KeyGroup.ARROW_LEFT_DOWN_RIGHT,
]
wasd = Key.W + Key.A + Key.S + Key.D
print((KeyGroup.MAIN - Key.SPACE).rect, LAYOUT[0])  # LAYOUT: rows of clusters
```

`AsyncKeyboard` has the same methods for asyncio. Each call runs in a worker
thread with the GIL released, and `on_progress` runs on the event loop:

```python
from ask87 import AsyncKeyboard, Effect

kb = await AsyncKeyboard.open()
await kb.set_effect(Effect.FIXED_ON)
macros = await kb.get_macros()
kb.close()  # plain method; `async with` also works
```

The package ships `py.typed`. Development uses uv, ruff and ty:

```sh
uv sync               # builds the extension into .venv
uv run pytest
uv run ruff check && uv run ruff format --check
uv run ty check
```

### Node.js (18+)

```sh
npm install github:thedtvn/attack_shark_x87_rs
```

The `prepare` script compiles the native module and the TypeScript. Since npm 12,
git dependencies and their install scripts must be allowed first: put
`allow-git=root` in `.npmrc` and `"allowScripts": { "attack-shark-x87": true }`
in `package.json`.

```ts
import { Keyboard, Effect, Key, KeyGroup, Keys, KeyAction, MacroEvent, LAYOUT, keys, keysRect } from 'attack-shark-x87';

const kb = await Keyboard.openAsync(); // or Keyboard.open(); 'auto' | 'usb' | 'wireless'
await kb.setEffect(Effect.FIXED_ON, { brightness: 4 });
await kb.remapKey(0, Key.CAPS_LOCK, KeyAction.key(0x29));
await kb.saveMacros([{ name: 'hi', events: [MacroEvent.keyDown(0x0b, 20), MacroEvent.keyUp(0x0b)] }],
  (p) => console.log(`${p}%`));
console.log(Keys.label(Key.CAPS_LOCK), Keys.rect(Key.CAPS_LOCK));
// Same UPPER_SNAKE members; combine keys / groups with keys(...):
const row = keys(KeyGroup.NUMBER_ROW, KeyGroup.INSERT_HOME_PGUP);
console.log(keysRect(row), LAYOUT[0]);
kb.close();
```

I/O methods return Promises and run on the libuv thread pool. Errors are
`NotFoundError`, `InvalidArgumentError` and `DeviceError`, all subclasses of
`X87Error`. Development: `npm run build`, `npm test`.

## Usage

```rust
use attack_shark_x87::{Effect, EffectSettings, Keyboard, Key, KeyAction, Frame, Rgb, PerKeyColors};

fn main() -> Result<(), attack_shark_x87::Error> {
    // USB cable first, falls back to the 2.4G receiver.
    let kb = Keyboard::open()?;

    // Lighting
    kb.set_effect(Effect::Respire, EffectSettings { brightness: 4, speed: 2, color: 0 })?;
    kb.set_effect_color(Effect::Respire, 0, Rgb(255, 80, 0))?;

    // Per-key colours
    let mut c = PerKeyColors::default();
    c.fill(Rgb(0, 0, 60));
    for k in [Key::W, Key::A, Key::S, Key::D] {
        c.set_key(k, Rgb(255, 0, 0));
    }
    kb.set_per_key_colors(0, &c)?;
    kb.set_effect(Effect::Custom, EffectSettings { brightness: 4, speed: 0, color: 0 })?;

    // Remap CapsLock to Esc on layer 1
    kb.remap_key(0, Key::CapsLock, KeyAction::Key { modifiers: 0, usage: 0x29, usage2: 0 })?;

    // Options
    kb.set_debounce(2)?;
    kb.set_tap(None)?;                  // Tap off
    kb.set_sleep_timeout(Some(300))?;   // 5 minutes

    // Realtime frame (what the vendor "music" mode streams)
    let mut f = Frame::new();
    f.set_key(Key::Space, Rgb(0, 255, 0));
    kb.send_frame(&f)?;
    kb.stop_realtime()?;
    Ok(())
}
```

## Examples

```sh
cargo run --example info                   # connection, firmware, config, layer 1
cargo run --example effect -- respire 4 2 0
cargo run --example per_key                # WASD red
cargo run --example realtime               # 8 s sweep using realtime frames
cargo run --example roundtrip              # safe write test (writes config back unchanged)
cargo run --example list                   # list all HID interfaces
cargo run --example dumpcfg -- save a.bin  # snapshot / diff the 128-byte config
cargo run --example setbyte -- 0x03 2      # write one config byte
```

Close the vendor app before using the library; it holds the same HID interface.

## Protocol summary

- **USB**: `258A:010C`, collection `FF00:0001`, 520-byte feature reports
  (report id 6) `[id, cmd, sub, 0, chunks, index, lenLo, lenHi, data[512]]`.
  Reads use `cmd | 0x80`.
- **2.4G**: `3554:FA09`, collection `FF02:0002`, 20-byte reports (id 0x13)
  `[0x13, cmd, total, index, sub<<4|len, data[14], checksum]`, acked per packet.
- Both carry the same data blocks: a 128-byte config (effects, brightness,
  speed, Tap, Sleep, Debounce), RGB palette table, per-key planes and a
  128 × u32 key matrix per layer.

See [PROTOCOL.md](PROTOCOL.md) for every offset and command.

## Disclaimer

Not affiliated with ATTACK SHARK. Writing wrong data to a keyboard can leave
it misconfigured; a factory reset (`kb.factory_reset()`) restores defaults.
Use at your own risk.

## License

[MIT](LICENSE) © 2026 The DT

## Keys and layout

```rust
use attack_shark_x87::{Key, KeyGroup, LAYOUT};

// Every physical key is a variant; no names or indices to hard-code.
assert_eq!(Key::CapsLock.index(), 3);
assert_eq!(Key::Digit1.name(), "1");
assert_eq!("space".parse::<Key>(), Ok(Key::Space));

// Physical layout: keyboard -> row -> group (cluster of adjacent keys).
assert_eq!(LAYOUT[0][0], &[Key::Esc]);
assert_eq!(LAYOUT[0][1], &[Key::F1, Key::F2, Key::F3, Key::F4]);

// Areas, each as its list of clusters.
assert_eq!(KeyGroup::FKey.layout()[0], &[Key::Esc]);       // [[Esc], [F1..F4], [F5..F8], [F9..F12]]
assert_eq!(KeyGroup::Main.layout()[0][0], Key::Grave);     // one entry per row: [` 1 2 ... = Backspace], ...
for key in KeyGroup::Navigation.keys() { let _ = key; }   // PrtSc ScrLock Pause / Insert Home PgUp / Delete End PgDn
assert_eq!(Key::Left.group(), KeyGroup::Arrows);
assert_eq!(Key::Space.row(), 5);
```

- `LAYOUT` has 6 rows. Reading it row by row gives `Key::ALL`.
- The `KeyGroup` areas are `FKey`, `Main`, `Navigation` and `Arrows`; together
  they cover every key exactly once.
- Each physical cluster is also a `KeyGroup` variant: `Esc`, `F1F4`, `F5F8`,
  `F9F12`, `PrintScrollPause`, `NumberRow`, `InsertHomePgUp`, `TopRow`,
  `DeleteEndPgDn`, `HomeRow`, `ShiftRow`, `ArrowUp`, `BottomRow`,
  `ArrowLeftDownRight`. They have the same methods as the areas
  (`layout()`, `keys()`, `contains()`); `is_area()` tells them apart.
- `KeyGroup::AREAS` lists the 4 areas and `KeyGroup::CLUSTERS` the 14
  clusters in keyboard order. `Key::group()` gives a key's area and
  `Key::cluster()` its cluster (`Key::F2.cluster() == KeyGroup::F1F4`).
- The key table is written once with an internal `define_keys!` macro
  (`src/rs_macro.rs`) that generates `name()`, `index()`, `from_name()`,
  `from_index()`, `ALL` and `COUNT`. A duplicated index is a compile error.

### Key positions

Each key has its rectangle from the vendor's `KB.ini`, in the pixel space of
the vendor image (`IMAGE_WIDTH` × `IMAGE_HEIGHT` = 669 × 259):

```rust
use attack_shark_x87::layout::{Key, KeyGroup, IMAGE_WIDTH, IMAGE_HEIGHT};

let r = Key::Esc.rect();                 // Rect { x1: 18, y1: 20, x2: 51, y2: 53 }
let wide = Key::Space.rect().width();    // key widths, e.g. for drawing
let (x, y, w, h) = r.scaled(1338.0, 518.0); // fit to any drawing size
let clicked = Key::at(30, 40);           // hit-test a point -> Some(Key::Esc)
let next = Key::F4.right();              // Some(Key::F5); also left()

// Groups (areas and clusters) have a bounding rectangle too.
let f_row = KeyGroup::FKey.rect();       // Esc .. F12
let nav = KeyGroup::Navigation.rect();   // the PrtSc/Insert/Delete block
let area = KeyGroup::at(30, 40);         // area under a point -> Some(KeyGroup::FKey)
```

`cargo run --example group_rects` prints every group's rectangle.

## Async

`KeyboardAsync` is an async-friendly handle with the same methods as
`Keyboard`, returning futures. It owns the keyboard on one worker thread, so
slow calls (a macro save over 2.4G takes ~10 s) never block your executor.

```rust,no_run
# async fn example() -> Result<(), attack_shark_x87::Error> {
use attack_shark_x87::{KeyboardAsync, Effect, EffectSettings};
let kb = KeyboardAsync::open().await?;
kb.set_effect(Effect::Respire, EffectSettings { brightness: 4, speed: 2, color: 0 }).await?;
let bank = kb.macro_bank().await?;
kb.save_macro_bank(bank, Some(|p: attack_shark_x87::SaveProgress| println!("{}%", p.percent))).await?;
// Anything else from the blocking API:
let fw = kb.with(|k| k.firmware_version()).await?;
# let _ = fw; Ok(()) }
```

- No async runtime dependency: works with tokio, async-std, smol, or a
  plain `block_on` (see `examples/async_check.rs`).
- `Clone + Send + Sync`: share it between tasks. Calls run one at a time in
  call order (the keyboard can't handle concurrent requests).
- Wrap an already open keyboard with `KeyboardAsync::from_keyboard(kb)`, or
  use `KeyboardAsync::spawn(|| Keyboard::open_with(&api))` for a custom opener.
- The progress callback runs on the worker thread; keep it quick.
- If the worker thread is gone, calls return `Error::Disconnected`.
- `cargo run --example async_check` reads lighting, macros and a layer
  concurrently (read-only).

## Connection events and battery

`Watcher` reports when the keyboard is plugged in or unplugged over USB, and
when the 2.4G link goes up or down (keyboard wakes, sleeps or is switched off).
Each 2.4G event also says whether the USB receiver is plugged in. It reports the
battery too. It uses its own HID handles, so it runs alongside an open
`Keyboard`.

```rust,no_run
use attack_shark_x87::{watch, Event, Keyboard, Watcher};
# fn example() -> Result<(), attack_shark_x87::Error> {
println!("{:?}", watch::status()?); // Status { usb, receiver, wireless }
let w = Watcher::start(|e| match e {
    Event::Usb { connected } => println!("cable: {connected}"),
    Event::Wireless { connected, receiver } => println!("2.4G link: {connected}, receiver plugged in: {receiver}"),
    Event::Battery(b) => println!("battery {}% charging={}", b.percent, b.charging),
})?;
let kb = Keyboard::open()?;
// None = connected by USB cable (no battery reading there) or 2.4G link down.
println!("{:?} linked={}", kb.battery()?, kb.is_linked()?);
w.stop();
# Ok(()) }
```

Over 2.4G the receiver sends `13 0A .. .. .. 02 xx` when the link changes and
`.. 05 pp ss` with the battery level. `Keyboard::battery` asks for the battery
with cmd `0x4A`, which replies `13 4A 00 00 00 pp ss`. Over the USB cable the
keyboard gives no battery reading. The vendor app never asks for it there either;
the 4 bytes cmd `0x09` returns aren't a battery level.

Events are also available from an open keyboard: `kb.watch(callback)` in
Rust and Python, `async for e in kb.watch()` on `AsyncKeyboard`, and
`kb.watch().on('wireless', …)` in Node. Watchers started this way stop when
the keyboard is closed. The standalone `Watcher` is for waiting until a
keyboard is plugged in, before any is open.

Python: `Keyboard.battery()`, `is_linked()`, `Watcher(callback)`,
`AsyncWatcher` (`async for event in AsyncWatcher()`) and `connection_status()`.
Node: `kb.battery()`, `kb.isLinked()`, `new Watcher()` (an EventEmitter with
`'usb' | 'wireless' | 'battery' | 'event'` events that also works with
`for await`) and `connectionStatus()`. Both return `None` / `null` from
`battery()` when connected by cable.

## Controller bindings

```rust,no_run
use attack_shark_x87::{Keyboard, Key, KeyAction, ControllerAction};
# fn example() -> Result<(), attack_shark_x87::Error> {
let kb = Keyboard::open()?;
// Explicit assignments only. These examples are not executed automatically.
kb.remap_key(0, Key::App, KeyAction::Fn2)?;
kb.remap_key(1, Key::Digit4, KeyAction::Controller(ControllerAction::Receiver24G))?;
kb.remap_key(1, Key::CapsLock, KeyAction::Controller(ControllerAction::LightBarMode))?;
# Ok(()) }
```

`ControllerAction::ALL` includes Bluetooth 1/2/3, receiver, battery display,
Windows-key lock, reset, main backlight and light-bar controls. `name()`,
`factory_key()` and `is_sensitive()` provide caller-facing metadata. Host
media controls remain `KeyAction::Consumer`; application/task switching and
input-method defaults are constants in `controller`. `factory_fn1_action()`
returns the vendor FN1 mapping. FN2/Tap are not assumed to share FN1 defaults.

FN encodes as `0D 00 00 00`; FN2 as `0D 01 00 00`. Unknown words stay `Raw`.
`KeyAction::try_encode()` validates macro slots/counts without panicking;
`remap_key` uses it before device I/O. Connection controls may disconnect the
keyboard, and reset may erase settings.
`cargo run --example controller` prints bytes offline without opening hardware.

## Onboard macros

```rust,no_run
use attack_shark_x87::{Keyboard, Key, KeyAction};
use attack_shark_x87::macros::{Macro, MacroAction, MacroEvent, MacroBank, MacroRepeat};
# fn example() -> Result<(), attack_shark_x87::Error> {
let kb = Keyboard::open()?;
let bank = MacroBank { macros: vec![Macro {
    name: "Type A".into(),
    events: vec![
        MacroEvent { action: MacroAction::Key { usage: 4, down: true }, delay_ms: 0 },
        MacroEvent { action: MacroAction::Key { usage: 4, down: false }, delay_ms: 50 },
    ],
}] };
// Replaces the whole shared bank used by all layers (about 10 s over 2.4G).
kb.save_macro_bank(&bank, Some(&mut |p| println!("saving {}%", p.percent)))?;
// Or without progress: kb.save_macro_bank(&bank, None)?;
// Bind a key deliberately; saving the bank never changes key bindings.
kb.remap_key(0, Key::F12, KeyAction::Macro { slot: 0, repeat: MacroRepeat::Times(1) })?;
# Ok(()) }
```

- Names: up to 30 UTF-16 code units. Delays: 0..1,048,575 ms.
- Bank: 4096 bytes; 32 macros is a conservative client limit, not a measured
  firmware limit. Events must fit alongside names and the directory.
- `save_macro_bank` works like the vendor app (`G5KB_ApplySetting` →
  `W3632_WriteMacroData`): it writes the bank once in eight 512-byte units,
  reporting a non-decreasing percentage. Nothing is read first and nothing is
  read back: every packet is acknowledged and retried by the transport.
  The macro API is just three calls: `macro_bank()` (get),
  `save_macro_bank(&bank, progress)` (save) and `clear_macro_bank()` (clear).
- Slot numbers are shared across all four layers and key bindings are not
  checked. A key bound to slot `n` plays whatever is now in slot `n`; a key
  bound past the end of the bank does nothing.
- `macro_bank()` reads the bank (USB, or eight tagged 512-byte pages over
  2.4G via command `43`, vendor wrapper `00487d20`).
- `cargo run --example wireless_macro_check` reads the bank read-only and
  prints timings (2.4G: ~1.9 s for the bank, ~1.9 s for four layers).
- `cargo run --example save_progress_check -- --confirm` writes a test bank,
  reads it back and restores the original.
- The receiver cannot pipeline requests; reads are sequential. Dropped
  packets are kept across quick re-requests rather than restarting blindly.
- Saving is not atomic: interruption can leave a partial bank; save again.
- `cargo run --example macro` only builds/prints bytes offline. The
  `--upload` flag saves the bank with a progress bar; it never assigns a key.
  `--upload` flag explicitly enables the replacement; it never assigns a key.
