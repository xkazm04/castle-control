# Desktop frontend (WP 0.5a)

## On-stream demo (delivery A)

From `#/keep`, choose **See it on stream** beside **Enter the keep**, or open
`#/demo` directly. Back and Escape return to the keep through the existing
navigation/keymap. There is no first-run path in the app; none was added.
The lazy demo retains the rampart and Steward. It is a non-chamber surface:
it never becomes a ModuleId, ThemeFrame module or StewardContext chamber, and
its Steward context is the keep's context.

The stage follows `prototype/assets-2026-10-30/atlas.html` at `7270e60`:
16:9 container-query geometry, four captioned overlays, the camera, nine
simulated chat lines and three Extension panels. The segmented controls choose
six styles, Game + cam / Just chatting, and three Malakor shots. Just chatting
hides the camera and uses the selected shot as background; Facecam maps to
the wide lair. Game + cam always uses the war map. The visible provenance is
**SIMULATED · SAMPLE ART · AI-generated**. Art is illustrative and the demo
does not make chamber, network or live mutation calls.

`public/art/` holds exactly 34 byte-identical copies of the selected atlas WebPs:
six styles × (urn, altar, votebar, hexmap, frame2), three Malakor shots and the
war map. The shared URL convention is **`/art/preset-<style>-<asset>.webp`**;
style IDs are `heraldic`, `pixel`, `synthwave`, `watercolor`, `anime`, `glass`.
Vite's default publicDir copies these to `dist/art/`. No clay, comic, round-one
frame or throne background is shipped. The owner's frame pick is still pending:
`src/demo/model.ts` has the sole style-to-frame URL map, provisionally using
`frame2`; replace the affected entry when the owner picks a frame.

Verification in this worktree: desktop typecheck, lint, all 332 tests in 37 files,
and production build pass. The unchanged first-load cap passes at
364,604 / 393,216 JS+CSS bytes; demo JS and CSS are separate lazy chunks.
All 34 images also appear in `dist/art/`. The 16 focused tests cover controls,
captions, provenance in both layouts, all 36 combinations' asset URLs,
byte equality, canonical routing, keep entry, Back/Escape, and keep-equivalent
Steward context. `scripts/check.mjs secrets` passed without modification.

The e2e inventory now discovers eight canonical routes. Its narrowed navigation
harness test, e2e TypeScript check and e2e ESLint pass. Browser tests were attempted
with `pnpm --config.verify-deps-before-run=false exec playwright test -c
e2e/playwright.config.ts e2e/demo.spec.ts`, but the sandbox returned `spawn EPERM`
before browser execution. Mounted interaction, plate visibility and screenshots
remain unverified here. The Director can run that command at both configured
viewport sizes, plus the existing canonical route/theme/Steward audit. No
existing audit or safety-label assertion was removed.

`src/view.css` sets the desktop body/root base font (`--font-ui`), ink and paper.

Production CSS depends on the tokens entry being declared side-effectful; marking
only CSS files let tree-shaking remove its stylesheet import (also in the UI kit).
Both build checks now derive token names from the generated tokens stylesheet,
print the number defined in initial CSS, and fail if any generated name is missing.
The guard rejected the broken build at 2/122 names; the fixed build defines 122/122.

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

## AI-first Keep and Overview (AI-3 / AI-4)

Run `pnpm --config.verify-deps-before-run=false --filter @castle-control/desktop dev`
in an ordinary checkout with dependencies already installed. Do not install over
worktree node_modules junctions. For an isolated production preview, build the
desktop then run `pnpm --config.verify-deps-before-run=false --filter
@castle-control/desktop exec vite preview --host 127.0.0.1`.

Open the reported local URL with `#/keep` for the printed cross-section or
`#/overview` for Preview and Proclaim. Review both at **1440x900** and **1280x800**
CSS viewport sizes, in paper and dark stock. The reference pages are
`prototype/ai-first/keep/index.html` (home view) and
`prototype/ai-first/preview/index.html`. Illustrations and surfaces load lazily.
The desktop first-load cap remains 393,216 uncompressed JS+CSS bytes; no budget
was raised. Program text uses the existing 13 px small-text token, above its
12 px minimum; other readable text stays at least 13 px.

The Keep has four inked chamber towers, a Herald watch tower and a moat. Rule
counts and Shield Mode use the current snapshot. In fixture mode, lot, hold,
delay, consensus and visual summaries use the existing generated chamber
fixtures. Live chamber values absent from the core read model remain unknown.
Every fixture room is labelled sample data. Clicking a room or pressing 1-4
opens its detail room. Enter the keep or 0 opens Overview.

Overview combines a 16:9 illustrative crypt scene with four selectable chamber
layers, a separate simulated Program monitor, Talkback/Inspector tabs, a shared
Steward panel and the chamber strip. The urn/writ, chat/vote bar, altar/camera
frame/border and war table are components, not prototype string HTML. Supplementary
crypt art and the generated 54-tile layout are explicitly illustrative, in
`src/overview/fixture.ts` and the drawing components. Held sample chat is greyed
in Preview and filtered out of Program. The draw fairness box remains visible
below the scrolling proposal list whenever the draw layer is inspected.

