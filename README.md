# ask87_opencode

An OpenCode V2 plugin that uses an ATTACK SHARK X87 keyboard's number row as a session status display.

## Key ownership

Top-level sessions claim keys in order **1, 2, 3, 4, 5, 6, 7, 8, 9, 0** while their TUI or Desktop tabs are open. Descendant subagent sessions share their parent's key.

Keys are assigned immediately when session tabs open, in the order they are first observed—not when tasks execute and not alphabetically by session ID. A key stays assigned after execution finishes. Closing the last tab for a session removes that assignment **without deleting history**, and later assignments shift left to keep keys contiguous. For example, closing the third of six sessions moves sessions 4, 5, and 6 to keys 3, 4, and 5, including their current colors. If the same session is open in multiple clients, it remains assigned until its last tab closes. When all ten keys are occupied, additional sessions wait in opening order and are promoted at the end when space becomes available.

| Highest-priority state in the session group | Lighting |
| --- | --- |
| Permission request pending | Blink red |
| Question/form pending | Blink blue |
| Main agent executing | Blink white |
| Main agent stopped, but a descendant is still executing | Blink green |
| Group execution finished | Solid green |
| Newly opened session with no execution | Solid white |
| Every other physical key | Solid white |

Failures and interrupted executions currently use the same finished green as successful executions. Any pending permission takes priority over questions, which take priority over running. Blink off-phases are black; the other keys stay white.

## Parts

- **Server:** one process-shared coordinator owns allocation, session hierarchy, status aggregation, and one keyboard connection.
- **TUI:** reports open root-session tabs.
- **Desktop GUI:** reports open session tabs in that window.

UI clients send complete tab snapshots and periodic heartbeats to the owning server **with the project location**. Project-scoped RPC calls without that location resolve in the server's default directory and cannot reach a project-only plugin. The server releases abandoned client ownership after a lease expires (approximately 30–35 seconds). Normal tab closure is reported without waiting for that timeout. Closing the last connected TUI/GUI explicitly releases realtime mode and closes the keyboard handle, even if OpenCode's background server remains running. With no UI connected, this plugin does not open the keyboard. Crashes and lost connections fall back to lease expiry rather than immediate release. A suspended or disconnected client may lose its slot and reacquire one on return.

The keyboard is attached to the **server machine**, not necessarily the UI machine. Use one OpenCode server runtime for this keyboard: separate server processes are not coordinated by this plugin.

## Configuration

Add this package to your global `opencode.json(c)`:

```jsonc
{
  "plugins": [
    { "package": "github:thedtvn/ask87_opencode" }
  ]
}
```

Use global OpenCode configuration for Desktop GUI parts. For local development, the package path can be `../ask87_opencode` if the consuming project and plugin are sibling directories.

The server and TUI use TypeScript source entries. The experimental GUI part uses the committed CommonJS bundle at `dist/gui-experimental.cjs`. Run `npm run build` after GUI source changes and include the updated bundle when pushing. This project's `opencode.json` intentionally does not register another local copy when the plugin is installed globally.

## Development

Use Node.js 22 or newer and npm on a supported platform. The vendored native binding is loaded lazily by the server part; tests use fake hardware.

```sh
npm ci
npm run check
```

Tests use fake hardware. Running checks must not open a real keyboard or change lighting. A real TUI/Desktop and keyboard smoke test is still required before claiming end-to-end compatibility.

### Implementation notes

Realtime frames are used instead of repeatedly saving per-key profiles. A single serialized writer streams a complete frame every 40 ms (including unchanged solid colors), changes blink phase every half-second, and retries disconnected hardware with backoff. When TUI tabs are disabled, the currently visible session owns a key; the home screen has no session assignment. Every frame contains all physical keys because omitted keys in the keyboard SDK are black.

Server events include session creation and execution lifecycle, permission ask/reply, and form create/reply/cancel. Requests are tracked by ID, not incremented counters. Duplicate project subscriptions are deduplicated centrally. Execution history can be bootstrapped from session metadata; already-pending forms at initial load may not be recoverable through the restricted server plugin context, so load the plugin before starting work.

## Privacy and safety

No prompts, answers, permission resources, session IDs, machine paths, or device metadata are logged. Client/session IDs are used only in memory and authenticated OpenCode RPC messages. Environment files, local npm configuration, keys, dependencies, logs, and OpenCode state are ignored. Review staged changes before pushing; ignore rules do not remove already-committed secrets.

The OpenCode SDK is pinned to 2.2.5. The keyboard runtime is vendored under `vendor/attack-shark-x87` with prebuilt native bindings, so installing this plugin from GitHub does not require Rust, Git preparation scripts, or remote tarball dependencies. Bindings are built natively by GitHub Actions from upstream commit `3d489cd0c71fb30e6f1729c213963c644e287fa1` for:

| Platform | Architectures |
| --- | --- |
| Windows | x64, ARM64 |
| Linux, glibc | x64, ARM64 |
| macOS | Intel x64, Apple Silicon ARM64 |

`SOURCE.json` records the upstream commit and per-binary SHA-256 values. Linux musl distributions such as Alpine are not supported. Runtime keyboard access may require operating-system permissions; on Linux, upstream documents a udev rule for USB `258a:010c` and 2.4G receiver `3554:fa09`, or root access. All targets are built and load-tested on GitHub Actions; only Windows x64 has been tested with the physical keyboard. Rerun `npm audit` before deployment; an earlier audit reported moderate advisories in the SDK dependency tree.

## License

[MIT](LICENSE) © 2026 The DT.

## Documentation

- [V2 plugin parts and loading](https://opencode.ai/v2/docs/build/plugins)
- [Server plugins](https://opencode.ai/v2/docs/build/plugins/server)
- [TUI plugins](https://opencode.ai/v2/docs/build/plugins/cli)
- [GUI plugins](https://opencode.ai/v2/docs/build/plugins/gui)
- [Plugin RPC](https://opencode.ai/v2/docs/build/plugins/rpc)
