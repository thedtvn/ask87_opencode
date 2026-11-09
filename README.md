# ask87_opencode

An OpenCode V2 **TUI/Desktop plugin** that shows local and SSH session status on an ATTACK SHARK X87 keyboard. No custom server plugin is needed on either the local or SSH server.

## Architecture

- **TUI:** reads synchronized session data from its connected OpenCode backend and reports to a local keyboard broker.
- **Desktop window:** reads local/SSH server data and forwards minimal status snapshots through Desktop IPC.
- **Desktop main process:** reports those snapshots to the same local broker.
- **Local broker:** combines clients, assigns number-row keys, and owns a dedicated native keyboard worker.

OpenCode's normal backend still provides sessions and events; this package does not add a server plugin, RPC endpoint, or remote hardware connection. The keyboard is always the one attached to the machine running the TUI/Desktop clients. Multiple local clients share it through the broker.

The broker requires **Node.js 22+** or **Bun** available on `PATH` (Node is tried first, then Bun). Set `ASK87_NODE` to an absolute Node or Bun executable path when Desktop's environment cannot find it. Do not point it at `opencode` or Electron. It starts on demand, uses authenticated local IPC, releases client state when a connection closes, and exits after clients disconnect. No network-facing listener is used.

## Install

For Desktop, add the package to global `opencode.json(c)`:

```jsonc
{
  "plugins": [{ "package": "github:thedtvn/ask87_opencode" }]
}
```

For TUI, add its TUI-only part to global `cli.json`:

```jsonc
{
  "plugins": [{ "package": "github:thedtvn/ask87_opencode" }]
}
```

Restart the relevant client after updating. SSH servers do not need this plugin. This is a Desktop Electron integration; browser-only GUI clients have no local native hardware process.

## Key ownership and colors

**Idle tabs reserve no keys.** The first task to run gets physical key **1**, the next gets **2**, continuing through **9, 0**. Each task keeps its key after finishing until its last local tab closes. Subagents share their root task's key. When an assignment closes, later assignments shift left along with their current colors. More than ten tasks wait in first-start order; no active key is stolen.

| Highest-priority group state | Lighting |
| --- | --- |
| Permission request pending | Blink red |
| Question/form pending | Blink blue |
| Main task executing | Blink white |
| Main stopped, descendants executing | Blink green |
| Main and descendants finished | Solid green |
| All unassigned physical keys | Solid white |

Failures and interruptions count as finished. One blink is one second: 500 ms on, 500 ms off. The writer sends only changed frames, with at least 100 ms between sends and no backlog. Native HID runs in a worker, not the UI/main event loop. Hardware timeouts and a 5-second retry backoff prevent connection conflicts from flooding the keyboard. A stuck native OS call may not terminate immediately; replacement workers are refused until the previous worker exits.

Closing the last client releases realtime mode and restores the stored keyboard effect. Disconnect/crash cleanup uses socket closure, with a 30-second lease as a fallback. The driver's continuous-stream guidance does not state a firmware watchdog; changed-only frame retention still needs physical testing on each connection type.

## Native platforms

Prebuilt binaries are included for Windows x64/ARM64, Linux glibc x64/ARM64, and macOS Intel/Apple Silicon. `vendor/attack-shark-x87/SOURCE.json` records their pinned upstream commit and SHA-256 values. Only Windows x64 has been physically tested; other targets were built and load-tested on GitHub runners. Linux musl/Alpine is unsupported. Linux USB access may require upstream udev permissions for `258a:010c` and `3554:fa09`.

## Develop

```sh
npm ci
npm run check
```

`check` builds the broker and generated embedded runtime first, then runs both typechecks, fake-hardware tests, and the Desktop bundle build. The single Desktop bundle includes the pinned runtime archive and extracts it into a content-addressed local cache only from Electron main; it does not rely on unsupported relative module imports or bundle-path globals. Commit updated `dist/broker.cjs` and `dist/gui-experimental.cjs` with source changes: GitHub installation runs no preparation/build hooks.

Tests do not open a real keyboard. Multi-client TUI/Desktop and SSH flows still require end-to-end validation with actual client installations. The SDK is pinned to 2.2.5. Review `npm audit` before deployment; moderate dependency advisories remain.

## Privacy

Snapshots contain only generated session IDs, execution states, pending request IDs, tab presence, and first-start timestamps. They never contain prompt text, questions, answers, permission resources, credentials, or SSH passwords. Snapshots stay in memory and authenticated local IPC; no raw payloads are logged. Local broker endpoint/token files live outside the repository. Environment files, keys, dependencies, logs, and OpenCode state are ignored.

## License

[MIT](LICENSE) © 2026 The DT. The vendored driver retains its upstream MIT license.
