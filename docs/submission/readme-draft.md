# Castle Control

> Public README draft, not yet installed at the repository root. Status checked
> offline on 2026-10-26 against local main `0181ffd`. Links below work from this
> draft's location; adjust them when promoting it to the root README. Recheck
> feature status, run instructions and submission links before publication.

Castle Control is a free, open-source desktop toolkit for Twitch streamers.
Its four chambers bring audience tools into one local-first app:

| Chamber | Plain function | Current scope |
| --- | --- | --- |
| Lot Chamber | Verifiable draws with eligible pools, giveaway guardrails, seals and downloadable proofs | Offline draw/proof logic, CLI and web verifiers, and a fixture page exist. A Twitch draw and its live OBS delivery remain unproved. |
| Gatehouse | AI-assisted moderation, a consensus chart and a replay drill | Offline rules, human-review safety gate, engine adapter, consensus/replay logic and fixture UI exist. Live integration and the two-hour shadow/replay exit remain pending. |
| Beacons | Contribution-driven OBS visuals | Offline contribution/intensity and renderer work plus a fixture designer exist. This is beyond the M0–M2 floor; live OBS contribution behavior remains unproved. |
| Map Room | An Extension studio | Planned local/Hosted Test scope for allowlisted accounts; no released or reviewed Twitch Extension is claimed. |

The submission floor is M0–M2: a protected room and verifiable draws on the
owner's test channel. It is targeted for October 30, not marked complete here.
The [spike record](../spike-log.md) still awaits the October 27 owner live run.
Fixture screenshots show generated, labelled simulated data. They are previews.
Overlord is the first showcase; its urn and war table are data templates.
Castle Control is a working name and is not affiliated with Twitch.

## Run the current development build

Use Windows first. The root [package manifest](../../package.json) requires
Node.js **24.14.0 or newer** and **pnpm 11.3.0**. Native development also needs
Rust and the Windows MSVC tools/SDK and WebView2 described in the
[desktop instructions](../../apps/desktop/README.md).

From a normal standalone checkout, install the locked dependencies and run the
same verification entry point as Windows CI, as documented in
[PLAN.md](../PLAN.md):

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
[desktop setup](../../apps/desktop/README.md) and
[the spike record](../spike-log.md); those live checks remain pending.
There is no root `start` script or public installer promised by this draft.

Open [the self-contained web verifier](../../packages/verifier-web/index.html)
from disk for offline simulated proof examples. File verification and independent
trust-anchor requirements are described in the
[web verifier](../../packages/verifier-web/README.md) and
[Rust verifier](../../crates/cc-verify/README.md) instructions. A verified offline
example does not prove that a Twitch draw was run.

## How Codex builds Castle Control

Product code is written by OpenAI Codex builders using `gpt-6.1-sol` at reasoning
effort `high`. A durable read-only main thread supplies the project context.
Each assigned work package forks into its own thread and git worktree; review
follow-ups resume that thread. Builders leave their changes for the App Master
to commit. The Opus Director owns briefs, reviews diffs against acceptance
evidence, runs gates and merges. It does not write product code.

The [implementation plan](../plan/03-implementation-plan.md) and main commit
history record that workflow. The app uses Rust, Tauri 2 and React 19 with
schema-generated TypeScript contracts. Gate checks cover types, lint, tests,
contract drift, boundaries, code hygiene and secrets.

- **TODO — Director: verified Codex thread map.** Add work package, build-thread
  ID, delivered commit(s), review result and evidence from the private journal.
  Do not invent IDs or publish private prompts, credentials or real chat.
- **TODO — Director: main Codex thread ID for Devpost.** Confirm against the
  project journal before adding the submission's required session ID.
- **TODO — owner: final public YouTube video and submitted Devpost entry.**
  Add only verified links after upload/submission.

Building the app with Codex is distinct from its runtime AI provider. The
revised D10 plan uses one provider wrapper, with Claude Code CLI during
development and a separately required OpenAI demonstration: Codex CLI for the
slow lane and OpenAI API for classification, selected through settings. Local
processing is the default and cloud use is opt-in. The end-to-end OpenAI lane
proof is pending for November 1; this draft does not claim it has run. This
describes implementation tools and providers, not an endorsement by OpenAI.

## Safety and development status

Chat enters downstream modules only after a moderation verdict. Watching
(shadow) is the default; a deterministic action gate enforces safety and bans
require human approval by default. Contribution money affects visuals only.
The planned Steward proposes changes that require a human seal.

Use only the owner's test channel and owned test accounts for live tests. No
armed action may reach a real viewer before the M1 exit and written owner
sign-off. Credentials belong in the OS keychain, never in this repository or
recorded output; real chat never becomes test fixtures. Test-only Map Room
work stays local or limited to allowlisted Hosted Test accounts.

See the [plan entry point](../PLAN.md) and
[submission checklist](checklist.md) for outstanding build and owner steps.
Public release checks, signed installers and third-party reviews are separate
from the hackathon submission.

## Licence and provenance

Castle Control is licensed under [Apache-2.0](../../LICENSE).
[NOTICE](../../NOTICE) credits **Shadowrunr OS**, also Apache-2.0, at source
commit `7e4b6f8`. Adapted files retain their source-path/commit headers and
notices. The repositories are independent; there is no Overlord runtime
dependency. Preserve NOTICE and third-party notices when redistributing.
