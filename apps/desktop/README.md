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
Its version comes from the workspace package. D4 pins the official
`@tauri-apps/api` client to 2.12.4 for the two rehearsal relaunch commands.

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
transport is unchanged. The main window exposes the two application rehearsal
commands described below; it has no shell, filesystem or HTTP plugin. CSP permits scripts from the frontend's own origin,
Tauri's `ipc:` / `http://ipc.localhost` bridge, and HTTP/WS `127.0.0.1` ports; it loads no remote
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

## Dress rehearsal host (D3b)

With the built frontend, launch `cc-desktop --rehearsal` without a Twitch client
ID or test channel. Optional `--obs-port`, `--obs-password-label` and
`--overlay-port` have the same validation/defaults as native mode. The title is
**Castle Control · SIMULATED · Dress rehearsal**. This is the real native core:
Lots, Gatehouse, Beacons, the separate read-only overlay listener, render host,
and D3a's OBS connection/scene/ownership methods. The launch injection remains
the core's existing three-key object; `status.get.simulated` is true.

Rehearsal state lives under `store/rehearsal`, separate from the owner's native
rules, recordings, settings, draws, OBS ownership ledger and beacon opt-in.
NativeServices always receives an empty Twitch client ID/channel in this mode,
even if public native arguments were retained for leaving rehearsal. The bridge
starts no Twitch session. The registry rejects `auth.twitch.start` and
`auth.twitch.revoke` with `blocked_by_policy` before the native adapter; auth
status stays disconnected. `--login` and `--steward-live` are rejected together
with `--rehearsal`.

D4 can invoke these **Tauri commands**, with no arguments:

- `enter_rehearsal`: relaunch the installed app with `--rehearsal`.
- `leave_rehearsal`: relaunch without `--rehearsal`. If entry retained paired
  public native settings, those resume native mode; otherwise the app returns
  to its default disconnected core. Device login and live Steward opt-in are
  never replayed by either command.

These commands are available only in the main built-frontend window. Invoking
the current mode is a no-op; a second pending relaunch is refused. Entry/exit
mint and inject a fresh core session capability in the new process. Public OBS
configuration and a chosen overlay port are retained. The internal `--relaunch`
marker enables up to 50 startup attempts, spaced 100 ms apart, to allow the old
process to release stores and listeners; ordinary launches still fail promptly
on an occupied port. A persistent startup failure uses the existing fixed error.

**Composition choice: option (b).** CoreHost shutdown signals the RPC/event
server, but NativeServices only aborts its native workers on Drop, and the
current APIs do not join all overlay, bridge, OBS-probe and module workers.
Switching composition inside the same process would therefore lack a proven
port/store release boundary. The process relaunch also discards any in-memory
OBS password; reconnect through D3a, or use its explicit keychain remember door.

After entry, D4 connects to the owner's OBS with `obs.connect`, ensures
`Castle Control · Rehearsal` with `obs.scene.ensure`, and calls `rehearsal.start`.
Start/stop are idempotent and emit `rehearsal.status` invalidations; the module
also publishes the typed RehearsalStatus binding to Rust subscribers. Calling
start again reads current OBS/scene status without resetting the active session.
The scene name is omitted until the peer reports that scene. Stop preserves
configuration and OBS sources; D3a's explicit `obs.rehearsal.clear` owns cleanup.

`rehearsal.crowd.set` selects 0..600 messages/minute with bounded interval jitter;
nonzero crowd requires an active session. Stop cancels and joins the crowd,
scenario and generated-chat consumer tasks and clears Beacon test-fire previews.
The private generated-chat sender feeds ShadowPipeline with RulesOnly; every
message is SIMULATED, has a `simulated_viewer_<n>` login and a
`simulated-rehearsal-` message ID. No RPC accepts chat text or identities.

