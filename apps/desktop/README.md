# Desktop frontend (WP 0.5a)

Run `pnpm --filter @castle-control/desktop dev` for a browser preview. It defaults
to an isolated, generated fixture source, labelled in both the rampart and a
prominent banner on every route. After 1.5 seconds simulated invalidations update
the authoritative fixture read. No fixture can accept a core endpoint or session
capability, and fixture transport never calls fetch or opens a WebSocket.

WP 0.5b supplies the Tauri 2 shell in `src-tauri/`.
Before loading `src/main.tsx`, the shell injects an in-memory object at
`window.__CASTLE_CONTROL_LAUNCH__` with `mode: 'core'`, `endpoint` (an HTTP
127.0.0.1 root URL), and `session_token` (the core's per-launch 64-hex capability).
The launch object is read once, then deleted from the webview. Do not put it into URLs,
storage, environment files, logs or source. An invalid injection fails visibly
and never falls back to a simulated/live hybrid. The alternative preview object
is exactly `{ mode: 'fixture' }` and accepts no additional properties.

The client uses the contract's `invoke` door for POST `/rpc` and `parseEvent`
for `/events`. WebSocket authentication uses the existing `cc-events` and
`cc-session.<capability>` subprotocols, never a query token. Reconnects resume
with `since_seq`; every validated invalidation (including `bridge.status`,
`gatehouse.room`, and `resync`) refetches `status.get` and `bridge.status.get`.
Resync can reset the cursor. Reads in progress drain subsequent invalidations;
disconnection clears stale summaries and invalidates outstanding reads. Cleanup
cancels reconnect timers and ignores responses from stopped clients.

Stream live/viewers/uptime come only from `status.stream`; absent values read
unknown. Core process uptime never substitutes for stream uptime. Moderation
counts and Shield Mode come only from `status.gatehouse`, with absent summaries
unknown. Twitch comes from `bridge.status.get`, OBS from `status.obs_connected`.
In core mode, `bridge.status.get` answers `unavailable` until Twitch is configured;
the shell shows the bridge as UNKNOWN rather than an error.
Unknown-aware rampart composition reuses the kit's layout classes and individual
primitives because its boolean-only `Rampart` API cannot express absence. Shared
design tokens remain unchanged.

## AI-2 shell and routes

Open `#/keep` for the default landing, `#/overview` for Preview and Proclaim,
or `#/chamber/lottery`, `#/chamber/moderator`, `#/chamber/visuals` and
`#/chamber/studio` for a room. The replay deep link is
`#/chamber/moderator/drill`. Old chamber hashes and `#/moderator/drill`
redirect in place to those canonical routes. Unknown hashes, including the
removed `#/lottery/stage` and its children, return to `#/keep`.

All three surfaces load lazily under `src/shell/`. The rampart stays above the
scrolling work surface; one StewardBar stays below it. Keep tiles open rooms.
The overview has a 16:9 placeholder and four tiles: click or focus selects a
layer, Enter or double-click opens its room. Rooms retain the existing lazy
chamber pages and have a Breadcrumb and empty seal slot. The Map Room retains
its unconfigured empty state. Core mode never loads simulated chamber controls.
These are Wave 1 placeholders, not a claim of reference-level visual fidelity.

`packages/ui/src/shell.tsx` declares the only keymap, consumed by navigation:
0 opens overview; 1-4 open rooms; Esc returns to the room's landing/overview
origin; / focuses the Steward input; Enter opens the selected strip tile;
Delete belongs to a focused proposal; held Space belongs to the focused seal
control. Typing suppresses shortcuts except Esc. Modified keys, composition
and repeats never navigate. Native Enter on other buttons stays native.
Direct room links default to a Keep origin; switching rooms preserves origin.

The local `src/shell/steward-stub.ts` exposes ask, amend and tearUp, returning
the fixed reply "The Steward is not wired yet. No changes have been made."
with no proposals or focus change. Conversation/input state stays in one bar
across surfaces. Its visible label is SIMULATED STEWARD · SAMPLE DATA, including
in core mode. Speech is visibly unavailable. No network, model, RPC registration
or new contract identifier is introduced. Wave 2 replaces this seam with
`@castle-control/ui/steward`; this package imports nothing from that module.

Shared StewardBar, Breadcrumb and both SealButton variants are shown on the
component kit's AI-first shell controls panel in both themes. SealButton uses a
named 1,000 ms hold duration, visible native progress, and pointer/Space holds.
Release before completion, blur, lost capture, cancellation, hiding the page,
disabling or unmounting cancels. Click and Enter never seal. The completed hold
fires once until released. The desktop stub offers no proposals to seal or tear.

Deleted superseded files (and no domain page/model files):

- `src/lots-stage-copy.ts`
- `src/lots-stage-design.tsx`
- `src/lots-stage-model.ts`
- `src/lots-stage-page.tsx`
- `src/lots-stage-route.ts`
- `src/lots-stage.css`
- `src/lots-stage.md`
- `src/lots-stage.test.tsx`
- `../../packages/ui/src/stage-frame.tsx`
- `../../packages/ui/src/stage-frame.css`
- `../../packages/ui/src/stage-frame.test.tsx`

StageFrame had no remaining consumer after deleting the rejected stage; a
source import search confirmed that before the shared component was removed.

AI-2 verification, 2026-10-26: the new route tests first failed against the old
shell (5 failures), then passed. All UI tests passed (80 tests, 6 files) and all
desktop tests passed (85 tests, 9 files), including unchanged chamber/domain
tests. The hold test drives the actual pointer and Space handlers with fake
timers: early release does not seal, a full hold fires once, and cancellation
paths cannot seal. Route tests cover all surfaces, the drill, aliases, rejected
stage fallback, origin-aware Esc, typing suppression and strip Enter/double-click.
These are server renders and handler tests, not a mounted-browser smoke claim.

Both affected packages passed their package-gate typecheck and lint scripts;
the lazy kit module also passed ESLint. Boundaries, hygiene, file cap and secret
scan passed (420 code files, 541 scanned text files). Desktop build passed at
386,922 / 393,216 first-load bytes; the kit passed at 256,319 / 262,144 bytes
after deferring the new examples. The budgets were not changed. All three
surfaces and their existing chamber pages are separate emitted lazy chunks.

The full `pnpm gate` is **not green in this sandbox**: it passed the 14 tooling
boundary tests and workspace inventories, then stopped in the unchanged
contract exporter at `spawnSync cargo EPERM`. Read-only git comparison confirms
`scripts/gate.mjs` and the contract check/export scripts match HEAD. Recursive
pnpm typecheck and lint separately stopped at `spawn EPERM` before package work.
No gate or sandbox setting was changed. App Master must rerun the full gate in
its verification environment. No Rust check or full-workspace test pass is
claimed for this delivery. The node_modules junction was not installed over,
followed, removed or changed; no dependencies or lockfile changed.

Package `typecheck`, `lint` and `test` use the shared package-gate runner.
`build` includes an inventory-based first-load cap of 384 KiB uncompressed
JS+CSS for all four routes, including React DOM and generated contract validators.
Tests exercise keyboard dispatch plus actual shared-component renders, source
isolation, validated RPC/event transport, reconnect/resync, invalid payloads,
unknown state, and stale read races. They do not claim a mounted browser test.

The historical WP 0.5 production build had a shell entry and a lazy Gatehouse JS/CSS pair;
the latter loads its generated moderation fixtures only when that route opens.
At base `5073b63`, first load was 956,229 bytes: JS 933,059 (97.58%) and CSS
23,170 (2.42%). It is now 353,922 bytes: entry JS 337,975 (95.49%) and CSS
15,947 (4.51%), with deferred Gatehouse JS 24,685 and CSS 7,224 (77.36% and
22.64% of the deferred 31,909 bytes). Even all emitted JS/CSS totals 385,831
bytes, below the same cap. The unchanged checker counts every JS/CSS
reference in `dist/index.html`, including modulepreload links; this build has
two such references and 39,294 bytes of headroom under 393,216. Ajv now interns
shared definitions once (136 validator functions versus 393; standalone source
442,932 versus 1,113,369 bytes), and pure local metadata initializers plus static
method selections allow unused validators and dispatch Maps to be removed.
Boot RPC results, errors and events remain synchronously schema-validated; the
contract runtime is not dynamically imported. The generic parsing/invocation
API remains available. Route tests await React's server stream to exercise the
loaded lazy page and its original assertions. No Vite chunking override is used.

Verification on 2026-10-26: regeneration and drift checks passed against schema
exported by `cargo --offline run -p cc-types --bin export-contract`; parity
passed against the offline core registry export. All five packages passed their
individual typecheck, lint and test scripts (211 tests), including the existing
1,000-writ cases. Generator tests, contract-script ESLint, tooling checks,
`cargo fmt --all -- --check`, offline workspace Clippy and offline workspace
tests passed, including the 1,000-generated-draw verification property. The
boundary regression was proven red by bypassing result validation, then restored
and passed; a second red/green proof excludes bundled `dist` from parity scans
while still rejecting authored JSON parsing outside the door. `pnpm gate`
stopped at `spawnSync cargo EPERM`; the unmodified `5073b63` generator reproduced
the same sandbox denial. Recursive pnpm typecheck/lint also failed to launch
with `spawn EPERM`. Individual checks are evidence, not a green full-gate claim;
App Master must rerun `pnpm gate` outside this sandbox. Protected paths,
including `src/check-build.ts`, are unchanged.

Historical WP 0.5 visual comparison at 1440×900 remained owed: computer-use approval rejected the
Chrome action during this run. Source-level differences from the prototype are
intentional shell empty states replacing populated heroes/panels, an added
simulated-source banner and search row above the header, unknown status chips,
disabled Steward, and no settings control in this frontend cut. These shift the
page header vertically and change rampart widths. The sidebar's Brand sheet link
targets the local shell-information note until a brand page exists. Inherited
kit differences (13 px labels, text-only moderation/Steward, reconstructed
symbols, missing secondary-link icons and shared empty artwork) remain recorded
in `docs/ui/inventory.md`. No pixel-fidelity or screenshot claim is made.

## Tauri shell

Windows is the M0 target and needs the Rust/MSVC desktop build tools, Windows SDK
and WebView2 runtime. The shell crate is `cc-desktop`, a Cargo workspace member.
Its version comes from the workspace package. No npm Tauri dependency is needed.

**Built frontend / real core:** from the repository root, build the frontend,
then run the native shell with the custom-protocol feature:

```powershell
pnpm --filter @castle-control/desktop build
cargo run -p cc-desktop --features custom-protocol
```

This embeds `apps/desktop/dist`, loads it at `http://tauri.localhost` on Windows
(`use_https_scheme(false)`), and starts an in-process core on `127.0.0.1:0`.
With no arguments the core has disconnected status and unavailable adapters;
unknown stream and Gatehouse summaries stay unknown. It is real core mode,
not a fixture. For the owner-attended spike, supply the public Twitch app client
ID and the owner's test-channel **login**, not a channel URL or numeric ID:

```powershell
cargo run -p cc-desktop --features custom-protocol -- --client-id YOURPUBLICCLIENTID --test-channel your_test_channel --login
```

These arguments are deliberately non-secret and are the only Twitch configuration
source in this shell. No client secret, access token, refresh token or session
capability is an argument. With those paired values, the shell opens its store
under Tauri's app-data directory (`io.castlecontrol.desktop/store`), constructs
`NativeServices`, and attaches it to that same core. `--login` starts device-code
login through cc-core's provided Windows `LoginPresenter` (browser plus native
dialog); omit it to try an existing keychain grant. This command is for the
owner's test channel only. It never performs an armed action. OBS defaults to
port 4455 and keychain account label `streamer` within service
`castlecontrol-obs`; the optional public `--obs-port` and
`--obs-password-label` select a different port/label, never a password. The owner
prepares OBS v5 and its keychain entry separately. Shell close calls core shutdown;
it does not revoke Twitch authorization or purge recordings.

