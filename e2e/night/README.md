# Night lanes

Two unattended lanes that drive the desktop UI against a real Castle Control
core and end on the OBS pages each action caused. Neither needs the owner, a
Twitch login, a keychain entry or the owner's OBS. Every chat message is
generated and labelled SIMULATED.

## Core lane

```powershell
pnpm --config.verify-deps-before-run=false exec playwright test -c e2e/night.config.ts
```

- Environment: `NIGHT_OUT` (default `e2e/night-results`) receives `report.json`,
  `html/`, `test-results/` (failure screenshots) and `core-stderr.log` (append-only
  core stderr plus timestamped PID/start/exit code/signal and `requested_stop`).
  The logger never receives stdout or its capability handoff. `PLAYWRIGHT_JSON_OUTPUT_FILE`
  and `PLAYWRIGHT_HTML_OUTPUT_DIR` override the two report paths.
  `CC_NIGHT_PORT` (default 5284) is the Vite port.
- Run time is about 35 s warm. A cold `cargo build` of the core example comes first.
- Needs network for the Lots journey: the seal uses the public drand quicknet.

What it proves, through the UI in Chrome in CORE mode:

| Spec | UI action | Ends on |
|---|---|---|
| `lots.spec.ts` | create the no-prize question draw, 2 winners, rename, 6 SIMULATED `!join` viewers, entry lookup, guardrail check, hold to seal, cast once the drand round arrives | `/lots/questions` lists the same winners and carries the accepted cast |
| `beacons.spec.ts` | create a visual, tune its curve, copy its browser-source URL, test-fire 10 bits | the already-open `/beacons/{id}` moves to intensity 0.5 through `/push/beacons`, with the SIMULATED badge |
| `gatehouse.spec.ts` | 9 SIMULATED duel ballots, refresh the room, copy the vote-bar URL | the already-open `/gatehouse/current` gains its bar through `/push/gatehouse`; no chat text reaches it |
| `gatehouse-ban.spec.ts` | Dress rehearsal core: write `No boss spoilers` on the rule bench (action Ban), arm it, set the SIMULATED crowd, confirm the proposed ban | the ban review lists the generated spoiler chatter, then records `SIMULATED ban recorded`; `status.get` still reports no Twitch session |
| `tiltyard.spec.ts` | desktop starts the core Chat tournament, copies Duel on stream, receives two generated ballot bursts, calls the right card against a 6–3 tally | desktop and the already-open `/tiltyard/current` agree on live updates, pair, counts, call verdict and next match; a room revisit retains core history |
| `stream.spec.ts` | `#/stream`: a missing scene is refused, then hold to add the vote bar and a visual | `obs.source.create` reaches the fake OBS peer; the CreateInput requests and results are checked, and both URLs load |

## OBS lane

```powershell
node scripts/night/obs.mjs
```

- Environment: `NIGHT_OUT` (default `e2e/night-results/obs`). It prints
  `skipped: <reason>` and exits 0 when it cannot run safely, exits 1 on failure.
- Output: `obs-lane.json` (outcome, reason, every step), `obs-screenshots/*.png`
  (one per source), and the Playwright reports.
- Run time is about 40 s.

It skips when an `obs64` process is already running, OBS is not installed,
there is no `global.ini`, or port 4466 is taken. Otherwise it:

1. Backs up `%APPDATA%/obs-studio/global.ini`, `user.ini` and
   `plugin_config/obs-websocket/config.json` into `NIGHT_OUT/obs-backup`. OBS writes
   the two ini files on exit, and the websocket plugin rewrites its `config.json` on
   every start. It never saves the launch-line port or password into it.
2. Creates only the profile and scene collection `CastleControl-Test`, with one scene, `Scene`.
3. Launches `obs64.exe --multi --profile CastleControl-Test --collection CastleControl-Test
   --websocket_port 4466 --websocket_password <random per run> --disable-shutdown-check
   --minimize-to-tray` from the OBS bin folder, and waits (at most 90 s) for the websocket.
4. Runs `e2e/night/obs.spec.ts`: the UI's `#/stream` adds the vote bar and a
   Beacons visual, the Lot plate is added with `obs.source.create`, and each
   source is captured with `GetSourceScreenshot` and must show visible pixels.
5. Always tears down: removes the test sources, closes that OBS (force after 20 s),
   restores those three files byte-for-byte and checks their hashes, removes the
   test profile, collection and any sentinel this run created, and checks that
   the owner's profiles and scene collections are unchanged. The backups are
   deleted after a verified restore because they may hold the owner's websocket
   settings; on a failed restore they are kept and the lane fails loudly.
6. Fails if the per-run password appears in any text file it wrote.

A run killed before its teardown leaves `target/night-obs-pending.json`. The
next run restores from it first.

## How it works

- `crates/cc-core/examples/e2e-night/` is a test-only core: the native composition
  (Lots, Gatehouse, Beacons, render host, overlay listener, `obs.*`, `status.get`)
  with an empty Twitch client id, so the bridge never connects. Its HTTP door
  refuses `auth.twitch.start` and `auth.twitch.revoke`. SIMULATED chat enters
  through the public `ShadowPipeline::start` seam on stdin commands (`join N`,
  `ballots N`). Ballots begin with `1`/`2` and retain `SIMULATED duel ballot
  left|right` text (two left for each right); descriptive text without those
  tokens is chatter. The Rust Tiltyard regression imports this exact producer.
  It adds no RPC method or contract identifier.
- OBS goes through a test-only relay that does the obs-websocket v5
  authentication with the in-memory password, so the core never reads the
  keychain. Without `CC_NIGHT_OBS_PORT` the core starts a generated fake OBS
  peer. Port 4455 is refused everywhere.
- `e2e/night/launch.ts` builds and starts the core and opens the UI in CORE
  mode: an init script sets the launch object, and the Vite build is served
  under `http://tauri.localhost`, the webview origin the core already trusts.
  The session token stays in the test process and the page. Traces and videos
  are off because they would record it.

## What it cannot prove

- The real Tauri window, WebView2 and the native shell's injection (the Tauri lane covers fixture mode only).
- Twitch: no EventSub, Helix, login or real chat. Chat is injected after the bridge.
- Gatehouse direction splits: no direction seeds are configured, so every ballot lands in one "Other" direction (100 %).
- Beacons from real contributions: only the test-fire simulation moves a visual.
- Showdown/Ladder: these local demo modes are outside the core Chat contract.
- `#/stream` has no Lot plate row, so the UI cannot add the Lots page to OBS.
- In this native composition, the vote bar and the Lot plate carry no SIMULATED badge (the core labels them live).
- Chrome runs with `--disable-features=LocalNetworkAccessChecks`, since route-fulfilled shell pages have no address space.
- A drand outage fails the Lots journey and the OBS lane.
