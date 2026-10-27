# Castle Control — Part 3: Implementation plan

Snapshot of the Claude Doc tab "Part 3 — Implementation plan", 2026-10-25.

Revised 2026-10-25: Codex-only builders and an OpenAI engine stack (the TwitchCon x Codex hackathon); the Claude Doc snapshot predates this.

## Summary

Castle Control is built in a new repo by OpenAI Codex. Every builder is Codex; one Director reviews and merges.

- **Seven milestones, 30 work packages.** Each work package is one Codex build thread, reviewed by the Director. The Director is an Opus App Master (Personas' headless /appmaster loop). It owns the plan, the briefs, the reviews and the merges, and never writes product code.
- **Order.**
  - M0 lays the foundations and **proves the Twitch connection on a real channel first**, because none of Shadowrunr's Twitch code has met the real service.
  - The Gatehouse comes next: every other module reads chat only after its verdict.
  - Then the Lot Chamber and the Beacons.
  - The Map Room comes last, because it alone needs Twitch's review and a hosted service.
- **The first usable cut is M0 to M2.** It gives a desktop app that protects the room in shadow mode, reads it, and runs verifiable draws on stream. That is enough for a public demo on the Overlord sandbox.
- **Definition of done for the product:**
  - every module passes its own exit on a real test channel;
  - every gate is green at zero, and each was proven red once;
  - the UI meets the fidelity contract in Part 2;
  - the safety defaults in Part 1 are enforced in code, not only described.

The plan names files, identifiers and acceptance criteria tightly enough that two builders working in parallel cannot drift apart. Where it decided an open question for the owner, the decision is listed next, with how to reverse it.

## The hackathon (TwitchCon x OpenAI Codex)

Castle Control is the project's entry. Re-read the Devpost rules before submitting; they were read through search extracts on 2026-10-25.

- **Deadline.** Mon 2026-11-02, 14:00 PT (23:00 Prague).
- **Judging.** 2026-11-05 to 2026-11-15.
- **Submission:**
  - a public GitHub repo, or one shared with the organizers;
  - a public YouTube video of at most 3 minutes, showing the app working on Twitch and how Codex built it;
  - a description of how Codex was used;
  - the Codex session ID: the id of the project's main Codex thread (see "Sessions and threads").
- **Criteria.** Innovation, impact for streamers, technical implementation (including how well Codex is used), and design.

**Schedule.** Every milestone is targeted by the deadline, in plan order, with up to 5 Codex threads in parallel. The Director reorders packages inside a day as reviews land.

| Day | Milestone | Work packages |
| --- | --- | --- |
| Mon 10-26 | M0 | WP 0.1 and WP 0.6 (started on the day the master is armed), then WP 0.2, WP 0.3, WP 0.4 |
| Tue 10-27 | M0 exit, M1 start | WP 0.5; WP 0.7 live spike with the owner; after it passes, WP 1.1 and WP 1.4 |
| Wed 10-28 | M1 | WP 1.2, WP 1.3, WP 1.5, WP 1.6, WP 1.7 |
| Thu 10-29 | M1 exit, M2 | The two-hour shadow test stream; WP 2.1, WP 2.2, WP 2.3 |
| Fri 10-30 | M2 exit, M3 | A draw on the test channel; the floor demo video is recorded; WP 3.1, WP 3.2, WP 5.1 |
| Sat 10-31 | M3, M4, M5 | WP 3.3, WP 3.4, WP 4.1 to WP 4.3 (if Twitch has answered WP 4.0), WP 5.2 |
| Sun 11-01 | M6 | WP 6.1, WP 6.2; the final video, the README |
| Mon 11-02 | Submit | The landing, the Devpost form and the submission, before 14:00 PT |

- **The OpenAI lane is proven before the video** (D10): on Sun 11-01 the Steward and the classifier run end to end on the Codex CLI and the OpenAI API, with the provider switched in settings only.
- **Submission floor.** If later milestones slip, the submission ships the highest finished cut. M0 to M2 (the first usable cut) plus a demo video are the floor, and must exist by Fri 2026-10-30.
- **Nov 1 and 2 are reserved** for the video, the README, the landing and the submission. Build work that is not done by then waits.
- **M4 depends on Twitch's policy answer (WP 4.0)**, so it may slip regardless of pace. The Director reorders around it.
- **The submission is not the public release.** WP 6.3 items that need the owner, a lawyer or Twitch may still be open on 11-02.

## Decisions taken

Part 1 left six questions and one comment open. The plan proceeds on the defaults below. Each is cheap to reverse before the milestone that first depends on it.

| # | Question | Decision | Reverse before |
| --- | --- | --- | --- |
| D1 | Who runs the Extension service | One shared, stateless service we host, plus documented self-hosting | M4 |
| D2 | Live moderation engine default | Rules plus a local model. A cloud key is opt-in, with a plain notice | M1, work package 1.3 |
| D3 | Overlord's urn and hex map | Shipped in the new repo as data templates. Overlord adopts the toolkit later, as its first external user | M2 |
| D4 | Licence | Apache-2.0, the same as Shadowrunr OS, so code can be copied with notice | M0, work package 0.1 |
| D5 | Platforms | Twitch only for v1. The bridge is one crate behind one boundary, with no second-platform abstraction yet | After v1 |
| D6 | Sequencing against the Shadowrunr v2 rebuild | An independent repo. Code is copied and adapted with provenance, never shared as a cross-repo dependency. Shared crates are extracted later, only if both stabilise | M0 |
| D7 | Ban autonomy (the open comment in Part 1) | A ban needs a human click by default. A streamer may turn on auto-ban per rule, only for an armed, pattern-based rule, after a logged acknowledgement, and only under a scoped, expiring grant with a ceiling of bans per hour and a circuit breaker back to human click. A classifier-only rule can never ban alone | M1, work package 1.1 |
| D8 | Desktop platforms | Windows first, the owner's machine with OBS. macOS and Linux builds join CI in M6 | M6 |
| D9 | Name | "castle-control" is the working repo and product name. A trademark search runs before public release | M6 |

**Operator standup, 2026-10-25 (overrides the earlier sequencing and policy gates).**
Offline M1 and M2 prep (WP 1.1, WP 1.4, WP 2.1 and WP 2.2) may start before
the WP 0.7 live spike. Nothing is wired to the live bridge and nothing is armed
until the spike passes on Tue 10-27. WP 4.0 is dropped: no email to Twitch.
M4 builds for local test and Hosted Test with allowlisted accounts only, with no
review submission. The historical schedule and milestone references to a policy
answer do not gate this test-only scope.

## Repo shape

The repo is one Rust workspace plus one pnpm workspace, the same layout as Shadowrunr OS. Each module is a crate that plugs into the core in four ways:

- it subscribes to post-verdict events;
- it adds methods to the one contract table;
- it emits typed stream events;
- it ships its templates as data.

```
castle-control/
  crates/
    cc-types       contract types (schemars) and the one method table
    cc-store       SQLite, append-only JSONL ledgers, retention and purge
    cc-twitch      the bridge: device login, keyring, EventSub WebSocket, Helix, rate limits
    cc-obs         obs-websocket v5 client and the localhost overlay server
    cc-engine      LLM wrapper: fast path (HTTP, local model), slow path (CLI), cost ledger
    cc-gatehouse   moderator: verdict pipeline, gate, governor, rules, classifier, herald, drill
    cc-lots        lottery: pools, seal, drand client, cast, writ
    cc-beacons     event intake, intensity engine, design packages
    cc-maproom     Extension studio: design data, templates, test stages
    cc-core        the local service: axum on loopback, /rpc and /events, module registry
    cc-ebs         the hosted Extension service (its own binary and deploy)
    cc-verify      command-line writ verifier
  apps/
    desktop        Tauri 2 shell + React 19 UI (the four chambers)
    overlay        OBS browser-source bundle, served by cc-core
    extension      Twitch Extension shell bundle (reviewed once per shell version)
    site           the landing page (static)
  packages/
    contract       generated TS types and validators, drift gate
    tokens         token source -> CSS variables + typed mirror
    ui             castle components: rampart, chambers column, panel, rule table, chips, mark
    renderer       design-package renderer shared by overlay and extension
    verifier-web   single-file writ verifier for viewers
  templates/       overlord-urn, war-table, and the generic templates, as data
  prototype/       the winning prototype, read-only reference
  docs/            PLAN, ADRs, safety policy, CONTRIBUTING, SECURITY
```

**Copied from Shadowrunr OS** (Overlord repo, commit `7e4b6f8`). Each copied file carries a header naming its source path and commit, and the repo's NOTICE credits Shadowrunr OS.

| Source | Size | Becomes | Changes |
| --- | --- | --- | --- |
| `crates/shadowrunr-daemon/src/platform/twitch/` (auth, eventsub, helix, store, mod) | about 1,550 lines plus 890 lines of tests | `cc-twitch` | Widen scopes and subscriptions per module. Make the keyring cross-platform. Resubscribe after a drop and mark the gap. Honour Ratelimit-\* headers |
| `crates/shadowrunr-daemon/src/moderator/` (rules, mod, lane, store) | about 1,370 lines plus 830 lines of tests | `cc-gatehouse` | Keep the rule model, shadow and armed, strikes, the fenced batched classifier and the ledger. Leave `voice.rs` behind, because it is show-specific |
| `crates/shadowrunr-engine/src/` (admission, api, claude\_cli, alt\_cli, ladder, ledger, limits, model, stream, health) | the whole crate | `cc-engine` | Reorder backends so the live lane is the OpenAI API or a local model, and the CLI is the slow lane only. `claude_cli` is kept and adapted (the development default, D10), and `codex_cli` is added beside it behind the same provider trait: its JSONL event parser, the shared spawn door, and a probe for installed, version and signed in (`codex login status` style checks; the exact probe command is to verify in WP 1.4) |
| The daemon's `/rpc` and `/events` server, with resume by sequence (`crates/shadowrunr-daemon/src/server.rs`) | — | `cc-core` | Same protocol; methods come from the module registry |
| `packages/contract/scripts/` (codegen, check, generate) | — | `packages/contract` | Unchanged pipeline: Rust types to JSON Schema to TS types and ajv validators |
| `packages/stage-kit/src/` (pure reducer, timed slots, playback) | chosen by the work package 0.4 inventory | `packages/renderer` | Only the pure parts; no show-specific scenes |

The pinned stack is the same as Shadowrunr's: Tauri 2.12, React 19.3, Vite 8, TypeScript 6, axum 0.8, tokio, rusqlite 0.38, schemars 1.2, ajv 8, vitest 5.

## How Codex executes and the Director reviews

**Roles.**

- **Director.** An Opus App Master (Personas' headless /appmaster loop), facing the owner. It owns this plan, writes each builder brief, reviews every diff, runs the gates and merges. It never writes product code, and it never delegates a judgement.
- **Builder.** One OpenAI Codex thread per work package. Every builder runs the Codex CLI with model `gpt-6.1-sol` at reasoning effort `high`, fixed for every package (the owner's "handicap"). Up to 5 build threads run in parallel.
- **Reviewer.** The Director reads the diff against the package's acceptance criteria, so no package is reviewed only by the model family that wrote it. A `codex exec review` pass on the branch may run first as a cheap pre-check, but the verdict is the Director's.

**Flow for each work package:**

1. **Brief.** The director writes it from this tab: files in scope, acceptance criteria, gates, the doc surface it owns, and the contract identifiers it touches, copied verbatim.
2. **Build.** The builder works in its own git worktree on the branch the App Master's loop cuts for it (`autopilot/<charter>-<run>`), with the work package id at the start of every commit subject (`WP 0.1: ...`). There are no PRs: the Director fast-forward merges after the gates. If something is unclear, it returns a question instead of guessing.
3. **Review.** The Director posts a verdict: pass, or a list of defects, each with a file and line. A bounce goes back to the same build thread.
4. **Merge.** The director re-runs the gates, reads the diff, and merges or sends it back.

**Sessions and threads.** The hackathon asks for a Codex session ID, so threads are kept on purpose.

- **The main thread.** The project owns one main Codex thread, started read-only in the repo root and primed with this plan. Its id is the Codex session ID submitted to Devpost.
- **A thread per work package.** Each package runs in its own Codex thread, forked from the main thread (`codex exec fork <main-id>`), in its own worktree.
- **A bounce resumes.** A review bounce resumes that same thread (`codex exec resume <thread-id>`), never a fresh one.
- **The journal.** The Director's journal records each thread id beside its work package.

**Repo law** (pasted into every brief):

- Commit only files you touched: never `git add -A`, never stash, never `--no-verify`.
- No credentials in code, config, logs, fixtures or test output. Twitch tokens and API keys live in the OS keychain and are referenced by label only.
- A spawned Codex CLI runs in an explicit sandbox (`-s read-only` for design work) with the user's own sign-in. Never use `--dangerously-bypass-approvals-and-sandbox`. Never read, copy or inject credentials, and never read `~/.codex/auth.json`.
- Real chat never becomes a fixture. Test data is generated and labelled simulated.
- Every value that crosses a boundary is parsed by its schema in one place.

**Live-test rules:**

- Live tests run only on the owner's test channel. Armed actions only ever target the owner's own test accounts.
- No armed action reaches a real viewer until the M1 exit is met and the owner signs off in writing.
- An Extension build reaches only allowlisted accounts until the owner approves submission.

**Done for a work package:**

- every acceptance criterion is checked off with evidence (a test name, a command and its output, or a screenshot);
- the gates are green;
- the reviewer's verdict is pass;
- the doc surface the package owns is updated.

## Milestones

| Milestone | Delivers | Depends on | Exit |
| --- | --- | --- | --- |
| **M0 Foundations and live spike** | The repo, the gates, the contract, the core service, the Twitch bridge proven live, and the desktop shell in the Castle Control design | — | On a real test channel: device login, live chat in the app, one shadow verdict, one armed timeout on a test account, and one OBS browser source the app created |
| **M1 Gatehouse** | The AI moderator: verdict pipeline, gate, governor, rules, classifier, the Herald's chart, the recorder and the drill | M0 | A two-hour test stream in shadow mode has every decision in the ledger. The drill reproduces the live decisions on the recording. Owner sign-off unlocks armed mode |
| **M2 Lot Chamber** | Verifiable draws with the guardrails and an on-stream draw | M1 | A draw on the test channel. Its writ verifies independently in the web verifier and the command-line verifier |
| **M3 Beacons** | Contribution events to intensity to an OBS visual, the asset designer, and art through Leonardo | M1 | A simulated 50-sub gift bomb and a real test cheer both move the live visual in OBS |
| **M4 Map Room** | The Extension shell, the hosted service, the studio and the test ladder | M1, plus Twitch's answer on policy 4.9 | The war-table template runs in Hosted Test for allowlisted accounts. A design change needs no new review |
| **M5 Steward** | The co-pilot across all four chambers | M1 to M4 for its tools; it can start after M2 | Each chamber accepts a Steward writ that the streamer seals or tears up. Nothing changes without a seal |
| **M6 Release** | Signed installers for three platforms, the landing site, docs, and the pre-release checks | All | The release checklist is green (see Part 3, work package 6.3) |

**First usable cut: M0, M1 and M2.** A streamer gets a protected and readable room plus fair, verifiable draws, all local and free. That is the Overlord sandbox demo.

## M0 — Foundations and live spike

Seven work packages. Work package 0.6 can start on day one in parallel with 0.1, because it only needs a crate and a test channel.

### WP 0.1 — Repo, licence and gates

*Builder Codex · reviewer Director · size S*

- **Scope:**
  - the Cargo workspace and the pnpm workspace;
  - `LICENSE` (Apache-2.0) and `NOTICE` (credits Shadowrunr OS);
  - `AGENTS.md` (read by the Codex builders) and `CLAUDE.md` (read by the Director), carrying the repo law from "How Codex executes and the Director reviews";
  - `docs/PLAN.md`, which points at this doc;
  - `.github/workflows/ci.yml`;
  - `prototype/`, the winning prototype, moved from `docs/plan/prototype/`.
- **Gates, all blocking from the first commit:**
  - `cargo fmt --check`, `cargo clippy -D warnings` and `cargo test`;
  - `pnpm typecheck`, `pnpm lint` and `pnpm test`;
  - TypeScript strict, plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax` and `erasableSyntaxOnly`;
  - an import-boundary and cycle check;
  - hygiene: no `any`, no `as unknown as`, no raw `keydown` listener, no swallowed catch;
  - a 400-line file cap;
  - a secrets scan.
- **Acceptance:**
  - every gate prints how many files it walked, and exits non-zero when it walked none;
  - each gate is proven red once on a seeded violation, and the evidence is logged in the PR;
  - CI runs on Windows.
- **Doc surface:** `AGENTS.md` and `docs/PLAN.md`.

### WP 0.2 — Contract and core service

*Builder Codex · reviewer Director · size M*

- **Scope:**
  - `cc-types`: the method table, `StreamEvent`, branded ids and the error envelope;
  - `packages/contract`: the copied codegen, `check` and `generate` scripts;
  - `cc-core`: axum on `127.0.0.1` with `POST /rpc` and `GET /events` (WebSocket), resume by `seq`, and the module registry trait.
- **Acceptance:**
  - one method table generates the Rust dispatch, the JSON Schema and the TS types and validators;
  - the drift gate fails when a generated file is stale;
  - `JSON.parse` exists only in the contract package's door;
  - an `/events` client that reconnects with `since_seq` receives every missed event in order, or a `resync` event once the buffer has rolled over;
  - one error envelope with at most 10 codes (see Contract identifiers);
  - the service binds to loopback only, and a test proves a non-loopback bind is refused. Loopback is still a door, so every /rpc and /events call carries a per-launch session token that only the desktop shell holds. The OBS overlay is served from a separate, read-only origin with no route to /rpc. Method names form three sets (declared, registered, invoked) with a parity gate. Event kinds are a closed registry with its own parity gate. Events are invalidation, and the client refetches from the authoritative read. The drift gate counts what it generated and fails on zero or on orphans.

### WP 0.3 — Store, ledgers and retention

*Builder Codex · reviewer Director · size S*

- **Scope:** `cc-store`. It holds SQLite migrations, append-only JSONL ledgers (`decisions`, `draws`, `engine`), the retention cap, `forget_user(login)` and `purge_all()`.
- **Acceptance:**
  - a ledger line is never rewritten, and a test proves append-only;
  - `forget_user` deletes a viewer's recordings and their id-to-name mapping, across an inventory of every store (recordings, rollups, caches, exports, writs). Ledgers reference viewers by Twitch user id, never by name or message text, so they stay intact. Each ledger line is canonically serialised with a per-record digest, and carries both event time and record time;
  - `purge_all` runs when the bridge reports a revoked authorization;
  - the retention cap is a setting, and recordings older than it are deleted by a scheduled job. A value below the floor is refused, not clamped. Every purge offers a dry-run preview: the same predicate, with counts and their as-of time.

### WP 0.4 — UI inventory, tokens and the component kit

*Builder Codex · reviewer Director · size M*

- **Scope:**
  - a read-only inventory of `prototype/`, steps Q0 and Q1 of the port contract: every visual component and its duplicates, token reality, state machines, keymaps and URL contracts;
  - `packages/tokens` (one source, generating CSS variables and a TS mirror);
  - `packages/ui`: rampart, chambers column, page header, numbered panel, rule table, verdict and status chips, ink buttons, mark, empty states and the theme toggle;
  - a kit page that renders the real components.
- **Acceptance:**
  - token values are byte-equal to `prototype/tokens.css`;
  - each rejected token candidate is listed with its reason;
  - every duplicate in the inventory resolves to one component;
  - the kit page at 1440x900 matches the prototype's shell with zero deviations on paper, inks, type and rules, in both themes.

### WP 0.5 — Desktop shell

*Builder Codex · reviewer Director · size M*

- **Scope:** `apps/desktop`. It covers:
  - the Tauri 2 shell;
  - the four chamber routes with empty states;
  - the rampart wired to `status.get` and `bridge.status`;
  - one keymap registry (1–4 and `/`) with a conflict check;
  - a fixture mode that loads simulated data with a visible "simulated" label.
- **Acceptance:**
  - ON AIR, Twitch, OBS and the Gatehouse chip render on every route from live events;
  - fixture mode can never be mistaken for live;
  - the app opens the four chambers by keyboard alone.

### WP 0.6 — Twitch bridge port

*Builder Codex · reviewer Director · size M*

- **Scope:** `cc-twitch`, copied and adapted from `platform/twitch/`. It covers:
  - device-code login;
  - a cross-platform keyring (Windows native, macOS keychain, Linux secret service);
  - token refresh;
  - EventSub WebSocket with keepalive, reconnect and resubscribe;
  - gap events;
  - a Helix client that reads the Ratelimit-\* headers;
  - the scope set as a table, one row per module.
- **Acceptance:**
  - the tests from the source are ported and pass;
  - a dropped socket resubscribes every subscription and emits `bridge.gap {from, to}`;
  - tokens never appear in logs (a test greps captured logs);
  - token refresh runs ahead of expiry with jitter, as a single flight; code asks the vault to make a call and never receives the token; SECURITY.md records the keyring's custody class (anything running as the same user can read it); EventSub topics are packed into connections that have room, each with its own state machine; a revoked token triggers `purge_all`.

### WP 0.7 — Live spike

*Builder Codex · reviewer Director · size S · the owner joins live*

- **Scope:**
  - a `spike` command in `cc-core`;
  - `cc-obs`: an obs-websocket v5 client with `CreateInput` for a browser source on `http://localhost:<port>`.
- **Acceptance, run on the owner's test channel and recorded in `docs/spike-log.md`:**
  - device login completes;
  - chat typed on the channel appears in the app;
  - one shadow verdict is logged;
  - one armed timeout lands on the owner's test account and is undone;
  - OBS shows a browser source the app created;
  - a forced socket drop recovers with a gap event.
- **Gate.** M1 does not start until this spike passes.

## M1 — Gatehouse

Every other module reads chat only after the Gatehouse's verdict, so this milestone carries the product's safety. Its order of layers is fixed:

1. safety detection;
2. the deterministic rules;
3. the classifier;
4. the action gate.

**Safety does not live in the prompt.** It lives in a deterministic gate at the last door before any action.

### WP 1.1 — Verdict pipeline and the action gate

*Builder Codex · reviewer Director · size L*

- **Scope.** `cc-gatehouse`, starting from the copied rule model. It covers:
  - **Order.** Ingest, then the disclosure detector, then the rules pre-filter, then the fenced classifier, then the action gate, then the verdict.
  - **Disclosure detector.** It runs before any batching, dedupe or flood collapse, and is biased to recall.
  - **Authority.** Moderator and broadcaster status come only from Twitch's verified metadata. Missing metadata counts as the lowest rank.
  - **Shadow and armed.** These are grants checked by the gate, never a bypass of it.
  - **The ban queue.** It is durable and survives a restart. A person decides on the real message, never a summary. A timeout on the decision means hold, never proceed.
  - **Undo, petitions and the persistence penalty.** The penalty escalates on tagged attempts only.
  - **A care state.** It is kept outside the model and fails toward care.
  - **The decision ledger.** It is written through one chokepoint.
- **Acceptance:**
  - A message that discloses self-harm or crisis is never deleted, timed out or banned automatically. It reaches the streamer. A seeded bank proves this, and the result is reported with its n.
  - Rail-class rules cannot be switched off; only their delivery is configurable.
  - An unrecognised verdict counts as withheld.
  - A gate that cannot run takes no action. "Gate skipped" and "gate found nothing" are separate outcomes, with per-path coverage in the ledger summary.
  - Auto-ban (D7) works only under a scoped, expiring grant with a ceiling of bans per hour and a circuit breaker that trips back to human click. It is never available to a classifier-only rule.
  - A chat line claiming "mod here" gains nothing.

### WP 1.2 — Gate: delay, held queue and Shield Mode

*Builder Codex · reviewer Director · size M*

- **Scope:**
  - the chat delay (`gatehouse.delay.set`);
  - `automod.message.hold` v2 and resolving held messages;
  - Shield Mode on and off;
  - `channel.moderate` v2, so actions taken in Twitch's own UI enter the ledger;
  - `channel.suspicious_user.message`.
- **Acceptance:**
  - The hold budget is written as a decomposition (Twitch's delay, scheduling wait, admission, rules, model and gate), and the measured p95 of each stage is recorded.
  - An action taken in Twitch's UI appears in the gate roll within 2 s.
  - Ban, unban and warn honour Twitch's rate limits, and a limited call surfaces `rate_limited` with `retry_after_ms`.

### WP 1.3 — Governor

*Builder Codex · reviewer Director · size S*

- **Scope:**
  - room tiers S to XL from chatters in the last 10 minutes;
  - hysteresis;
  - room modes on timed leases;
  - yielding to a human: when a moderator changes a chat setting in Twitch, the governor stops touching that setting until its lease ends.
- **Acceptance:**
  - a simulated room oscillating at a tier border switches at most once per hysteresis window;
  - every lease ends by itself;
  - the governor never acts on a person.

### WP 1.4 — Engine and the classifier lanes

*Builder Codex · reviewer Director · size M*

- **Scope.** `cc-engine`, ported from `shadowrunr-engine`. It covers:
  - **A role-class table.** Call sites name a class, never a model. The classes are live, near-live, batch and offline.
  - **Default (D2).** A local model on an OpenAI-compatible endpoint (Ollama or LM Studio). The OpenAI API (Responses API) on the user's own key is opt-in, with a plain notice.
  - **Admission.** A model is admitted to a class on its tail latency and longest silence.
  - **A capability floor** measured for structured verdicts on small local models.
  - **A labelled fallback ladder:** model, then rules only, then an honest refusal. A rule verdict never looks like a model verdict.
  - **A provider trait** for the CLI slow lane with two backends: `claude_cli` (headless Claude Code, `claude -p --output-format stream-json`, the development default) and `codex_cli` (`codex exec --json`). The provider is chosen in settings and recorded per call in the ledger, never hardcoded (D10).
  - **One spawn door** shared by both CLI backends:
    - an allowlisted environment; an API key from the OS keychain goes in as `CODEX_API_KEY` or `ANTHROPIC_API_KEY` to that child only, and is never logged; never `--dangerously-skip-permissions` or `--dangerously-bypass-approvals-and-sandbox`;
    - the prompt over stdin;
    - a neutral working directory;
    - a JSONL event parser: `thread.started` carries the thread id; `turn.completed`, `turn.failed`, `item.*` and `error` are mapped to engine outcomes;
    - `probe()` for installed, version and signed in (`codex login status` style checks; the exact probe command is to verify here);
    - a termination ladder with a Windows Job Object;
    - an orphan sweep at start.
- **Acceptance:**
  - the CLI never runs on the live lane;
  - both CLI backends pass the same contract tests against a fake CLI binary, and switching the provider in settings changes no call site;
  - a planted sentinel secret is not visible to the child, and the app never reads `~/.codex/auth.json`;
  - the engine ledger records the class, the model selected, the model served and the cost for every call;
  - with no model available, live moderation continues on rules alone, labelled as rules-only.

### WP 1.5 — The Herald's chart

*Builder Codex · reviewer Director · size M*

- **Scope:**
  - opinion directions from messages that passed the gate, built from keyword seeds the streamer sets, an emote lexicon tagged by meaning, and local embeddings;
  - a sliding window with 3-minute deltas;
  - filters (all, emotes, text, a single emote).
- **Acceptance:**
  - a barred message never counts;
  - the chart has no code path to any action;
  - load shedding counts what it shed and shows the count;
  - the series is stable under a seeded replay.

### WP 1.6 — Recorder and the drill

*Builder Codex · reviewer Director · size M*

- **Scope:**
  - **The recorder.** It records the streamer's own channel from install day on, under retention.
  - **Imported logs.** Each one carries its source on every result.
  - **The drill.** It replays a recording through a rule set, and diffs two rule sets.
  - **The seeded simulated-chat generator.** It is adapted from `shadowrunr-sim` and labelled simulated.
  - **A rule test bank** with near-misses: roasts, dark jokes and quotes.
  - **A blind judge** for classifier evaluation, from another model tier.
- **Acceptance:**
  - Results use named states: acted, not provoked, not evaluable, judge pending, judge void and engine failed. Passes are counted directly.
  - Every run carries an instrument hash over the rules, bank, judge and prompts, and runs with different hashes are never merged.
  - Over-moderation is reported on its own axis.
  - The drill writes nothing to the live ledger, and its output is labelled simulated.
  - Gaps in a recording show as gaps.

### WP 1.7 — Gatehouse page

*Builder Codex · reviewer Director · size M*

- **Scope.** The chamber page from Part 2:
  - the room hero;
  - the Herald's chart;
  - the live room with Pass, Hold and Bar;
  - at the portcullis;
  - the rules table with armed and watching;
  - the gate roll with Undo and Petition;
  - the drill as a nested page.
- **Acceptance:**
  - the page meets the fidelity contract;
  - the live room stays virtualised at 4,200 lines;
  - the ban queue shows the real message and the rule, with Ban and Dismiss.

**M1 exit.** All of these must hold:

- A two-hour test stream in shadow mode has every decision in the ledger.
- The drill over its recording, under the same instrument hash, reproduces the live decisions.
- The disclosure bank routes every case to a human, reported with its n.
- The owner signs off in writing before any rule is armed against real viewers.

## M2 — Lot Chamber

### WP 2.1 — Draw engine and guardrails

*Builder Codex · reviewer Director · size M*

- **Scope.** `cc-lots`, covering:
  - pools: chatters, followers, subscribers, redeemers and keyword typists, read only from post-verdict events;
  - entry weights, winner count, cooldowns and cohort caps;
  - the draw content types;
  - `check_draw`, the guardrail policy as one pure function.
- **Acceptance:**
  - A barred message never creates a lot, and a test proves it.
  - `check_draw` returns `blocked`, `warn` or `ok`, with reasons, for every row of Part 1's giveaway table:
    - paid entry or paid weight on a prize draw is `blocked`;
    - a total prize value over $5,000 is `blocked` until registration is confirmed;
    - subscriber-only entry, or points with no free path, is `warn`;
    - a draw with no prize is `ok`.
  - Unlocking a blocked setting writes a risk acknowledgement to the `draws` ledger.
  - A cohort cap and a cooldown hold in a 10,000-run property test. Any non-equal weight follows a concave curve, and the page publishes the weight table along with how many newcomers outweigh the heaviest entrant.

### WP 2.2 — Seal, beacon, cast and writ

*Builder Codex · reviewer Director · size M*

**Proof-core ownership (operator standup, 2026-10-25).** The seal hash, beacon
verification, cast and writ format live in the `crates/cc-verify` library,
which `cc-lots` calls. The seven `lots.*` wire payload pairs and three event
payloads are typed by the separate lots contract delivery (2026-10-25), and
are no longer Pending. RPC handlers and event transport wiring remain separate.
Offline prep is allowed under the standup exception
above; it grants no live bridge wiring or armed actions before the spike.

- **Scope:**
  - **Seal.** Freezing the roll writes the canonical entry list and its SHA-256, which is the seal.
  - **Beacon.** A drand quicknet client picks the first round after the seal plus a margin, then fetches that round and verifies its signature.
  - **Cast.** Winners come from seeded rejection sampling over the round value, the seal and each handle.
  - **Writ.** The proof bundle is written as JSON.
  - **Verifiers.** `cc-verify` on the command line, and `packages/verifier-web` as one HTML file.
  - **Offline fallback.** Without a network, the draw falls back to commit-and-reveal labelled "streamer-controlled".
- **Acceptance:**
  - the same writ yields the same winners in Rust and in the web verifier, across 1,000 generated writs;
  - a writ whose round signature fails is rejected;
  - the animation is fed only the cast result;
  - no code path lets a winner change after the seal.

### WP 2.3 — Lot Chamber page and the draw on stream

*Builder Codex · reviewer Director · size M*

- **Scope:**
  - the chamber page from Part 2: the roll hero and panels 1.1 to 1.5;
  - the writ as a nested page;
  - the on-stream draw shapes (urn, wheel, deck, ballot box) in `packages/renderer`;
  - the Twitch disclaimer overlay;
  - the `overlord-urn` template, which draws 3, 7 or 15 lots by room tier.
- **Acceptance:**
  - the page meets the fidelity contract;
  - the roll's dot field stays virtualised at 10,000 lots;
  - a draw runs end to end on the test channel and its writ verifies;
  - a prize draw cannot start without the disclaimer and the rules template.

## M3 — Beacons

### WP 3.1 — Event intake and intensity

*Builder Codex · reviewer Director · size M*

- **Scope:**
  - **Subscriptions:** `channel.cheer` and `channel.bits.use` (deduped), subscribe, gift and resub, Hype Train v2, channel points v2, charity, goals and Custom Power-ups.
  - **The intensity engine:** each visual's ranges map totals onto 0 to 1, with a decay rule.
  - **`beacons.simulate`** for test bursts.
- **Acceptance:**
  - one cheer that arrives as both events counts once;
  - decay is deterministic under a fake clock;
  - money never reaches a draw, a vote, a rank or a moderation decision (a test asserts the crate's dependency direction).

### WP 3.2 — Design packages, renderer and OBS delivery

*Builder Codex · reviewer Director · size M*

- **Scope:**
  - a design-package schema of layers (image, shape, text, particle preset) whose properties bind to intensity;
  - `packages/renderer`, CSS-first and built for OBS's embedded Chromium;
  - `apps/overlay`, served by `cc-core` on `http://localhost` with a strict CSP;
  - `obs.source.create`, which busts the cache with the package hash.
- **Acceptance:**
  - one bundle renders the same package in OBS and in the Extension test harness;
  - the overlay loads no remote resource; design packages are data-only by default; a package with scripts runs only on the overlay's own origin, which has no route to /rpc; a package update that widens its declared privileges waits for the streamer's consent;
  - a package change reaches OBS within 1 s without a manual refresh;
  - the renderer does no per-frame DOM rebuild when intensity is unchanged.

### WP 3.3 — Beacons page and asset designer

*Builder Codex · reviewer Director · size M*

- **Scope:** the chamber page from Part 2, made of:
  - the beacon cards;
  - the kindling curve editor, with decay and weighting;
  - test fire, including the 50-sub bomb;
  - the event feed;
  - Copy browser-source URL.
- **Acceptance:**
  - the page meets the fidelity contract;
  - dragging a curve point updates the live preview and OBS;
  - the feed stays virtualised at 600 events.

### WP 3.4 — Leonardo client

*Builder Codex · reviewer Director · size S*

- **Scope:** an image client behind a provider trait. It covers:
  - a bring-your-own key in the OS keychain;
  - `public:false` on every request;
  - an anchor image, then image references for a matching set;
  - remove-bg for transparent assets;
  - each call's cost written to the `engine` ledger;
  - generated art labelled as generated in the asset list.
- **Acceptance:**
  - with no key, the feature is hidden and nothing else breaks;
  - the key never appears in logs or the ledger;
  - a recorded fixture replaces the network in tests.
- **Owner check:** read Leonardo's API terms on ownership before AI art ships in a public Extension.

## M4 — Map Room

### WP 4.0 — Ask Twitch first

**Dropped by the operator's 2026-10-25 standup.** No email is sent to Twitch.
M4 builds for local test and Hosted Test with allowlisted accounts only; there
is no review submission. This supersedes the historical policy-answer dependency
elsewhere in the snapshot. It does not authorize public release or submission.

### WP 4.1 — Extension shell

*Builder Codex · reviewer Director · size L*

- **Scope:** `apps/extension`. Everything is bundled: no eval and no remote scripts. It covers:
  - the shared renderer;
  - viewer controls (vote, pick a tile, join a side);
  - viewer JWT handling;
  - reading design data from the 5 KB configuration segment or from our service;
  - images from the one allowlisted host only.
- **Templates as data:**
  - the hex map (the `war-table` template);
  - a choice board;
  - a viewer card;
  - the draw;
  - a contribution meter.
- **Acceptance:**
  - a static check proves the bundle has no `eval`, no `new Function` and no remote script;
  - every template renders from data alone;
  - viewer content follows policy section 7: a Twitch ID is required, the streamer approves it, and the username is shown;
  - Bits never buy an entry, a ticket or a random outcome.

### WP 4.2 — The hosted Extension service

*Builder Codex · reviewer Director · size M*

- **Scope:** `cc-ebs`, a stateless Rust service. It:
  - holds the Extension secret;
  - verifies viewer JWTs;
  - signs PubSub broadcasts and coalesces state into snapshots of at most 5 KB, at most one per second per channel;
  - serves design data;
  - receives Extension Bits events by webhook.
- **Also in scope:** deploy scripts for the shared service, and a self-host guide.
- **Acceptance:**
  - a load test at 100 updates a second per channel emits at most one broadcast per second;
  - the secret is read from the host's secret store, never from a file in the repo;
  - the service keeps no viewer data beyond what a request needs.

### WP 4.3 — Map Room page and the test ladder

*Builder Codex · reviewer Director · size M*

- **Scope:** the chamber page from Part 2: the map table, pieces, orders, templates, the spyglass and test status. It also covers:
  - the test ladder (sand table, then muster, then proclaimed);
  - the operator modes (human, AI streamer, or AI proposes and the human approves).
- **Acceptance:**
  - the page meets the fidelity contract;
  - the war-table template runs in Hosted Test for allowlisted accounts;
  - a design change reaches viewers with no new review;
  - the AI operator can only propose, never act, unless the streamer sets it to drive.

## M5 — Steward

### WP 5.1 — Writ protocol and the slow lane

*Builder Codex · reviewer Director · size M*

- **Scope:**
  - `steward.ask` returns a writ: a typed configuration change for one chamber, shown as a diff;
  - `steward.writ.seal` applies it, and `steward.writ.tear` discards it;
  - the engine's slow lane runs the configured CLI provider (Claude Code during development; Codex once the OpenAI lane is proven), for Codex headless (`codex exec --json`, prompt on stdin, `-s read-only`, `-o` for the last message, `--output-schema` for the writ where useful, `codex exec resume <id>` for follow-ups), and falls back to the OpenAI API or a local model.
- **Acceptance:**
  - nothing changes without a seal;
  - a writ that fails its chamber's schema is shown as an error and never applied;
  - the app never reads, stores or passes credentials beyond the keychain key handed to the child as `CODEX_API_KEY`, and a test asserts that the CLI's logged environment and arguments carry none and that a planted sentinel is invisible to the child; the child runs in the read-only sandbox, never with `--dangerously-bypass-approvals-and-sandbox`, and its stance is verified from the child, so a silent downgrade fails the call; what each CLI version supports is kept as dated data;
  - every call's cost lands in the `engine` ledger;
  - the product name and UI do not imply OpenAI endorsement; "Built with Codex" or "Powered by OpenAI" attribution follows OpenAI's brand guidelines (verify current guidelines).

### WP 5.2 — The Steward in every chamber

*Builder Codex · reviewer Director · size M*

- **Scope:** one writ schema per chamber. Examples:
  - "Run a draw for subscribers' questions, 3 winners" (the Lot Chamber);
  - "Arm the links rule, keep caps watching" (the Gatehouse);
  - "A gold frame that glows harder with each gift sub" (the Beacons; may call the Leonardo client);
  - "A choice board with 3 options every 60 s" (the Map Room).
- **Acceptance:**
  - each example produces a valid writ against the simulated channel;
  - a writ that would unlock a blocked guardrail is refused with the guardrail's reason.

## M6 — Release

### WP 6.1 — Packaging and updates

*Builder Codex · reviewer Director · size M*

- **Scope:**
  - Tauri bundles for Windows, macOS and Linux;
  - code signing;
  - a signed updater feed;
  - CI release builds for all three platforms.
- **Acceptance:**
  - a clean machine installs, logs in and opens all four chambers;
  - an update from the previous build keeps settings, ledgers and keychain entries. Every release candidate is rehearsed as an update from the previous release, and a failed update leaves the old version bootable. The release job lists the expected artifacts for each OS and architecture, so a skipped job cannot pass as green. The installed tree is checked against a manifest and launched. Each platform has a written line saying whether it is signed. The version has one source, with a drift gate.

### WP 6.2 — The landing site

*Builder Codex · reviewer Director · size M*

- **Scope:** `apps/site`, ported from `prototype/index.html` onto the shared tokens. It fixes the wordmark defect and links to the downloads, docs and source.
- **Acceptance:**
  - the page meets the fidelity contract at 1920x1080, 1280x800 and 390x844;
  - the intro hands over control within 4 s and can be skipped;
  - reduced motion gets a calm version;
  - the honesty labels are present.

### WP 6.3 — Release checklist

*The director, with the owner · size S*

- [ ] A trademark search on "Castle Control" is done, and the name is kept or replaced.
- [ ] A lawyer has reviewed the official-rules template and the guardrail table.
- [ ] Twitch's answer on Extension policy is on file, and the shell is submitted for review.
- [ ] Leonardo's terms are confirmed for public use of AI art.
- [ ] The privacy notice covers local chat storage, retention, forget and purge, and the cloud opt-in.
- [ ] Docs cover install, login, each chamber, self-hosting the Extension service, and the verifier.

## Contract identifiers

These names are the wire contract. A package that needs a new one adds it to `cc-types` in its own PR before building against it. Castle words never appear in identifiers.

`status.get` carries optional `stream` and `gatehouse` summaries, invalidated by `bridge.status` and `gatehouse.room` respectively; absent summaries mean unknown, never off.

**WP 1.1 typed payloads (offline contract delivery, 2026-10-25).**

| Type | Fields and constraints |
| --- | --- |
| `Rule` | `rule_id: RuleId`, nonblank `name`, `rule_class: RuleClass`, `mode: RuleMode`, `action: Action`, nonblank `delivery` routing label, optional nonblank `pattern: string`, optional nonblank `text: string` (at most 500 characters), optional `timeout_s: uint32` (1..=1209600), optional `strikes: StrikePolicy`, optional `auto_ban_grant: AutoBanGrant` |
| `StrikePolicy` | Positive uint32 `count` and `window_s`, `then: Action`, optional `then_timeout_s: uint32` (1..=1209600); escalation after count hits of the same rule by the same viewer within window_s |
| `AutoBanGrant` | `expires_at: Timestamp`, positive uint32 `max_bans_per_hour`, `breaker_tripped: bool`; scoped to the containing pattern rule only |
| `ModeAcknowledgement` | `at: Timestamp`, nonblank `reason`; logged with the mode-change decision before arming |
| `RulesListResult` | `rules: Rule[]` |
| `RulesUpsertParams` | `rule: Rule` |
| `RulesSetModeParams` | `rule_id: RuleId`, `mode: RuleMode`, optional `acknowledgement: ModeAcknowledgement`; acknowledgement required when mode is armed |
| `DecisionParams` | `decision_id: DecisionId`; identifies the queued or original decision for confirm, dismiss or undo |
| `PetitionResolveParams` | `decision_id: DecisionId`, `outcome: PetitionOutcome`; the outcome upholds or overturns the original decision |
| `Decision` | `decision_id: DecisionId`, `message_id: MessageId`, `kind: DecisionKind`, `verdict: Verdict`, optional `rule_id: RuleId`, `operator: Operator`, `at: Timestamp`, `simulated: bool`, `reason_codes: string[]`, optional nonempty `message_text: string` |

The seven method payload pairs are: rules.list takes Empty and returns
RulesListResult; rules.upsert takes RulesUpsertParams and returns Rule;
rules.setMode takes RulesSetModeParams and returns Decision; ban.confirm,
ban.dismiss and decision.undo take DecisionParams and return Decision;
petition.resolve takes PetitionResolveParams and returns Decision. These names
are under the existing gatehouse method prefix. WP 1.2/1.3, WP 1.5/1.6 and
lots methods are typed by the deliveries below; typing registers no RPC handler.

Pattern rules require pattern and forbid text; classifier rules require text and
forbid pattern. Rails forbid pattern, text and strikes: detectors are owned by
code and only delivery is configurable. timeout_s is required exactly when action
is timeout; then_timeout_s is required exactly when strikes.then is timeout.
Classifier rules cannot escalate to ban through strikes (D7). Rust TryFrom and
JSON Schema enforce these conditions and the bounds above identically. StrikePolicy
denies unknown fields; present optional keys reject null through the same contract
door. Regex compilation is not validated here: cc-gatehouse compiles and refuses
bad patterns on upsert.

All records deny unknown fields. Present optional keys reject null. Unknown enum
values, including verdicts, fail parsing; they are never coerced to pass.
Rail rules must remain armed and cannot carry a grant. Only delivery can be
configured for an existing rail: the owning action gate must compare stored
rules on upsert and mode changes, and cannot treat an upsert as arming consent.
Classifier rules cannot carry an auto-ban grant, enforced by Rust and schema
parsers. A grant is configuration, never authority by itself: the action gate
still checks armed mode, logged consent, expiry, the hourly ceiling and the
breaker, and returns to human click when tripped. Delivery labels and reason
codes are plain data, not executable instructions or new enum vocabularies.
A ban_pending Decision requires the original message_text, never a summary.
This is a review payload; the append-only ledger continues to store IDs rather
than message text. The contract cannot prove that supplied text is original;
the owning service must fetch it from its durable queue.

**WP 1.2/1.3 typed payloads (offline contract delivery, 2026-10-26).**

| Method or type | Params, result and invariants |
| --- | --- |
| `gatehouse.held.resolve` (WP 1.2) | `HeldResolveParams { message_id: MessageId, outcome: HeldOutcome }` -> existing `Decision`; the service resolves the original held message and returns `released` for allow or `removed` for deny |
| `HeldOutcome` | Exactly `allow` or `deny`; resolution intent is separate from `Verdict` and `DecisionKind` |
| `gatehouse.delay.set` (WP 1.2) | `DelaySetParams { delay_s: ChatDelay }` -> `DelaySetResult { delay_s: ChatDelay }`; numeric seconds, exactly 0 (off), 2, 4 or 6; reuses the existing ChatDelay TryFrom and schema enum |
| `gatehouse.shield.set` (WP 1.2) | `ShieldSetParams { enabled: bool }` -> `ShieldState { enabled: bool }`; true enables Shield Mode, false disables it; numbers and string on/off values are rejected |
| `gatehouse.lease.end` (WP 1.3) | `LeaseEndParams { lease_id: LeaseId }` -> existing `Decision`; the service records the room-mode change, not an action on a viewer |
| `LeaseId` | Branded canonical uppercase ULID string; the lease-owning service mints through `LeaseId::mint`, reads parse through TryFrom. A lease has a separate lifecycle from a DecisionId; a mode name cannot identify a particular lease |

All records deny unknown fields. Required keys cannot be missing or null;
existing optional Decision keys must be omitted when absent and reject present
null. Decision, DecisionId, MessageId, Timestamp and the ten-code ErrorEnvelope
retain their existing validation. Rate limits use `rate_limited` with optional
`retry_after_ms`, never a new error code. Rust and TypeScript consume the same
generated, simulated JSON fixtures in `crates/cc-types/tests/fixtures/gatehouse_gate.json`.

This delivery adds no RPC registration, Twitch calls or governor implementation.
Typing an input grants no authority to act. WP 1.2 must fetch the durable original
held message, enforce the action gate, report only Twitch-confirmed delay/Shield
settings, honour rate limits and log Twitch UI actions. WP 1.3 must resolve the
service-owned lease, preserve expiry and human-yield semantics, and return the
resulting room decision. Those service semantics cannot be proved by shape
validation. No live wiring precedes the WP 0.7 spike.

**WP 1.5/1.6 typed payloads (contract delivery, 2026-10-25).**

| Method or type | Params, result and invariants |
| --- | --- |
| `gatehouse.consensus.get` (WP 1.5) | `ConsensusGetParams { window_s: positive uint32, filter: ConsensusFilter }` -> `ConsensusGetResult { at: Timestamp, window_s: positive uint32, filter, directions: OpinionDirection[], shed_count: uint32 }`; sliding window ends at `at`, and shed_count reports messages shed in that window/filter even when directions is empty |
| `ConsensusFilter` | Closed record union tagged by `kind`: `all`, `emotes`, `text`, or `emote` with required nonempty `emote`; other variants forbid an emote field |
| `OpinionDirection` | Nonempty `key` and `label`, `share: ConsensusShare`, optional `delta_3m: ConsensusDelta`, `messages: uint32`, `series: ConsensusPoint[]`; a point is `{ at: Timestamp, share: ConsensusShare }` |
| Consensus scalars | `ConsensusShare`: finite number 0..1; `ConsensusDelta`: finite number -1..1, share now minus share 180 seconds earlier (fraction units). Missing history omits delta_3m rather than inventing a zero |
| `ConsensusEventPayload` | Existing `gatehouse.consensus` event only: `{ kind: "gatehouse.consensus", payload: ConsensusGetResult }`; no new event names or event transport changes |
| `gatehouse.drill.run` (WP 1.6) | `DrillRunParams { recording: GatehouseText, configuration: DrillConfiguration }` -> `DrillRunResult` |
| `gatehouse.drill.diff` (WP 1.6) | `DrillDiffParams { recording: GatehouseText, baseline: DrillConfiguration, candidate: DrillConfiguration }` -> `DrillDiffResult { label: "simulated", baseline: DrillRunResult, candidate: DrillRunResult, changes: DrillChange[] }`; sides retain separate instruments and summaries, never a pooled score |
| `DrillConfiguration` | `rules: Rule[]`, nonempty `bank` and `judge` configuration labels, `prompts: GatehouseText[]`; the service resolves immutable bank/judge contents, not executable code or a model selected at a call site |
| `DrillRunResult` | `label: "simulated"`, nonempty `source`, `instrument_hash: InstrumentHash`, `instrument: DrillInstrument`, `outcomes: DrillOutcome[]`, `summary: DrillSummary`, `gaps: BridgeGap[]` |
| `DrillInstrument` | `rules_hash`, `bank_hash`, `judge_hash`, `prompts_hash`, each an `InstrumentHash`; the run's instrument_hash identifies the canonical instrument covering all four inputs |
| `InstrumentHash` | Exactly 64 lowercase ASCII hexadecimal characters (SHA-256), without a prefix, whitespace or trailing newline; Rust TryFrom and JSON Schema reject the same malformed hashes |
| `DrillState` | Exactly `acted`, `not_provoked`, `not_evaluable`, `judge_pending`, `judge_void`, `engine_failed`; these are evaluation states, not new moderation verdicts |
| `DrillOutcome` | `message_id: MessageId`, nonempty `source`, `at: Timestamp`, `state: DrillState`; optional existing `verdict: Verdict`, `action: Action`, `rule_id: RuleId`, and direct observation `passed: bool`; omit unavailable observations |
| `DrillSummary` | `passes: uint32` counted directly from observed passes, `states: DrillStateCounts` with one uint32 counter per named state, `over_moderation: OverModeration { evaluated: uint32, false_positives: uint32 }`; over-moderation has its own explicit denominator |
| `DrillChange` | `message_id: MessageId`, `before: DrillState`, `after: DrillState`; full per-side outcomes retain action/verdict details even when the state is unchanged |
| `gatehouse.recording.import` (WP 1.6) | `RecordingImportParams { source: GatehouseText, messages: RecordedMessage[], gaps: BridgeGap[] }` -> `RecordingImportResult { recording: GatehouseText, source: GatehouseText, message_count: uint32, gaps: BridgeGap[] }` |
| `RecordedMessage` | Existing `message_id: MessageId`, `user_id: TwitchUserId` (string), `at: Timestamp`, `text: string`; imported content is inert replay data, never moderation authority |
| Recording references and source | `GatehouseText` is a nonempty string. `recording` is an opaque service-owned reference, never a caller-supplied file path. `source` is a provenance label, never a location to fetch. Import results, both replay/diff sides and every outcome retain source. `BridgeGap { from: Timestamp, to: Timestamp }` preserves missing intervals |

All records deny unknown fields. Present optional keys reject null; absent keys
are omitted. Rust parsers/TryFrom and generated JSON Schema enforce the same
scalar, tagged-union and shape invariants above. Replay results and diff wrappers
can only carry the `simulated` label. Rule, Action, Verdict and existing IDs retain
their current constraints; no separate replay verdict/identity vocabulary is added.

This delivery supplies no handler, recorder, replay engine, classifier, publisher
or hash implementation. WP 1.5 must enforce post-verdict intake, window/series
semantics and shedding counts. WP 1.6 must resolve recording references under the
owner's retention policy, preserve source and gaps, compute and verify instrument
hashes from canonical rules/bank/judge/prompts, count actual observations, validate
summary arithmetic and diff alignment, and refuse aggregation across different
instrument hashes. It must keep replay writes out of the live ledger. Hash shape
validation alone does not prove the supplied digest or summary is correct.

**Lots typed payloads (contract delivery, 2026-10-25).**

| Method or type | Params, result or fields |
| --- | --- |
| `lots.draw.list` (WP 2.1) | `Empty` -> `DrawListResult { draws: LotsDraw[] }` |
| `lots.draw.upsert` (WP 2.1) | `DrawUpsertParams { draw: LotsDraw }` -> `LotsDraw` |
| `lots.draw.check` (WP 2.1) | `DrawCheckParams { policy: LotsDrawPolicy }` -> `DrawCheckResult { result: CheckResult, reasons: string[] }` |
| `lots.roll.lookup` (WP 2.1) | `RollLookupParams { draw_id: DrawId, user_id: TwitchUserId }` -> `RollLookupResult { draw_id: DrawId, entry?: LotsRollEntry }`; lookup uses service time, absent entry means not currently eligible |
| `lots.roll.seal` (WP 2.2) | `RollSealParams { draw_id: DrawId, source: RandomnessSource, margin_s: positive uint32 }` -> `RollSealResult { draw_id: DrawId, draw_run_id: DrawRunId, sealed: LotsSealedRoll }` |
| `lots.cast` (WP 2.2) | `CastParams { draw_run_id: DrawRunId }` -> `CastResult { draw_run_id: DrawRunId, writ_id: WritId, cast: LotsVerifiedCast }`; no client-supplied winners or replacement entries |
| `lots.writ.get` (WP 2.2) | `WritGetParams { writ_id: WritId }` -> `LotsWrit` directly, without an RPC wrapper inside the proof |
| `LotsDraw` | `draw_id: DrawId`, nonblank `name`, `policy: LotsDrawPolicy`, `rules: LotsRollRules` |
| `LotsDrawPolicy` | Exact DrawPolicy fields: `content: DrawContent`; booleans `paid_entry`, `paid_weight`, `subscriber_only`, `channel_points`, `free_entry_equal_odds`, `registration_confirmed`, `official_rules`, `twitch_disclaimer`; optional `minimum_age: uint8`; `regions: string[]`; `prize_value_usd_cents: LotsUnsigned` |
| `LotsRollRules` | `pool: LotsPool`, `winner_count: 1..65535`, `cooldown_s: uint32`, `cohort_caps: LotsCohortCap[]`, `weight_curve: LotsWeightCurve`, `free_join_equal_odds: bool` |
| `LotsPool` | Tagged by `kind`: `chatters`, `followers`, `subscribers`, `redeemers`, or `keyword` with a nonempty single-token `keyword` |
| `LotsCohortCap` | Nonblank `cohort`, `numerator: uint16`, `denominator: 1..65535`; the domain constructor checks numerator <= denominator |
| `LotsWeightCurve` | Tagged by `kind`: `equal`, or `concave` with `max_units: 1..65535` |
| `LotsRollEntry` | `user_id: TwitchUserId`, `source_message_id: MessageId`, `entered_at: Timestamp`, unique `cohorts: string[]`, positive uint32 `weight` |
| `LotsWeightTable` | `rows: LotsWeightRow[]`, positive uint32 `newcomer_weight`, uint32 `heaviest_weight`, optional positive uint32 `newcomers_to_outweigh_heaviest`; each row contains `user_id: TwitchUserId` and positive uint32 `weight` |
| `LotsSealedRoll` | Exact cc-verify SealedRoll JSON: `roll: LotsProofRoll`, `seal: LotsHex32` |
| `LotsProofRoll` | `version: 1`, `entries: LotsProofEntry[1..10000]`, positive uint32 `winner_count` and `margin_s`, `sealed_at: LotsProofTime`, `randomness: LotsRandomnessPlan` |
| `LotsProofEntry` | Lowercase ASCII `handle` matching `[a-z0-9_]{1,25}`, positive uint32 `weight`; handles remain handles in the existing proof format, not Twitch IDs |
| `LotsRandomnessPlan` | Tagged by `source`: `drand_quicknet` with `chain_hash: LotsHex32`, `round: LotsRound`; or `streamer_commit` with `commitment: LotsHex32` |
| `LotsWrit` | Exact cc-verify Writ JSON: `roll: LotsProofRoll`, `seal: LotsHex32`, `proof: LotsProof`, `winners: LotsHandle[1..10000]`; no draw/run/writ IDs added to the signed format |
| `LotsProof` | Tagged by `source`: `drand_quicknet` with `signature: LotsSignature`, `randomness: LotsHex32`; or `streamer_commit` with `seed: LotsHex32` |
| `LotsVerifiedCast` | Exact VerifiedCast JSON: `seal: LotsHex32`, `winners: LotsHandle[1..10000]`, `label: drand-quicknet or streamer-controlled` |
| `LotsEventPayload` | Tagged `{ kind, payload }` binding: `lots.roll` -> `LotsRollPayload { draw_id, weight_table }`; `lots.sealed` -> `RollSealResult`; `lots.cast` -> `CastResult` |
| Lots scalar boundaries | `TwitchUserId`: 1..32 decimal digits, positive without leading zero; `LotsRound`: canonical positive decimal uint64 string; `LotsHex32`: 64 lowercase hex characters; `LotsSignature`: 96 lowercase hex characters; `LotsProofTime`: valid whole-second UTC timestamp from 1970 through 9999; `LotsUnsigned`: integer 0..9007199254740991 |

Lots records deny unknown fields, and present optional keys reject null. Rust
parsers/TryFrom and JSON Schema enforce the same scalar, collection and tagged
shape invariants above, including uint64 round overflow without float conversion.
The safe-integer bound on cents preserves exact JS numbers; cc-lots' actual
concave weights fit uint32. Reason codes are plain data, projecting PolicyReason
as `paid_entry`, `paid_weight`, `prize_value_over_cap`, `subscriber_only`,
`points_without_free_path`, `missing_age`, `missing_region`, `missing_rules`,
and `missing_disclaimer`. A check or policy flag is never authority to bypass a
guardrail or a durable risk acknowledgement.

Schema parsing does not verify a proof: cc-verify still checks canonical sorted
unique entries, winner count against entry count, source/proof agreement, the
seal, beacon schedule/signature, commitment and recomputed winners. Likewise,
cc-lots constructors still check cap fractions, duplicate cap names and weight
table arithmetic; the RPC adapter must reconcile policy/pool/free-entry settings
and run the guardrails before sealing. No cryptographic, policy or eligibility
implementation is duplicated here. All 1,000 writs from cc-verify's own simulated
fixture round-trip unchanged in Rust and TypeScript contract tests.

The narrow contract assumes the service owns the configured roll, clock, beacon
trust anchor and offline seed; the client chooses only source/margin when sealing
and addresses the resulting run when casting. The three typed event payloads are
exported separately from the existing seq/at/kind-only StreamEvent invalidation
envelope; this delivery changes no core publisher or handler. Adding payload
delivery to /events remains part of later RPC wiring, preserving existing callers.

**Beacons typed payloads (contract delivery, 2026-10-26).**

| Method or type | Params, result or fields |
| --- | --- |
| `beacons.visual.list` (WP 3.1) | `Empty` -> `VisualListResult { visuals: Visual[] }` |
| `beacons.visual.upsert` (WP 3.1) | `VisualUpsertParams { visual: Visual }` -> `Visual` |
| `beacons.curve.set` (WP 3.1) | `CurveSetParams { visual_id: VisualId, curve: IntensityCurve }` -> `Visual` |
| `beacons.simulate` (WP 3.1) | `BeaconsSimulateParams { visual_id: VisualId, burst: SimulatedBurst }` -> `BeaconsSimulateResult { label: simulated, intensity: BeaconsIntensity }`; `{ source: gift, amount: 50 }` models a 50-sub gift bomb |
| `beacons.source.url` (WP 3.2) | `SourceUrlParams { visual_id: VisualId }` -> `SourceUrlResult { url: LoopbackSourceUrl }` |
| `Visual` | `visual_id: VisualId`, nonblank `name`, optional `design_id: DesignId`, `curve: IntensityCurve`; existing slug ID doors are reused |
| `IntensityCurve` | Nonempty `ranges: IntensityRange[]`, `decay: IntensityDecay`; each range is a control point `{ total: uint32, intensity: Intensity }` |
| `IntensityDecay` | Tagged by `kind`: `none`, or `exponential` with positive uint32 `half_life_s` |
| `ContributionSource` | `cheer`, `bits_use`, `subscribe`, `gift`, `resub`, `hype_train`, `channel_points`, `charity`, `goal`, `power_up` |
| `Contribution` | `source: ContributionSource`, `broadcaster_id: TwitchUserId`, `event_id: MessageId`, optional `user_id: TwitchUserId`, `amount: uint32`, nonblank `dedupe_key`; anonymous/system sources omit user identity |
| Contribution units | Bits for cheer/bits_use; counts for subscribe/gift/resub/power_up; level for hype_train; points for channel_points; minor currency units for charity/goal. WP 3.1 normalizes compatible inputs before aggregation |
| `SimulatedBurst` | `source: ContributionSource`, `amount: uint32`; no supplied Twitch identities or live contribution records |
| `BeaconsIntensity` | `visual_id: VisualId`, `intensity: Intensity`; finite fraction in 0..1, including endpoints |
| `LoopbackSourceUrl` | Canonical `http://localhost:port/`, `http://127.0.0.1:port/` or `http://[::1]:port/` plus ASCII path/query and valid percent escapes; port 1..65535 without leading zero; no credentials, fragment, whitespace or remote host |
| `BeaconsEventPayload` | Existing event registry bindings `{ kind, payload }`: `beacons.contribution` -> `Contribution`; `beacons.intensity` -> `BeaconsIntensity` |

All records deny unknown fields, enums reject unknown values, and present optional
keys reject null. Absent keys are omitted. Rust parsers and generated JSON Schema
enforce the same scalar and shape constraints. Amounts and control-point totals
are exact uint32 integers; Twitch identities remain strings. No contribution
field is added to lots or Gatehouse contracts. The existing seq/at/kind-only
StreamEvent remains an invalidation envelope; payload transport wiring is deferred.

This delivery supplies contracts only. Design-package layer schemas are supplied
by the separate WP 3.2 contract delivery below. WP 3.1 must validate ordered
distinct range totals, interpolation,
source selection/weighting and compatible units, evaluate decay under its clock,
and keep simulation labelled and separate from live contribution accounting.
It must derive a canonical underlying contribution identity scoped by broadcaster:
the same cheer received through channel.cheer and channel.bits.use shares one
dedupe_key even when their source and transport event_id differ. A nonblank key
alone does not perform deduplication. WP 3.2 must return URLs from its isolated
read-only overlay origin with no RPC route; loopback syntax alone proves no origin
isolation. No handler, dedupe engine, publisher, renderer or OBS call is added here.

**Beacons art typed payloads (contract delivery), 2026-10-27.**

| Method or type | Params, result or fields |
| --- | --- |
| `beacons.art.status` (WP 3.4) | `Empty` -> `ArtStatusResult { available: bool }`; local key presence only, not provider health. No key material or keychain account label crosses this boundary; keychain failure remains an error |
| `beacons.art.generate` (WP 3.4) | `ArtGenerateParams` -> `ArtGenerateResult`; generate one anchor or a matching set, optionally remove backgrounds, then import successful outputs into the selected local design package before returning |
| `ArtGenerateParams` | `design_id: DesignId`, nonblank `prompt: string` (at most 1500 Unicode code points), `model_id: ArtModelId`, `width: ArtDimension`, `height: ArtDimension`, `quantity: ArtQuantity`, optional `reference: LocalAssetPath`, `remove_background: bool`. Without reference, quantity must be 1 (anchor); with reference, quantity is 1..8 (matching set) |
| `ArtModelId` | 1..128 ASCII letters, digits, underscores or hyphens, matching the existing client's model-id domain; used by both generation requests and cost receipts (`remove-bg` for background removal) |
| `ArtDimension`, `ArtQuantity` | Dimensions are integer multiples of 8 in 32..1536; quantity is an integer in 1..8. Rust and generated schema enforce the same bounds |
| `ArtGenerateResult` | `design_id: DesignId`, `assets: GeneratedArtAsset[]` (0..8 successfully imported files), nonempty `costs: ArtCostReceipt[]`. Empty moderated output still carries the paid submission receipt |
| `GeneratedArtAsset` | Asset-list entry with `asset: LocalAssetPath`, required `generated: true`, and `provenance: ArtProvenance`. Both parsers reject false; the host retains these labels in imported asset metadata for later asset-list display |
| `ArtProvenance` | `leonardo_generated` or `leonardo_background_removed`, matching the existing image client's provenance values |
| `ArtCostReceipt` | `call_id: ArtCallId`, `model: ArtModelId`, `charge: ArtCharge`; same serialized receipt fields as `cc-beacons::art::CostRecord`. One receipt per successful paid submission/removal call; read-only polls create no new receipt |
| `ArtCallId` | Canonical uppercase ULID; parsing/minting reuse the shared ID doors, independently of provider job/image identifiers |
| `ArtCharge` | Exactly one externally tagged value: `{ credits: ArtCredits }` or `{ micro_usd: integer }`. Micro-USD is nonnegative and at most 9007199254740991 (safe JS integer); larger values are refused rather than rounded. Credits are never converted to dollars |
| `ArtCredits` | Exact decimal string: 1..12 whole digits and optionally a decimal point with 1..6 fractional digits, matching the client's cost parser; no signs, exponent, numeric coercion or invented zero |

All records deny unknown fields. Absent reference is omitted; present null is
rejected. Existing DesignId slug and LocalAssetPath doors are reused. `public`
is not a caller option: future handlers always use the client's server-owned
`public:false`. Keychain labels, provider URLs and provider job/image IDs are
not fields of either result. References identify local assets in `design_id`;
the future host must resolve them to that package's stored generated anchor and
original provider image ID, and reject missing/non-generated references. Path
syntax alone does not establish ownership, filesystem confinement or existence.

This delivery defines the contract only: no handler, RPC registration, importer,
ledger writer, asset store or UI. The existing client returns receipts but does
not yet write the engine ledger; integration must map them at its approved write
door and retain receipts even when the provider withholds output. Generated
assets must be downloaded and confined to the local package before return;
provider URLs never reach the UI or overlay. `remove_background` applies to each
generated output. No automatic paid retries are authorized. The owner's terms
check still gates generated art in a public Extension.

Type-only exports remain available from the contract root. New runtime handles
`beaconsArtStatus` and `beaconsArtGenerate` are exported through the independently
compiled `@castle-control/contract/beacons` subpath, for lazy desktop loading
within the unchanged 393216-byte first-load budget.

**Design package typed payloads (contract delivery, 2026-10-26).**

| Method or type | Params, result or fields |
| --- | --- |
| `DesignPackage` | `design_id: DesignId`, `content_hash: DesignContentHash`, ordered nonempty `layers: DesignLayer[]`, optional `privileges: DesignPrivileges`; layers paint back to front |
| `DesignContentHash` | Claimed SHA-256 content identity, exactly 64 lowercase hexadecimal characters; syntax validation does not verify package bytes |
| `DesignLayer` | Tagged by `kind`: `image` with `asset: LocalAssetPath`; `shape` with `shape: ShapeKind`; `text` with nonblank literal `text`; `particle_preset` with nonblank renderer-owned lookup name `preset`. Every variant requires `properties: LayerProperties` and `bindings: IntensityBinding[]` (empty means no bindings) |
| `ShapeKind` | `rectangle`, `ellipse`; unknown shapes are rejected |
| `LayerProperties` | Finite `x: DesignNumber`, `y: DesignNumber` in logical pixels; positive exact uint32 `width`, `height`; finite nonnegative multiplier `scale: DesignScale`; fraction `opacity: Intensity` in 0..1 |
| `IntensityBinding` | Tagged by `property`: `opacity` with `output_range: BindingRange<Intensity>`; `scale` with `BindingRange<DesignScale>`; `x` or `y` with `BindingRange<DesignNumber>`. Input is always the existing `Intensity` domain 0..1; no arbitrary CSS property names |
| `BindingRange<T>` | `at_zero: T`, `at_one: T`, the output endpoints at input intensity 0 and 1. Descending ranges are permitted; each endpoint independently obeys its property domain |
| `DesignNumber`, `DesignScale` | Finite f64 values; scale additionally requires >= 0. Opacity and its binding endpoints reuse `Intensity` rather than percentages |
| `LocalAssetPath` | ASCII package-relative path of nonempty slash-separated segments. Each segment starts with a letter, digit, underscore or hyphen, then letters, digits, dots, underscores or hyphens. No http(s) or other scheme, authority, absolute path, dot/traversal segment, backslash, percent escape, query, fragment or whitespace |
| `DesignPrivileges` | Tagged by `kind`: `data_only` with no extra fields (the default), or explicit `scripts` with nonempty `scripts: LocalAssetPath[]` entry points. Omitted privileges mean data-only and stay omitted on serialization; present null is rejected |
| Contract parser | `parseDesignPackage(text)` uses the generated standalone `designPackage` validator at the existing JSON door. Validators share definitions and retain the pure initializers from 80ec8c9 so unused package validation can be tree-shaken |

All records deny unknown fields and enums reject unknown values. Present optional
keys reject null; absent keys are omitted. Rust and generated validators enforce
the same path, hash, finite-number and exact uint32 bounds. There is no script
field on a layer or on the package: script entry points require the explicit
privilege variant. This declares a capability request, never execution consent.

**Renderer bindings and the overlay remain separate WP 3.2 work.** That work must
evaluate bindings, resolve preset names, verify the content hash over a defined
canonical package/asset representation, and confine local asset resolution
(including symlinks) to the package root. The host renders text as literal text.
It must isolate scripts on the overlay origin without /rpc, obtain consent before
widening privileges, enforce CSP and forbid remote loads, and deliver the verified
hash to OBS for cache busting. No RPC identifier, handler, renderer, asset loader,
consent action, overlay or OBS call is added in this contract delivery.

**Steward writ contract (WP 5.1).** Offline contract delivery only; existing
Steward methods remain `Pending` in the method table. The registered
`steward.writ` event kind and `WritId::mint()` door are reused without duplication.

| Identifier | Fields and constraints |
| --- | --- |
| `AskParams` | `chamber: WritChamber`, nonblank `prompt: string`, optional `writ_id: WritId` referencing an existing writ for follow-up context; a new writ ID is minted by the service, never the caller |
| `AskResult` | `writ: Writ`; standalone schema for the future `steward.ask` result |
| `Writ` | `writ_id: WritId` (canonical ULID), `chamber: WritChamber`, `proposal: WritProposal`, `status: WritStatus`, `created_at: Timestamp`, `updated_at: Timestamp`, optional `error: ErrorEnvelope`; proposal method must belong to chamber |
| `WritChamber` | `lots`, `gatehouse`, `beacons`; Map Room is deferred until its configuration mutation has a typed contract. `DesignPackage` is rendering data, not a Map Room configuration mutation |
| `WritStatus` | `proposed`, `sealed`, `torn`, `invalid` |
| `WritProposal` | Tagged by `method`, with typed `diff`: `lots.draw.upsert` -> `WritDiff<DrawUpsertParams>`; `gatehouse.rules.upsert` -> `WritDiff<RulesUpsertParams>`; `gatehouse.rules.setMode` -> `WritDiff<RulesSetModeParams>`; `beacons.visual.upsert` -> `WritDiff<VisualUpsertParams>`; `beacons.curve.set` -> `WritDiff<CurveSetParams>` |
| `WritDiff<T>` | Optional `before: T`, required `after: T`; whole typed mutation snapshots, not JSON patch paths or executable code. Omitted before denotes creation; after is the proposal. TS schema specializations are named `WritDiff`, `WritDiff2`, `WritDiff3`, `WritDiff4`, `WritDiff5` in the method order above |
| `WritSealParams`, `WritTearParams` | `writ_id: WritId`; standalone schemas for the existing seal/tear identifiers |
| `WritSealResult`, `WritTearResult` | `writ: Writ`; the resulting authoritative snapshot |
| `StewardEventPayload` | `{ kind: "steward.writ", payload: Writ }`; module payload binding only; the shared `StreamEvent` remains seq/at/kind invalidation |
| JSON parsers | `parseStewardAskParams`, `parseStewardAskResult`, `parseWrit`, `parseWritSealParams`, `parseWritSealResult`, `parseWritTearParams`, `parseWritTearResult`, `parseStewardEvent`; each takes JSON text through the existing door and its standalone generated validator |

All records deny unknown fields and present optional keys reject null. Missing
keys stay omitted. UTC timestamps reuse the calendar-validated RFC 3339 `Timestamp`.
The tagged proposal union reuses existing mutation schemas, including their
arming acknowledgement, rule and numeric constraints. Rust and JSON Schema
both reject mismatched chamber/method combinations. The generator retains shared
definitions and the pure validator initializers from 80ec8c9 for tree shaking.

These are data contracts, not authorization or a state machine. Later WP 5.1
handlers must read authoritative configuration for before snapshots, detect stale
proposals, enforce valid status/time transitions and error reporting, recheck
guardrails at seal, and apply nothing without a seal. A proposal's acknowledgement
data alone does not grant consent. Invalid proposals do not become executable
configurations; a generation/validation failure can use the existing error
envelope without accepting malformed proposal data. This delivery adds no handler,
registration, engine, CLI lane, UI or Map Room variant. Shared simulated fixtures
live in `crates/cc-types/tests/fixtures/steward.json` and are read by both languages.

**WP 1.4 engine settings (D10).** The existing Settings.values map uses these
exact dotted keys; `parse_engine_settings` in cc-types is their sole typed parser:

| Settings key | Type | Default |
| --- | --- | --- |
| `engine.cli_provider` | `CliProvider` | `claude_cli` (development default) |
| `engine.live_endpoint` | HTTP(S) URL string | `http://127.0.0.1:11434/v1` (loopback OpenAI-compatible local model) |
| `engine.cloud_opt_in` | bool | false |

`EngineSettings` is the Rust-only typed view with `cli_provider`, `live_endpoint`
and `cloud_opt_in`; it adds no second settings wire format. Missing keys take
defaults. Invalid types, unknown providers and malformed endpoints return an
`invalid` ErrorEnvelope without echoing the input. Endpoint URLs accept DNS/IP
hosts, optional ports and paths/queries; credentials, fragments, whitespace,
non-ASCII input and malformed escapes are refused. Endpoint authorization and
cloud opt-in enforcement remain the engine's job. The CLI remains slow-lane only.

**Conventions:**

- **Method names** are `<module>.<noun>.<verb>`, in lower camel case.
- **Fields** are snake\_case.
- **Time** is an RFC 3339 UTC string. Durations are integers named `*_ms` or `*_s`. Twitch ids, drand round numbers and seeds travel as strings, because they can exceed JavaScript's safe-integer range.
- **Absent values: omit the key.** Use `Option` with skip-if-none in Rust and an optional property in TS. Never write `null`, and never `0` or `""` for unknown. Two packages coding a missing value must not drift.
- **Branded ids**, each minted at one door:
  - `MessageId` (Twitch's);
  - `DecisionId`, `WritId`, `DrawRunId`, `LeaseId` and `ArtCallId` (ULIDs);
  - `RuleId`, `DrawId`, `VisualId` and `DesignId` (slugs the streamer can read).

| Module | Methods |
| --- | --- |
| core | `status.get`, `settings.get`, `settings.set`, `auth.twitch.start`, `auth.twitch.status`, `auth.twitch.revoke`, `bridge.status.get`, `obs.status.get`, `obs.source.create`, `store.forgetUser`, `store.purgeAll` |
| gatehouse | `gatehouse.rules.list`, `gatehouse.rules.upsert`, `gatehouse.rules.setMode`, `gatehouse.ban.confirm`, `gatehouse.ban.dismiss`, `gatehouse.decision.undo`, `gatehouse.petition.resolve`, `gatehouse.held.resolve`, `gatehouse.delay.set`, `gatehouse.shield.set`, `gatehouse.lease.end`, `gatehouse.consensus.get`, `gatehouse.drill.run`, `gatehouse.drill.diff`, `gatehouse.recording.import` |
| lots | `lots.draw.list`, `lots.draw.upsert`, `lots.draw.check`, `lots.roll.lookup`, `lots.roll.seal`, `lots.cast`, `lots.writ.get` |
| beacons | `beacons.visual.list`, `beacons.visual.upsert`, `beacons.curve.set`, `beacons.simulate`, `beacons.source.url`, `beacons.art.status`, `beacons.art.generate` |
| maproom | `maproom.design.get`, `maproom.design.upsert`, `maproom.stage.get`, `maproom.turn.run` |
| steward | `steward.ask`, `steward.writ.seal`, `steward.writ.tear` |

**Stream events on `/events`.** Every event carries `seq`, `at` and `kind`:

- **core:** `bridge.status`, `bridge.gap`, `obs.status`, `chat.message`;
- **gatehouse:** `gatehouse.verdict`, `gatehouse.decision`, `gatehouse.room`, `gatehouse.consensus`;
- **lots:** `lots.roll`, `lots.sealed`, `lots.cast`;
- **beacons:** `beacons.contribution`, `beacons.intensity`;
- **maproom:** `maproom.turn`;
- **steward:** `steward.writ`;
- **resync:** `resync`, sent when the client's `since_seq` is older than the buffer.

**Enums:**

| Enum | Values |
| --- | --- |
| `Verdict` | `pass`, `hold`, `bar` |
| `RuleMode` | `shadow`, `armed` |
| `RuleClass` | `rail`, `pattern`, `classifier` |
| `PetitionOutcome` | `upheld`, `overturned` |
| `CliProvider` | `claude_cli`, `codex_cli` |
| `BridgeState` | `disconnected`, `connecting`, `connected`, `error` |
| `Action` | `warn`, `delete`, `timeout`, `ban`, `hold` |
| `DecisionKind` | `held`, `released`, `removed`, `warned`, `timed_out`, `banned`, `ban_pending`, `mode_changed`, `undone`, `would_act` |
| `Tier` | `s`, `m`, `l`, `xl` |
| `RoomMode` | `slow`, `follower_only`, `emote_only`, `unique_chat` |
| `ChatDelay` | `0`, `2`, `4`, `6` (seconds) |
| `DrawContent` | `prize`, `question`, `idea`, `seat` |
| `CheckResult` | `ok`, `warn`, `blocked` |
| `RandomnessSource` | `drand_quicknet`, `streamer_commit` |
| `DesignStage` | `local_test`, `hosted_test`, `released` |
| `Operator` | `human`, `ai`, `ai_proposes` |
| `EngineLane` | `live`, `batch` |
| `ErrorCode` | `invalid`, `not_found`, `conflict`, `unauthorized`, `rate_limited`, `upstream`, `unavailable`, `blocked_by_policy`, `needs_human`, `internal` |

The error envelope is `{code, message, retry_after_ms?, detail?}`. A consumer branches only on `code`.

## Standards, risks and first steps

**Standards the plan follows.** The acceptance criteria above come from the organisation's knowledge registry, read on 2026-10-25 before the work packages were written. Each brief names its subjects so a builder reads them before coding.

| Area | Registry subjects | What they changed in this plan |
| --- | --- | --- |
| Moderation and safety | live-chat-moderation-and-anti-bait, live-safety-rails, hitl-approval | The fixed layer order with a deterministic last-door gate. Disclosure detection before batching. Durable ban queue. Auto-ban only under an expiring grant with a ceiling |
| Replay and testing | simulated-audience-testing, time-travel-replay | Named result states, instrument hashes, near-miss bank, blind judge, simulated labels |
| Engines | model-routing, live-response-latency-budgeting, agent-cli-transport, subprocess-lifecycle | Role classes instead of model names, tail-latency admission, the Codex CLI kept to the slow lane with an allowlisted environment and a verified read-only sandbox |
| Contract and events | ipc-contract, realtime-events, codegen | A session token on loopback, parity gates, ids as strings, events as invalidation |
| Secrets and data | credential-vault, audit-logging, data-retention | Brokered calls, single-flight refresh, ledgers by id, refused retention below the floor, dry-run purges |
| Viewer influence | audience-steering-economies | Code decides every winner, concave weights published, red lines outside any economy |
| Extensions and release | untrusted-extension-host, release-pipeline, packaging | Data-only design packages, consent on widened privileges, rehearsed updates, installed-tree checks |

**Gaps in the standards, recorded rather than improvised around:**

- **Verifiable randomness.** No registry subject covers freeze, hash, beacon and seeded sampling. WP 2.2 relies on drand's published scheme, and its writ format is worth contributing back as a new technique.
- **Weak fit.** The streaming subjects are written for an AI host speaking on stream, not a moderator tool. Treat their mapping here as weak governance, and report what does not fit.

**Execution risks:**

| Risk | Mitigation |
| --- | --- |
| The live spike fails on login, refresh or reconnect | It is the first gate. M1 waits for it, and only M0 work is spent before it passes |
| Two builders drift on the wire | Every identifier is in Contract identifiers. A new one lands in `cc-types` first, in its own PR |
| A local model is too weak for structured verdicts | WP 1.4 measures a capability floor. Below it, rules alone run, labelled, and the cloud opt-in is offered |
| Twitch rejects the Extension premise | WP 4.0 asks before any build. The fallback is generic art in the streamer's colours |
| The UI port drifts from the prototype | The fidelity exit compares screenshots at fixed sizes. The prototype is in the repo as reference, not as code |
| Scope creep from Overlord's own needs | Overlord's urn and war table are data templates (D3). Show-specific code stays in Overlord |

**First steps.**

For the owner. Credentials are never pasted into chat or into the repo: each goes straight into the app or the OS keychain.

- [ ] Set up a Twitch test channel and two test viewer accounts for armed actions.
- [ ] Register a Twitch application for the desktop app (device-code flow).
- [ ] Enable obs-websocket v5 in OBS.
- [ ] Install a local model runtime (Ollama or LM Studio).
- [ ] Send the WP 4.0 policy question to Twitch now. Its answer takes the longest and gates M4.

For the director:

- [ ] Start the main Codex thread, read-only in the repo root and primed with this plan, and record its id as the Codex session ID.
- [ ] Write the briefs for WP 0.1 and WP 0.6 and start them in parallel, each in a thread forked from the main thread.
- [ ] The winning prototype is already under `docs/plan/prototype/`; WP 0.1 moves it to `prototype/`.
- [ ] Book the live spike, WP 0.7, with the owner as soon as WP 0.6 merges.