With an already-installed Rust Tauri CLI, `cargo tauri build --debug` from
`apps/desktop` is another built-frontend path, after the frontend build above.
Bundling is disabled for M0; from the repository root run
`.\target\debug\cc-desktop.exe` with the same public arguments. This debug binary
uses the custom protocol and real core too. The feature, not optimization level,
selects embedded assets. These are live-core verification commands; no live
Twitch/OBS or mounted-webview run is claimed by this delivery.

**Vite / fixtures:** in one terminal run
`pnpm --filter @castle-control/desktop dev --port 5173 --strictPort`, and in
another run `cargo run -p cc-desktop`. `cargo tauri dev` from `apps/desktop`
with the configured `devUrl` has the same fixture behavior (start Vite first).
The title says `SIMULATED`, the rampart says `Simulated`, and every route keeps
the `SIMULATED SOURCE` banner. The injection is exactly `{mode:'fixture'}`;
there is no core, keychain/store access, login, or live adapter in this mode.
Native options are rejected rather than ignored in Vite mode. Vite's origin is
not added to core's allowlist. The endpoint/capability injection is only for
the built frontend. See [Tauri's configuration reference](https://v2.tauri.app/reference/config/)
for `devUrl` and `frontendDist` behavior.

The shell installs its guarded, main-frame initialization script before the
frontend entry point. Only its configured origin can navigate in the window;
new windows and external navigation are denied. The existing fetch/WebSocket
transport is unchanged. The main window has no native IPC permissions, no shell,
filesystem or HTTP plugin. CSP permits scripts from the frontend's own origin
and network connections only to HTTP/WS `127.0.0.1` ports; it loads no remote
script. No frontend output is committed. Default `cargo test --workspace` uses
the configured dev URL at compile time, so it needs no `dist` directory or Node.

Verification evidence is split at the unchanged frontend boundary:

- `cargo test -p cc-desktop` checks strict public arguments, exactly three
  injected core keys, loopback-only endpoints, origin-restricted navigation,
  empty native permissions, CSP, actual core CORS acceptance of the built origin,
  disconnected defaults, unavailable adapters, graceful shutdown, and captured
  trace logs with no 64-hex capability. It contacts only an ephemeral loopback
  core with no native services or account credentials.
- The existing frontend tests `rampart.test.tsx`, `events-view.test.tsx`,
  `navigation.test.tsx` and `client.test.ts` cover authoritative rampart summaries
  on all four routes, event-driven refetches, keys 1–4 and `/`, and visible fixture
  isolation. Their pnpm execution is owned by the external merge gate in this
  builder sandbox. Keys 1–4 work with the shell focused; typing in inputs does
  not navigate. Real stream/room summaries still depend on their authoritative
  producers (M1 and later); the shell never invents them or displays chat bodies
  that core's current invalidation-only events do not expose.

Recorded on Windows, 2026-10-25, based on main `22edc95`: the five shell tests
passed. Seeding an HTTPS endpoint made the injection test fail at its HTTP-scheme
assertion; the seed was restored. Final `cargo --config net.offline=false fmt
--all -- --check`, `cargo --locked --config net.offline=false clippy --workspace
--all-targets -- -D warnings`, and `cargo --locked --config net.offline=false test
--workspace` each exited 0 (85 tests plus one doctest). `apps/desktop/dist` was
absent throughout. An initial registry refresh failed with Windows Schannel
`SEC_E_NO_CREDENTIALS`; cache-only resolution produced the lockfile, after which
the final online-enabled locked checks passed. No previously locked package
version was removed. pnpm-recursive gates: **ran outside: merge gate**; they were
not executed by this builder. The built-frontend WebView2 run, keyboard smoke
check and owner-attended Twitch/OBS spike remain operator checks using the
commands above, not recorded live results.