There is one Steward input on each surface, always labelled
**SIMULATED STEWARD · SAMPLE DATA**, and one shared proposal queue imported from
`@castle-control/ui/steward`. The local stub has been removed. SimulatedSteward
runs through StewardPort; it makes no model, network or live mutation calls.
The conversation persists across routes and its Talkback list is virtualised.
Speech stays visibly unavailable. No wire method or identifier was introduced.

To exercise the draft loop in Overview:

1. Tell the Steward `draft a question draw`.
2. Tell it `make it 5 winners`. One proposal remains in the queue: 3 is struck
   and 5 is re-inked both on the preview layer and in the Inspector.
3. Preview carries **DRAFT · NOT ON AIR**. The Program picture stays unchanged.
4. Hold **Hold to seal and proclaim** below Program for one continuous second.
   This is the Overview's sole authorization path. Click, Enter or an early
   release cannot authorize. Changing proposal/revision replaces the control
   and cancels any unfinished hold.
5. The completed hold seals the proposal and updates only simulated Program.
   The frozen generated sample roll is sorted by handle, JSON encoded and hashed
   with SHA-256. Its displayed hash is illustrative proof of those sample bytes,
   not a live draw writ or a verified drand result. Prize proposals are refused
   here and must pass the room's policy checks. No prize, chat or viewer action
   reaches Twitch, OBS or the core.

Inspector and detail-room integrations use the exported queue singleton; app
code creates no second proposal queue. Program stores immutable authorized
presentation snapshots, separate from drafts. A later draft or tear cannot
change its already authorized picture. Shared ProposalCard defaults to a hold
and Tear it up; Overview places its hold below Program instead of duplicating
it inside the Inspector. ChamberStrip, ProgramMonitor, DraftFrame and ProposalCard
are exported by the UI kit and demonstrated under AI-first shell controls in
`packages/ui/kit`, in both themes.

The sole keymap stays in `packages/ui/src/shell.tsx`: 0 opens Overview, 1-4 open
rooms, Esc returns to the room's Keep/Overview origin, / focuses the Steward,
Enter on a strip tile opens its room, Delete tears the focused visible proposal,
and held Space operates the seal control in focus. Strip click/focus selects a
layer; double-click opens its room. Typing suppresses navigation shortcuts.
Existing DesktopView chamber/test props and the Room mount contract are retained.
The parallel room work owns `shell/room.tsx` and the domain chamber pages/models.

Automated evidence is in `src/shell/surfaces.test.tsx`, `src/keep/keep.test.tsx`,
`src/events-view.test.tsx`, the route tests, and each new shared component's test.
They cover snapshot propagation, one input, navigation, focus, Delete, shared
queue amendment, draft rendering, hold-only publication, sample SHA-256 and the
held-chat filter. Source hygiene checks cover boundaries/cycles, the file cap
and secrets. Visual screenshot comparison remains for the Director: this
headless run's Computer Use attempt was rejected because Chrome was not approved.
AI-3 / AI-4 verification, 2026-10-26: affected package-gate typecheck and lint
passed for desktop and UI. The complete desktop suite passed 92 tests in 11
files; UI passed 175 tests in 13 files. The new draft-frame and Program-monitor
tests were first run red against absent components, then green. The desktop
production build passed at 385,435 / 393,216 first-load bytes, and the kit at
256,319 / 262,144. `git diff --check` passed. No dependency, lockfile, registry
contract, token, Rust or domain-model file changed.

`pnpm gate` is not green in this sandbox: 14 tooling tests and workspace
inventories passed, then contract export stopped at `spawnSync cargo EPERM`.
Recursive typecheck, lint and test each stopped at `spawn EPERM` before package
execution. The root tooling lint and the affected package checks pass
individually. App Master must rerun the full gate; Rust/schema parity checks
were not run to completion here. This matches the existing sandbox limitation
recorded below; gate scripts remain unchanged. Screenshot verification is also
pending, with opening instructions and the Chrome approval rejection above.

## Historical frontend verification (WP 0.5)
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

To keep OBS Browser-source URLs stable across desktop restarts, opt into a
chosen free overlay port with `--overlay-port 17891` alongside the public native
arguments above. Reuse that port on every launch: overlay URLs then keep the
origin `http://localhost:17891/` (for example, `/lots/questions`). This selects
the separate read-only overlay listener, not obs-websocket's `--obs-port` or
the core RPC port. The flag accepts ports 1–65535; zero, invalid values, missing
values and repeated flags are rejected. If the port is already occupied, native
startup fails with the existing fixed diagnostic; choose a free port rather
than expecting a fallback. Without the flag, the overlay still requests port 0
from the OS and receives an ephemeral port. No fixed default port is shipped.

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
  trace logs with no 64-hex capability. The `overlay_port_*` options tests pin
  default port 0, explicit ports and fixed rejection diagnostics. The host test
  `native_overlay_reuses_the_requested_port_across_restarts` serves the requested
  loopback port across two starts with simulated native settings and temporary
  stores, refuses an occupied port with the existing fixed error, and keeps the
  three-key launch payload unchanged. No owner-channel or live OBS test is claimed.
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
