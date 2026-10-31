# Castle Control

> Draft mirror of the root README.md; all links below are relative to the repository root.

**Development status, 2026-10-31:** checked offline against local main
`b77df13`. Recheck feature status, run instructions and submission links before
publication. Implemented code and SIMULATED journeys are distinct from live
acceptance.

Castle Control is a free, open-source desktop toolkit for Twitch streamers.
Built with OpenAI Codex for the TwitchCon x Codex hackathon, due November 2,
2026 at 14:00 PT; the submission package target is 12:00 PT that day.
Its four chambers bring audience tools into one local-first app:

| Chamber | Plain function | Current scope |
| --- | --- | --- |
| Lot Chamber | Verifiable draws with eligible pools, giveaway guardrails, seals and downloadable proofs | Native post-verdict intake, trusted quicknet seal/cast, OBS result plate and writ export are wired at `0ea0d04`, alongside CLI/web verifiers and fixture previews. The owner test-channel draw, matching OBS result and verification remain unproved; follow the [M2 runbook](docs/guide/lots.md#m2-live-run). |
| Gatehouse | AI-assisted moderation, a consensus chart and a replay drill | Rules/safety logic, consensus and fixture UI exist. Native chat/history/consensus reads are wired at `c14ff93`; stored capture instruments/read at `617e094` and capture drill at `c789279`. Current native intake is rules-only; the two-hour shadow/replay exit and owner sign-off remain pending. See the [M1 runbook](docs/guide/gatehouse.md#m1-live-run). |
| Beacons | Contribution-driven OBS visuals | Core configuration/curve controls, input picker, live routing/overlay host and a live contribution read feed (`97d8dd4`) exist beside labelled simulation. Feed rows show amount, source/unit and optional user ID, with no time/login or live totals. Real-cheer OBS movement and 1 s OBS timing remain unproved; simulated test fires drive OBS with a SIMULATED label and decay, without adding to live totals. See the [M3 runbook](docs/guide/beacons.md#m3-live-run); this is beyond the floor. |
| Map Room | An Extension studio | A local, SIMULATED hex-map editor, art preview and Spyglass viewer preview exist. Hosted Test remains planned for allowlisted accounts; no released or reviewed Twitch Extension is claimed. |

Native wiring checked in the [core integration](crates/cc-core/src/integration.rs),
[Lot core page](apps/desktop/src/rooms/lottery/core.tsx),
[Gatehouse core page](apps/desktop/src/rooms/moderator/core.tsx),
[capture drill](apps/desktop/src/rooms/moderator/capture-drill.tsx),
[Beacons core page](apps/desktop/src/rooms/visuals/core.tsx) and
[live contribution feed](apps/desktop/src/rooms/visuals/live-feed.tsx).

The submission floor is M0–M2: a protected room and verifiable draws on the
owner's test channel. It is targeted for October 30, not marked complete here.
The [spike record](docs/spike-log.md) acceptance table records all six WP 0.7
checks PASS on October 27, run 10 (16:44:45–16:45:01 UTC), including the static
OBS plate screenshot reference. O1–O8 have recorded passes; T1–T10 and F0–F9
remain pending despite the log's blanket pending header. These records do not
prove M1/M2 exits or a real-viewer moderation action.
Fixture screenshots show generated, labelled simulated data. They are previews.
Overlord is the first showcase; its urn and war table are data templates.
Castle Control is a working name and is not affiliated with Twitch.

## Try the chambers

Start with the browser preview below and open `#/keep`. These walkthroughs
use generated **SIMULATED** data. Their checked journey specs describe fixture
behavior; they do not establish live Twitch, OBS or Extension acceptance.

- **Lot Chamber** (`#/chamber/lottery`): configure the pool, keyword, weights
  and winner count; choose the urn's size, anchor, colour, art style and reveal
  timing. Preview the proposal, hold to seal, start the simulated draw and read
  its current simulated writ. Prize setup requires the rules template and Twitch
  disclaimer, and paid entry blocks preview. The current simulated writ is
  explicitly **not a cc-verify proof**; use the native runbook for a real draw.
  Checked: [Lot journey spec](e2e/journey-lots.spec.ts) and
  [current-cast tests](apps/desktop/src/rooms/lottery/journey.test.tsx).
- **Gatehouse** (`#/chamber/moderator`): draft a watching rule in the Rule
  bench and inspect pattern hits in chat or the drill. Pattern hits are previews,
  not moderation verdicts. In the fixture journey, propose a watching rule or
  chat delay, hold to seal, play/pause simulated chat, review a held message and
  inspect Undo feedback, consensus filters and the replay drill. Fixture
  confirmations say **Nothing sent to Twitch**; recording gaps and pending live
  parity remain visible. Checked: [Gatehouse journey spec](e2e/journey-gatehouse.spec.ts)
  and [Rule bench](apps/desktop/src/rooms/moderator/rule-bench.tsx).
- **Beacons** (`#/chamber/visuals`): select a visual, drag or keyboard-edit
  its kindling curve, set decay and gift weighting, then choose size, anchor,
  colour, art style and burst timing. Save the fixture settings locally, test
  fire 50 gifts, inspect the event feed and advance the simulated clock to see
  decay. Copying a fixture browser-source URL reports a **SIMULATED example**,
  not a live source. Ending test fire preserves the selected configuration.
  Checked: [Beacons journey spec](e2e/journey-beacons.spec.ts) and
  [session tests](apps/desktop/src/rooms/visuals/journey.test.tsx).
- **Map Room** (`#/chamber/studio`): inspect tiles and house banners, change
  map size, anchor, colour, art style and reveal timing, and replay or reset the
  local design. Spyglass shows panel, mobile, video-overlay and OBS-sized viewer
  frames; viewer picks stay separate from the streamer's tile inspector. Draft
  designs can be reviewed, sealed or torn up locally. The preview retains
  **SIMULATED VIEWER PREVIEW · no Extension is built**. Hosted/released stages
  stay locked; inspecting their requirements does not publish an Extension.
  Settings are session-only; native core mode shows an unconfigured Map Room.
  Checked: [Map Room journey spec](e2e/journey-maproom.spec.ts) and
  [room implementation](apps/desktop/src/rooms/studio/room.tsx).

### Art presets and the on-stream demo

The six art-style presets are **Heraldic, Arcade, Neon, Storybook, Cel and
Glass**. They supply sample urn, altar, frame and map art in the chamber
previews. These are illustrative assets; local appearance settings do not prove
that a live OBS output adopted them. Checked:
[style definitions](apps/desktop/src/demo/model.ts),
[Lot appearance](apps/desktop/src/rooms/lottery/appearance.tsx),
[Beacons presets](apps/desktop/src/rooms/visuals/presets.ts) and
[Map Room design controls](apps/desktop/src/rooms/studio/design.tsx).

From the keep, choose **See it on stream** or open `#/demo`. Switch the six
styles, **Game + cam / Just chatting** layouts and **Facecam / Lair / Laugh**
shots to see a composed stage with sample overlays, chat and Extension panels.
Back or Escape returns to the keep. The visible label is
**SIMULATED · SAMPLE ART · AI-generated**. This is a visual demonstration with
no live mutation or chamber/network calls, not a Twitch broadcast or a working
Extension. The camera-frame choice remains provisional pending the owner's
pick. Checked: [demo implementation](apps/desktop/src/demo/demo.tsx),
[asset model](apps/desktop/src/demo/model.ts) and [demo spec](e2e/demo.spec.ts).

> **Screenshots — Director to add after verification:** keep and chamber
> journeys; on-stream demo; OBS setup. No screenshots are included yet. Preserve
> every SIMULATED, SAMPLE ART and AI-generated label in any fixture capture.

## How Codex builds Castle Control

Product code is written by OpenAI Codex builders using `gpt-6.1-sol` at reasoning
effort `high`. A durable read-only main thread supplies the project context.
Each assigned work package forks into its own thread and git worktree; review
follow-ups resume that thread. Builders leave their changes for the App Master
to commit. The Opus Director owns briefs, reviews diffs against acceptance
evidence, runs gates and merges. It does not write product code.

The [implementation plan](docs/plan/03-implementation-plan.md) and main commit
history record that workflow. The app uses Rust, Tauri 2 and React 19 with
schema-generated TypeScript contracts. Gate checks cover types, lint, tests,
contract drift, boundaries, code hygiene and secrets.

- **Pending Director verification:** the [Codex thread map](docs/submission/codex-thread-map.md)
  records merged runs, public commit subjects, thread IDs and resume counts.
  Main Codex session ID for Devpost: `01a1741c-c7ad-7f32-9992-27f322adeb5c`,
  read from the Director journal; verify before publication or form entry.
- **TODO — owner: final public YouTube video and submitted Devpost entry.**
  Add only verified links after upload/submission.

Building the app with Codex is distinct from its runtime AI provider. The
revised D10 plan uses one provider wrapper, with Claude Code CLI during
development and a separately required OpenAI demonstration: Codex CLI for the
slow lane and OpenAI API for classification, selected through settings. Local
processing is the default and cloud use is opt-in. The end-to-end OpenAI lane
proof is pending for November 1; this README does not claim it has run. This
describes implementation tools and providers, not an endorsement by OpenAI.

## Run the current development build

Use Windows first. The root [package manifest](package.json) requires
Node.js **24.14.0 or newer** and **pnpm 11.3.0**. Native development also needs
Rust and the Windows MSVC tools/SDK and WebView2 described in the
[desktop instructions](apps/desktop/README.md).

From a normal standalone checkout, install the locked dependencies and run the
same verification entry point as Windows CI, as documented in
[PLAN.md](docs/PLAN.md):

```powershell
pnpm install --frozen-lockfile
pnpm gate
```

Builders using a shared `node_modules` junction must follow their worktree brief
and must not install over that junction. Installation above is for an ordinary
checkout. Passing gates does not establish live Twitch acceptance.

For an isolated browser preview, run the existing desktop package script:

```powershell
pnpm --filter @castle-control/desktop dev
```

Open the local address Vite prints. The preview defaults to fixtures, retains
its simulated banner and does not connect to Twitch or OBS. Navigate among the
four chamber routes; populated fixture features are previews of their modules.

For the current native shell with embedded frontend, the documented commands are:

```powershell
pnpm --filter @castle-control/desktop build
cargo run -p cc-desktop --features custom-protocol
```

With no native arguments, this opens a real core with unconfigured adapters;
unknown status stays unknown. It does not log in or arm moderation. Owner-only
test-channel login and the separate spike runner are documented in
[desktop setup](apps/desktop/README.md) and
[the spike record](docs/spike-log.md). Recorded WP spike results are distinct from
the pending M1/M2 owner runs and fresh demo capture.
There is no root `start` script or public installer promised here.

Open [the self-contained web verifier](packages/verifier-web/index.html)
from disk for offline simulated proof examples. File verification and independent
trust-anchor requirements are described in the
[web verifier](packages/verifier-web/README.md) and
[Rust verifier](crates/cc-verify/README.md) instructions. A verified offline
example does not prove that a Twitch draw was run.

### Set up OBS (`#/stream`)

Choose **Set up OBS** from the keep or open `#/stream`. Enter an existing OBS
scene name and choose **1080p (1920 × 1080)**, **720p (1280 × 720)** or
**vertical (1080 × 1920)**. Refresh OBS and outputs, copy a Beacons browser-source
URL or hold to add the visual as a transparent browser source, then inspect its
placement in OBS. Native setup requires a configured core and OBS with
obs-websocket v5 enabled; unknown/disconnected/refused states remain visible.
This page sizes Beacons sources. The Lot plate row points back to the Lot
Chamber for its sealed-draw output; it does not add a Lot source from this page.

In the browser fixture preview the page stays **SIMULATED**: holding to add
creates no OBS source, and copying returns an example URL, not a live source.
This setup UI is not evidence of real-cheer movement, a matching live draw plate
or the pending OBS timing checks. Checked:
[setup page](apps/desktop/src/stream/setup.tsx),
[setup model/tests](apps/desktop/src/stream/setup-model.test.ts) and
[validated OBS transport](apps/desktop/src/stream/obs-core.ts).

## Safety and development status

Chat enters downstream modules only after a moderation verdict. Watching
(shadow) is the default; a deterministic action gate enforces safety and bans
require human approval by default. Contribution money affects visuals only.
The Steward has a core-mode bar/seal slot (`21d113e`) and a host-configured writ
protocol (`2a080c1`); changes require a human seal. These code deliveries do not
prove the end-to-end runtime provider demonstration. An unconfigured host stays
unavailable rather than substituting a simulated success.

Use only the owner's test channel and owned test accounts for live tests. No
armed action may reach a real viewer before the M1 exit and written owner
sign-off. Credentials belong in the OS keychain, never in this repository or
recorded output; real chat never becomes test fixtures. Test-only Map Room
work stays local or limited to allowlisted Hosted Test accounts.

See the [plan entry point](docs/PLAN.md) and
[submission checklist](docs/submission/checklist.md) for outstanding build and owner steps.
Public release checks, signed installers and third-party reviews are separate
from the hackathon submission.

## Licence and provenance

Castle Control is licensed under [Apache-2.0](LICENSE).
[NOTICE](NOTICE) credits **Shadowrunr OS**, also Apache-2.0, at source
commit `7e4b6f8`. Adapted files retain their source-path/commit headers and
notices. The repositories are independent; there is no Overlord runtime
dependency. Preserve NOTICE and third-party notices when redistributing.

Created by Personas on 2026-10-25 for workspace Spooky.
