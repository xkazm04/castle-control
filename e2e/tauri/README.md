# Tauri lane (e2e-night WP3)

Drives the **real cc-desktop window** (Tauri 2 + WebView2), not Chrome on Vite.
WebView2 exposes Chrome DevTools Protocol when it is started with
`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=<port>`, and
Playwright attaches with `chromium.connectOverCDP`. No tauri-driver or
msedgedriver is needed. Windows only.

No Twitch, OBS, credential or keychain access is involved: the app always
starts with **no arguments** (`--login`, `--client-id`, `--test-channel` are
never passed), so it has no native services and opens no store.

## Two variants, and why

The spark brief called the no-options launch "offline fixture mode". It is not:
`main.rs` picks fixture mode only for a dev build (`tauri::is_dev()`, no
`custom-protocol` feature). A packaged build with no options runs an in-process,
**offline core** (status only; Twitch bridge and OBS adapters absent) and the UI
talks to it over loopback `/rpc` and `/events`. So the lane runs both windows:

| Project | Exe | What the window loads | Mode | Title |
| --- | --- | --- | --- | --- |
| `tauri-built` | `cargo build -p cc-desktop --features custom-protocol` | embedded `apps/desktop/dist` at `http://tauri.localhost` | offline core | `Castle Control` |
| `tauri-fixture` | `cargo build -p cc-desktop` with `TAURI_CONFIG` devUrl → `127.0.0.1:5177` | Vite dev server the lane starts on 5177 | fixture `{mode:'fixture'}` | `Castle Control — SIMULATED` |

The fixture exe moves `devUrl` from 5173 (a person's `tauri dev` port, which was
busy tonight with the main checkout's Vite) to the lane-only port 5177 through
Tauri's compile-time `TAURI_CONFIG` merge. No product file changes.

## Commands (repo root)

```powershell
pnpm install --frozen-lockfile                          # once per checkout
node e2e/tauri/build.ts                                 # frontend + both exes
$env:NIGHT_OUT = "C:\path\to\.night\<date>\tauri"       # optional; default e2e/tauri-results
node node_modules/@playwright/test/cli.js test -c e2e/tauri.config.ts
```

`build.ts` copies the exes to `target/tauri-e2e/cc-desktop-e2e-{built,fixture}.exe`
(unique names so the orphan sweep can never touch the owner's own
`cc-desktop.exe`) and writes timings to `target/tauri-e2e/build.json`.
Measured on this machine: first cargo build of `cc-desktop` in an empty
`target/` 70 s; frontend 0.9 s; warm rebuild of both variants 9-23 s.

Ports: the CDP port and the reference Vite port are free ports chosen at run
time; only 5177 is fixed. If 5177 (or anything else the lane needs) is
unavailable, or the exe is missing, or CDP never answers within 45 s, that
project reports **`skipped: <reason>`** (Playwright skip annotation plus the
summary JSON) instead of failing or hanging. Every wait has a deadline; the
whole run has a 15-minute `globalTimeout`.

## What each project checks

The window is attached, then reloaded once so the whole boot is observed.
Tests, in order: native window title (via `Get-Process … MainWindowTitle`) and
document title; the Keep; keys 1-4 each followed by Esc back to the Keep; key 0
(Overview); `#/stream`; `#/demo`; network policy. Each visit asserts the URL, the
room's h1 (the Keep is identified by its `The keep` region because its h1
follows the selected chamber), and no "Opening the room..." placeholder.

After every test: no page errors, no console errors, no request outside the
window's origin and loopback. Fixture: zero `/rpc`. Built: `/rpc` only to
`127.0.0.1`. Two named exceptions, nothing broader:

- built: the offline core answers `bridge.status.get` and `obs.status.get` with
  the typed `unavailable` error over HTTP 400 (README of apps/desktop: the shell
  shows UNKNOWN). WebView2 logs each 400 as "Failed to load resource". Only those
  two method/code pairs and at most one log line per refusal are excused.
- fixture: WebView2's automatic `/favicon.ico` probe gets 404 from Vite dev.

Every visit also screenshots the window and the same route in headless Chrome
on a fresh Vite dev server sized to the window's viewport, and diffs the visible
text line by line (a masked view replaces digits). Differences are **reported,
not asserted**.

## Output (`NIGHT_OUT`)

- `tauri-results.json`, `html/` - Playwright JSON and HTML reports.
- `tauri-summary-<variant>.json` - one entry per window launch (a failed test
  restarts the worker and relaunches): status or `skipped: <reason>`, request and
  `/rpc` counts, refused RPCs, console/page errors, per-route text diff, and the
  processes that survived teardown.
- `screenshots/<variant>/<route>.png` and `<route>.vite.png`.

## Lifecycle

`launch.ts` starts the exe with an isolated throwaway WebView2 profile
(`WEBVIEW2_USER_DATA_FOLDER` under `%TEMP%\cc-tauri-e2e-*`), never the app's
own profile. `close()` disconnects CDP, `taskkill /T /F` the exe tree and the
Vite tree, then polls `Win32_Process` for any lane exe or any
`msedgewebview2.exe` whose command line names a lane profile, and deletes the
profile. `afterAll` fails if anything survived; global setup and teardown run
the same sweep for crashed runs.

## Results, 2026-11-01 (3 consecutive runs, base 19906b9)

| Run | Result | Wall time | Lane processes after | Profiles left |
| --- | --- | --- | --- | --- |
| 1 | 20 passed | 48 s | 0 | 0 |
| 2 | 20 passed | 48 s | 0 | 0 |
| 3 | 20 passed | 48 s | 0 | 0 |

- fixture window vs Chrome on Vite: **0 differing lines on all 13 visits**, 0
  `/rpc`, about 375 requests, all loopback.
- built window vs Chrome on Vite: identical across the 3 runs, 105 requests,
  12 `/rpc` to the loopback core, 2 excused refusals. Text differs on every
  route because the data source differs (core UNKNOWN / unavailable vs.
  simulated fixtures), e.g. Keep 21 lines only in Tauri / 40 only in Vite,
  room 1 29/273, room 2 67/267, room 3 35/252, room 4 75/204, each Esc return
  22/41, Overview 12/43, `#/stream` 8/26, `#/demo` 5/5 (only the rampart).

## Not proven

- The installer (`bundle.targets: nsis`) is not built or tested; the lane runs
  the debug exe with embedded assets. Release optimisation is not exercised.
- Keys are delivered through CDP `Input.dispatchKeyEvent` to `.desktop-root`,
  not through OS keyboard focus on the native window.
- Core mode with Twitch or OBS configured is out of scope (it needs live
  credentials); the built window only shows the offline core.
- Text equality is not pixel equality; screenshots are saved, not compared.