Scenarios spawn and return `{accepted:true}` immediately, or `{accepted:false}`
while inactive. `lots_fill` reuses an open rehearsal keyword draw (creating one
when needed), sending 20 distinct simulated viewers over about four seconds.
New draws appear in `lots.draw.list` as **SIMULATED rehearsal questions**, with
IDs beginning `simulated-rehearsal-`; use their IDs for `lots.source.url`.
`vote_round` sends 30 opinions over about five seconds. `duel_round` sends 30
`SIMULATED duel ballot left|right` messages, in a 20/10 split, for the existing
desktop ballot feed. `beacon_fire` requires `visual_id` and uses the existing
`beacons.simulate` path with a generated 100-bit burst; a missing ID is `invalid`.
Background scenario failures emit a fixed diagnostic without message bodies.

**Open scope issue:** the production Herald currently has no direction seeds
(`cc-gatehouse/src/analysis.rs`), so real consensus ingestion populates **Other**.
D3b verifies a nonempty, SIMULATED vote-bar snapshot; distinct direction shares
require a separately assigned Herald configuration change. No direction schema,
seed configuration or Tiltyard Rust tally/page is introduced here.

Director verification: `cargo test -p cc-core -p cc-desktop`, followed by
`pnpm install --frozen-lockfile` and `pnpm gate`. Added tests cover idempotent
status/events, crowd rate/provenance/cancellation, asynchronous vote/duel bursts,
the real vote-bar page, a sealed Lots page using the existing recorded beacon,
Beacon simulation/stop, OBS scene status, inert Twitch/auth refusals, host
registration, isolated storage, public relaunch arguments and overlay-port
handover. Test roots use PID plus an AtomicU64 counter and best-effort Drop.
The builder ran standalone rustfmt and source gates only; Cargo, the full gate,
the installed-app relaunch and the owner's OBS smoke test remain for the Director.

## Dress rehearsal screen (D4)

Open **Dress rehearsal** from the Keep or `#/rehearsal`; Back and Escape return
to the Keep. This lazy surface has the Keep's Steward context and no chamber
identity. Fixture preview explains the real core / own OBS / generated
SIMULATED chat / no Twitch login workflow and disables Start with the kit's
"needs the desktop app" Notice. No fixture RPC or native command runs.

A schema-validated successful `rehearsal.start` establishes the workspace,
including a sticky SIMULATED Stamp. Control invalidations refetch authoritative
state. The model consumes the start method's own status echo to avoid a read
loop, drains concurrent invalidations, ignores disposed reads, and protects
connection mutations from stale status reads. Disconnection drops the shell's
rehearsal connection instead of retaining actionable stale status.

The OBS form defaults to 127.0.0.1:4455 and Remember off. Its uncontrolled,
masked password has autocomplete disabled and is cleared before asynchronous
submission; no password or resolved source URL enters a read snapshot. Parsed
core errors show only their message. Scene setup uses **Castle Control ·
Rehearsal**. Each virtualized output has its own existing 1080p / 720p / vertical
preset and the shared proclaim hold. Lots uses the actual rehearsal draw ID
from Lots state; until Fill a Lot creates it, the row says **Fill a Lot first**.
An accepted seal in the existing Lot Chamber is needed for that plate's
SIMULATED disclosure; filling itself does not seal. Entering rehearsal explicitly
selects the real, pinned drand quicknet beacon with the system clock. Casting
fetches and verifies a public round over HTTPS and needs internet access; the
entry screen says so before Start. No native opt-in file is read or written and
no recorded randomness is substituted. The Lot Chamber identifies a live-trusted
public round separately from its SIMULATED audience. Duel stays **coming** while
its declared source method is unavailable. Cleanup uses a separate shared hold
and reports the core's removed count. Scenario buttons use the four existing
identifiers; the crowd slider debounces 0–600/minute, keeps a pending change
across busy operations, and cancels pending submission on unmount.

