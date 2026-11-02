![A white castle on a hill flying red and blue heraldic banners, with a beacon fire burning on its tallest tower](docs/assets/banner.jpg)

# Castle Control

**Status, 2026-11-02:** checked against local main `64beb02`, plus the
uncommitted UI polish pass. Code completion, SIMULATED journeys and live
acceptance are different things. This README says which is which.

Castle Control is a free, open-source desktop toolkit for Twitch streamers.
It was built with OpenAI Codex for the TwitchCon x Codex hackathon, due
November 2, 2026 at 14:00 PT. It brings four audience tools into one
local-first app. Each tool is a room in a castle. A Steward helps set each one
up, and nothing changes until a human holds to seal it.

| Chamber | What it does for a stream | Current state |
| --- | --- | --- |
| **Lot Chamber** | Fair draws (questions, giveaways), with an entry pool, guardrails, a public seal and a proof anyone can check | Native intake after moderation, a drand quicknet seal and cast, an OBS result plate and writ export are wired. Writs check offline in the CLI and web verifiers. A draw on the owner's test channel is not yet recorded as an exit ([M2 runbook](docs/guide/lots.md#m2-live-run)). |
| **Gatehouse** | Moderation with rules, a held queue and human review, a consensus chart of what passed, and a replay drill | Watching (shadow) is the default. Armed rules propose bans that a human must confirm. Native chat, history and consensus reads and the capture drill are wired. Native intake is rules-only. The two-hour shadow run and owner sign-off are still open ([M1 runbook](docs/guide/gatehouse.md#m1-live-run)). |
| **Beacons** | Visuals on stream that bits, subs and gifts kindle, with an editable curve and decay | Visual picker, curve and decay controls, live contribution routing, an OBS overlay host and a live contribution feed are wired. Simulated test fires reach OBS with a SIMULATED badge and never add to live totals. A real cheer moving the live OBS visual within 1 s is not yet proved ([M3 runbook](docs/guide/beacons.md#m3-live-run)). |
| **Map Room** | Chat duels: viewers type `1` or `2` to pick a winner, round by round, up a bracket | The core runs the tournament and serves an OBS duel page. Showdown and Ladder modes, the hex sand table, Spyglass viewer frames and Rehearse are local demos behind **More**. No Twitch Extension is built, hosted or reviewed. |

Castle Control is a working name and is not affiliated with Twitch.

**New here?** [GETTING_STARTED.md](GETTING_STARTED.md) walks you step by step
from a fresh checkout to every chamber running on your stream, with OBS,
Twitch, Dress rehearsal and the optional AI integrations.

## What is in the app

- **The Keep** (`#/keep`): the landing screen. There are four lit windows, one
  per chamber, and each plaque shows that chamber's reading. Keys `1`–`4`
  open the chambers. The header switches between night and day. Both themes
  are complete.
- **Preview and Proclaim** (`#/overview`): the whole keep in one picture,
  with every chamber's state in one strip and a program monitor for what is
  going on air.
- **The Deck chamber layout:** every chamber uses the same frame. The on-air
  picture sits on the left at 16:9, beside two section columns, and less-used
  settings sit in a drawer. Every chamber fits 1280×720 with no page scroll.
- **The Steward:** a guided assistant docked at the bottom of every chamber. It
  walks through setup as a short conversation: draft a draw, arm a rule, tune a
  beacon or start a duel. Each change becomes a writ that a human seals or
  tears up. A model can drive it (`--steward-live` with a configured engine).
  Otherwise it runs scripted flows. An unconfigured engine reports
  *unavailable* and never fakes a success.
- **Custom design:** each on-stream artifact (urn, beacon, vote bar, duel page)
  has preset art styles and a library of 86 ready-made stream assets with
  anchors. When the user configures OpenAI, the core generates a new design
  with GPT image models. It splits base and effect layers, measures anchors and
  serves the sealed design to the OBS overlay. Without a configured engine, a
  scripted art director stands in.
- **Set up OBS** (`#/stream`): connect to OBS (obs-websocket v5), pick a scene
  and a size (1080p, 720p or vertical), and hold to add a chamber's transparent
  browser source.
- **Dress rehearsal** (`#/rehearsal`, launched with `cc-desktop --rehearsal`):
  the real native core with no Twitch session, a separate store, the user's
  own OBS scene `Castle Control · Rehearsal`, and a generated crowd of 0–600
  messages a minute. The scenarios fill a draw, run a vote or duel round, fire
  100 bits, and let an armed rule propose SIMULATED bans for review. Clean up
  removes what rehearsal added to OBS.
- **On stream** (`#/demo`): a composed sample stage. Switch six art styles
  (Heraldic, Arcade, Neon, Storybook, Cel, Glass), two layouts and three camera
  shots to see the overlays in place. It is labelled
  **SIMULATED · SAMPLE ART · AI-generated** and makes no live calls.
- **Verifiers:** a Rust CLI ([cc-verify](crates/cc-verify/README.md)) and a
  self-contained [web verifier](packages/verifier-web/index.html) reproduce a
  draw's winners from its writ and the public drand round.
- **Headless core** (developer-only): `cc-headless`, a `cc` CLI and a stdio
  MCP server drive a rehearsal-only core without the UI, through one
  allowlisted tool table. No armed method is reachable. See
  [packages/headless](packages/headless/README.md).

## Try it in the browser (fixtures)

```powershell
pnpm install --frozen-lockfile
pnpm --filter @castle-control/desktop dev
```

Open the address Vite prints and start at `#/keep`. The browser preview runs
on generated, labelled **SIMULATED** data and never connects to Twitch or
OBS. Journeys to try:

- **Lot Chamber** (`#/chamber/lottery`): ask the Steward for a question draw.
  Set the keyword, weights and winner count, fill the pool, hold to seal, then
  cast and read the writ. Prize draws require the rules template and Twitch
  disclaimer, and paid entry blocks the preview.
- **Gatehouse** (`#/chamber/moderator`): draft a watching rule and see what it
  would catch. Play simulated chat, review a held message, and open the replay
  drill. Fixture confirmations say **Nothing sent to Twitch**.
- **Beacons** (`#/chamber/visuals`): pick a visual, drag its kindling curve,
  set decay, test fire 50 gifts and watch it fade on the simulated clock.
- **Map Room** (`#/chamber/studio`): start a chat duel and step through the
  bracket. Under **More**, try Showdown, Ladder, the sand table, Spyglass and
  Rehearse.

Checked by the fixture Playwright lane (`pnpm e2e`) and the desktop unit tests.
These prove fixture behaviour, not live Twitch or OBS acceptance.

## Run the native app

Use Windows first. The [package manifest](package.json) requires Node.js
**24.14.0 or newer** and **pnpm 11.3.0**. Native builds also need Rust, the
Windows MSVC tools and SDK, and WebView2. See the
[desktop instructions](apps/desktop/README.md).

```powershell
pnpm --filter @castle-control/desktop build
cargo run -p cc-desktop --features custom-protocol                 # real core, adapters unconfigured
cargo run -p cc-desktop --features custom-protocol -- --rehearsal  # Dress rehearsal
```

With no arguments, the app opens a real core with nothing configured. Unknown
status stays unknown. It does not log in or arm moderation. Test-channel login
is owner-only and documented in the [desktop instructions](apps/desktop/README.md)
and the [login guide](docs/guide/login.md). There is no public installer yet.

Run the same checks as Windows CI with `pnpm gate`: Rust format, Clippy and
tests, typecheck, lint, unit tests, contract drift, import boundaries, hygiene,
file-size caps and a secret scan. A one-time core-mode lane runs with
`pnpm e2e:headless`.

## How Codex built Castle Control

OpenAI Codex builders wrote the product code, running `gpt-6.1-sol` at
reasoning effort `high`. A durable read-only main thread holds the project
context. Each work package forks into its own Codex thread and git worktree,
and review follow-ups resume that same thread. A Director reviews each diff
against its acceptance criteria and evidence, runs the gate and merges. The
Director does not write product code.

From 2026-10-25 to 2026-10-31, the journal records 593 merged Codex runs across
270 threads and 225 merge commits (from the
[Codex thread map](docs/submission/codex-thread-map.md); verify before
publication). The main Codex session ID is
`01a1741c-c7ad-7f32-9992-27f322adeb5c`. The
[implementation plan](docs/plan/03-implementation-plan.md) and the commit
history record the workflow.

Codex is also part of the runtime. The engine (`cc-engine`) has one provider
boundary with a Codex CLI backend (`codex exec --json`, read-only sandbox,
using the streamer's own sign-in) beside Claude Code CLI. It can also call the
OpenAI API, chosen in settings. Local processing is the default, and cloud use
is opt-in. The end-to-end OpenAI lane is built but not recorded as proved in
this repository. This describes tools and providers, not an endorsement by
OpenAI.

The stack is Rust, Tauri 2 and React 19, with TypeScript contracts generated
from one schema. Every value that crosses a boundary is parsed once, by its
schema.

## Safety

- Chat reaches the other chambers only after a moderation verdict. Watching
  (shadow) is the default. A deterministic action gate enforces safety, and
  bans need human approval.
- Contribution money changes visuals only. It never changes odds or outcomes.
- Every change the Steward proposes waits for a human seal.
- Live tests run only on the owner's test channel, and armed actions only
  target the owner's own test accounts. Nothing armed reaches a real viewer
  until the M1 exit is met and the owner signs off in writing.
- Credentials live in the OS keychain, referenced by label only, and never in
  this repository or recorded output. Real chat never becomes a test fixture.
  Test data is generated and labelled SIMULATED.

Outstanding build and owner steps are in the [plan entry point](docs/PLAN.md)
and the [submission checklist](docs/submission/checklist.md). Signed
installers, a public landing page and third-party reviews are separate from
the hackathon submission.

## Licence

Castle Control is licensed under [Apache-2.0](LICENSE).