Start/Leave dynamically load `invoke` from `@tauri-apps/api/core` on button press,
pinned to 2.12.4 (matching
the Rust crate; [official package metadata](https://github.com/tauri-apps/tauri/blob/dev/packages/api/package.json)).
Only core mode inside Tauri receives the mockable shell door; Vite/fixture mode
and the browser night harness keep the disabled Notice. The build's AppManifest
enumerates only `enter_rehearsal` and `leave_rehearsal`; the main-window capability
grants only their generated allow permissions. A Rust policy test checks the
exact manifest, handler registration, capability and CSP inventories. See the
[official ACL build API](https://docs.rs/tauri-build/latest/tauri_build/struct.AppManifest.html)
and [IPC CSP policy](https://v2.tauri.app/security/csp/).

Added evidence (authored, **not executed in this builder sandbox**): co-located
Vitest model/rendering tests; fixture `e2e/dress-rehearsal.spec.ts`; the canonical
route/theme/Steward style matrix; `e2e/night/rehearsal.spec.ts`; and the shared
night journey exercised by the isolated OBS lane in `e2e/night/obs.spec.ts`.
The latter saves Lot/vote-bar/Beacon screenshots before clearing and verifies
owned inputs disappear. The generated OBS peer covers scene/input ownership
operations and has a state/cleanup unit test. `CC_NIGHT_REHEARSAL=1` selects
`app_rehearsal` in the existing example. The launcher passes a generated password
in memory to the peer and masked UI field; night traces remain off and no
password is printed or attached. The journey seals and casts the generated Lot
through the existing UI, waits for its verified writ, checks parsed control
events, and requires SIMULATED on all three overlay pages. Rehearsal lanes
deliberately pass `lotsBeacon: 'off'`: that flag applies only to the native
composition and cannot disable rehearsal's explicit public quicknet source.

**D4 review correction:** the initial night lanes reached a disabled-beacon
refusal at seal, leaving the UI's conservative uncertain-seal lock in place.
`app_rehearsal` had used native Lots, whose missing opt-in selects NoBeacon;
the earlier Rust scenario test injected RecordedBeacon and missed that path.
The isolated desktop rehearsal directory also had no opt-in. This was not
fixed by adding a fixture source: the composition now explicitly constructs
the existing real LiveBeacon. `status.get` still follows the native handler,
sets the existing simulated provenance bit, and validates its result. The
rampart now shows actual core OBS/bridge connection state alongside SIMULATED
provenance rather than hiding those adapters behind simulated chips. Unknown
still means a missing read, never an invented disconnected state.

`crates/cc-core/tests/rehearsal_transport.rs` exercises authenticated HTTP status,
the browser's WebSocket subprotocol handshake, real control invalidations,
native OBS status, a current-time quicknet seal, its future-round cast gate,
and the SIMULATED plate with an intentionally unusable native opt-in. It makes
no round fetch; both night lanes cover the real HTTPS cast. The updated night
journey also rejects malformed event frames and checks the connected rampart
before and after casting, so the reported interrupted-shell symptom is covered.
The Director recorded the initial fixture route/journey matrix at **88/88**;
that predates these review corrections and is not a new execution claim.

The native shell uses a distinct `nativeInvoke` door with two literal commands.
The unchanged parity scanner also recognizes named-import aliases, so the
dynamic module namespace is destructured instead. A generator regression checks
the actual shell source and proves that nonliteral core RPC aliases still fail.
The SDK is absent until Start/Leave is pressed; the workspace and its stylesheet
remain behind the same React lazy boundary as stream setup.

The Director's round-two build counted **440,327 / 393,216** first-load bytes
across eight HTML JS/CSS references. In that artifact, using the existing
independent `/lots` and `/gatehouse` handles instead of root-barrel handles
defers 70 validator declarations (99,855 bytes). The arithmetic projection is
**340,472 bytes** before rebundling/name overhead; this is not a measured new
build. The unchanged budget remains the acceptance check on the Director's build.

The round-two failure screenshot already shows the cast plate's foreground
SIMULATED badge. Lots intentionally hides its server fallback after the renderer
mounts; the journey now selects `.draw-scene > .simulated` beside visible winners,
the Beacon's `[data-simulated-badge]`, and the vote bar's own badge. No plate badge
was hidden while its result was visible. The isolated OBS lane now retries
Identify plus GetVersion for at most 30 seconds before starting each core relay.
After the UI clear it independently lists global inputs, scenes and scene items;
teardown repeats the core clear and the independent absence check. Missing or
malformed inventories and remaining owned inputs fail the test. An empty retained
test scene is removed before the sibling test; cleanup failures are never logged
and ignored. Post-cast connection checks wait for the asynchronous native probe.

The Director has verified Rust tests and 176/176 fixture e2e tests before these
round-two corrections. Here, the five generated-peer Node readiness/cleanup tests,
contract generator/parity regressions, desktop TypeScript compiler API check and
static source checks pass. The SDK lazy-load Vitest assertions await the Director,
along with `pnpm gate`, the production byte count, both night lanes, screenshots
and installed-app relaunch.

D4 round-four regression verification: the headless Node Vitest API passes all
1,053 desktop tests in 109 files; the TypeScript compiler API reports no
diagnostics across 289 files. Bootstrap and each real lazy Steward route now
have separate tests with the unchanged timeout. Keep actions retain their
existing callback assertions, and the password test inspects the input element's
mask, autocomplete and uncontrolled props independently of HTML attribute order.

The final isolated OBS review found a capture-lifecycle defect in the night test:
the new rehearsal scene remained outside Program, while the passing native test
used the active `Scene`. In obs-websocket 5.7.6, `GetSourceScreenshot` only holds
showing around a single render call; CEF visibility/painting is asynchronous
([upstream implementation](https://github.com/obsproject/obs-websocket/blob/5.7.6/src/requesthandler/RequestHandler_Sources.cpp)).
The isolated capture now selects the rehearsal scene, waits up to 15 seconds for
Program and every input's active/showing state, then uses the existing unchanged
45-second pixel-readiness poll. A `finally` restores the prior Program scene
before owned-source cleanup, including on capture failure. No product scene
switch was added. The test also compares OBS's Lot input URL with the exact
sealed/cast page already verified in Chrome: `/lots/<draw-id>` with no query.
Seal, verified quicknet cast and durable writ all precede source creation and
capture; `lotsBeacon: 'off'` still cannot disable rehearsal's real beacon.
Ten generated-peer capture/readiness/cleanup tests pass, and the e2e TypeScript
compiler API check passes across 49 files. The real-OBS rerun remains Director-run.

The final gate's event-render timeout is covered by six separate cases (four
chambers, Keep and Overview), each retaining the default five-second deadline
and all prior assertions. The complete 900-cast parity corpus stays in one test
with a documented 15-second CPU/crypto budget. Two full Node Vitest API runs each
passed 1,073 tests in 109 files, with no failures, skips or unhandled errors.
The slowest event-route cases took 875.08 / 736.90 ms; the 900-cast test took
1,303.53 / 6,081.52 ms in runs one / two respectively.

## D5c: Tiltyard on the core tournament

In CORE mode the Map Room opens the core-owned Chat tournament. Start submits
the existing SAMPLE contestants with decimal-string seeds, `mill` key and a
15-second window. Calls, close/next, pause/resume, undo, new vote and speed use
`maproom.turn.run`; `maproom.turn`, resync and reconnect refetch
`maproom.stage.get`. Live counts also refetch after moderation verdict events
and through a one-second stage polling fallback. The returned snapshot supplies
all counts and decisions.
Showdown and Ladder remain labelled local demos. FIXTURE mode is unchanged.

**Duel on stream** copies `tiltyard.source.url`; `#/stream` also offers a Duel
row with the existing source-size controls and human hold. Core errors and
disconnection appear beside the stage. Details and acceptance-test evidence
are in [the studio delivery notes](src/rooms/studio/TILTYARD_LIVE.md).

Round-three Node Vitest API verification passed the full desktop suite
(1066 tests in 109 files), UI suite (492 in 38) and duel suite (382 in 14),
with no failures or skips. The core view and shell test retain an explicit
SAMPLE-starter / core-counted Gatehouse-ballot provenance disclosure.
Round-four Node runs pass desktop 1068 tests, UI 492 and duel 382. The night
driver now sends valid leading `1`/`2` ballot tokens; the prior driver sent
chatter. Core stderr and exit metadata go to `NIGHT_OUT/core-stderr.log`, with
stdout/handoff retained only in memory. Rust regressions cover calls, deadline
close and advance. Their execution and the corrected browser lane remain
Director-run; this builder did not run cargo, pnpm or browsers.
