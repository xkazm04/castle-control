# Hackathon package checklist

Evidence snapshot checked offline on **2026-10-29** against local main
`97d8dd4d6bc5adf0ba2b0c4e2f29aa8336832f04`. Commit citations and recorded
spike results are read from this worktree; this task ran no live checks. No remote
visibility, live service behavior, upload or submission was checked.

Sources: [plan entry point](../PLAN.md), implementation plan sections
[hackathon and schedule](../plan/03-implementation-plan.md#the-hackathon-twitchcon-x-openai-codex),
[milestone exits](../plan/03-implementation-plan.md#milestones), D10's OpenAI-lane
note, and [WP 6.3](../plan/03-implementation-plan.md#wp-63--release-checklist).
The 2026-10-25 operator standup in that plan overrides historical policy gates:
offline prep may precede the spike; no live wiring/arming before it; WP 4.0's
Twitch email is dropped, and M4 stays local/allowlisted Hosted Test with no
review submission.

Status key: **done** means the narrowly stated artifact is committed on local
main, with a proving commit below. **pending-build** means implementation,
integration, evidence or document finalization remains. **pending-owner** means
an owner/Director action, approval or external check remains. An offline code
commit never counts as a live exit. **pending-owner review** means a prepared
document still needs owner review; it does not close a release exit.
These drafts are on local main; their presence does not finalize the submission
or mark owner review complete.

## Dates and submission items

| Item | Status | Evidence / next action |
| --- | --- | --- |
| M0–M2 usable cut and floor recording by **Fri 2026-10-30** | pending-build | Offline components exist, but live exits below are open. [Floor shot list](floor-demo-script.md) totals 176 s; record only proven LIVE shots. |
| All planned phases targeted by deadline; Nov 1–2 reserved for video, README, landing and submission | pending-build | Reconcile remaining M3–M6 scope against completed exits; unfinished feature work waits. Schedule is a target, not completion evidence. |
| Complete submission package by **Mon 2026-11-02 12:00 PT** | pending-owner | Owner/Director assemble and verify the package two hours before the deadline. |
| Submit by **Mon 2026-11-02 14:00 PT** | pending-owner | Re-read current Devpost rules, complete form and retain confirmation. No rules recheck or submission has been performed in this offline task. |
| Local source repository, licence, NOTICE and CI definition exist | done | `5a9e4dc` adds LICENSE, NOTICE, workspaces and `.github/workflows/ci.yml`. This proves files exist, not a current green CI run or remote access. |
| GitHub repository public, or shared with organizers | pending-owner | Verify access to `xkazm04/castle-control` and the exact submitted revision. Local git cannot prove public visibility. Only Director pushes after gates. |
| Public YouTube video **at most 3 minutes**, showing the app working on Twitch and how Codex built it | pending-owner | Owner records, checks final duration, uploads publicly and supplies verified URL. Draft script is preparation only. Never substitute fixtures for live proof. |
| Public README finalized | pending-build | Review [readme-draft.md](readme-draft.md), update status/links/commands, fill verified metadata, then promote in a separately authorized change. Root README is untouched here. |
| Description of how Codex was used | pending-build | Workflow prose is drafted; `5a9e4dc` establishes builder rules and `e9fbb4c`, `5073b63`, `9925769` show package deliveries. Director must verify the final narrative and thread-to-commit map. |
| Codex thread map | pending-owner | **TODO: Director:** verify package → thread → delivered commit(s) → review evidence against the journal. Publish no private transcript data. |
| Main Codex session ID for Devpost | pending-owner | **TODO: Director:** verify the main thread ID from the journal and fill the README/form slot. No ID is fabricated or copied into this draft. |
| Final OpenAI-lane proof before final video, planned **Sun 2026-11-01** | pending-build | D10 requires Steward and classifier end to end on Codex CLI and OpenAI API, provider changed in settings only. `f129a5e` provides offline engine routing, `93caf59` its in-process classifier adapter, `befdf88` Steward contracts; none proves the end-to-end lane. |
| Runtime prerequisites for that proof | pending-owner | Prepare user's own CLI sign-in/keychain key and opt into cloud classification where required. Do not paste credentials, codes or keychain contents into evidence. |
| Factual attribution and final artwork review | pending-owner | Before publication verify current OpenAI brand guidelines as the plan requires; no implied endorsement. This offline draft adds no logo or endorsement claim. |

## Floor build and live evidence

| Item | Status | Evidence / next action |
| --- | --- | --- |
| Native shell and isolated fixture preview code | done | `e9fbb4c` adds Tauri launch and Vite isolation; `111d4f0` preserves unknown bridge state. [Desktop instructions](../../apps/desktop/README.md) document the real commands. This is not a mounted/live acceptance claim. |
| Gatehouse fixture review/replay page | done | `5073b63` implements fixture-only UI; `eba4fef` confirms fixture controls before applied state. Keep simulated labels visible. |
| Lot Chamber fixture page | done | `9925769` adds the fixture-only draw page, guardrails and nested proof preview. The preview writ is a fixed vector separate from the editable pool. |
| Offline consensus, recorder and drill logic | done | `146728b` adds the offline domain and tests. It does not supply the two-hour live recording or live/replay parity evidence. |
| Offline draw seal/cast and verifiers | done | `3380ffc` connects immutable offline seal/cast; `ac51742` audits sealing; `9c34d41` adds browser BLS/quicknet conformance; `71d125f` restores offline writ file verification. No live draw is proved. |
| Ruling 4: `castlecontrol.beacons_routing = A` — per-visual input and bounded read contract | done | Code at `c34855d` adds the source/native-unit selection and bounded `beacons.contribution.list` contract. This is code completion, not a live result. |
| Ruling 4 — accepted live contribution routing to curves and overlay | done | Code at `6cd46e6` registers `beacons.contribution.list`, deduplicates retained contributions before routing, and hands selected-curve intensity to the native overlay. [Routing tests](../../crates/cc-core/src/beacons/routing_tests.rs) use simulated inputs; no real cheer or live OBS acceptance is proved. |
| Ruling 4 — desktop Driven-by picker | done | Code at `b6c4e9b` adds the per-visual picker and saved source/unit pair. Live feed code followed at `97d8dd4`; see the next row and [Beacons](../guide/beacons.md). |
| Ruling 4 — desktop live contribution feed | done | **Code completion only**, at `97d8dd4`: core mode reads `beacons.contribution.list` on room entry or explicit refresh, beside the labelled simulated feed. Rows show amount, source/unit and user ID when present. Time/login columns were dropped because Contribution carries neither; adding them needs a later contract step. No live totals, real-cheer result or OBS movement is proved by this code completion. |
| Owner ask `0c0b9194`, option A — simulated burst to its OBS visual | pending-build | **Code completion only**, delivery `97b52c9c` (App Master commit/review pending): `beacons.simulate` also pushes that visual's render override, tagged `SIMULATED` on the native SSE stream, without changing live totals or retained contributions. [Generated-input tests](../../crates/cc-core/src/beacons/simulate_overlay.rs) cover native delivery, isolation and no-native fallback. This is not live OBS evidence; the OBS page does not yet display the stream's simulated marker. |
| Owner test channel and two owned test accounts | pending-owner | Prepare isolated capture; armed spike action targets only an owned non-moderator account. Do not use a real viewer. |
| Twitch device-flow application, OBS v5 and local runtime | pending-owner | Prepare public client configuration, OS keychain entries and local model. Record only sanitized outcomes. |
| **M0 exit / WP 0.7**, recorded Tue 10-27; Director clearance/capture review | pending-owner | [spike-log.md](../spike-log.md) acceptance table records all six WP checks PASS in run 10, 16:44:45–16:45:01 UTC: login, app chat, shadow stub, owned-target timeout/undo, static OBS source with screenshot reference, and reconnect/gap. O1–O8 also have recorded passes (O4/O8 after cleanup fixes); T1–T10 and F0–F9 remain pending. The log's pending header is stale for WP/O rows. Director must reconcile clearance and approve capture evidence; this task does not close the owner row or infer M1/M2 acceptance. |
| M1/M2 live bridge and UI wiring after spike | pending-build | M1a page/read wiring and M2 live wiring are built; live acceptance remains pending owner evidence after spike approval. **M1 update (M1a, 2026-10-29): page wiring built** at `c14ff93` on the existing chat/history/consensus reads, using generated validators, per-row provenance, explicit unavailable counts and virtualised lists. `gatehouse-core.test.ts` proves malformed-read rejection, page continuation and 4,200 rows; `moderation.test.tsx` preserves simulated fixture labels. Drill run/diff remain simulated; live parity: pending capture evidence. The older shell test's mock/expectation update landed at `b6184b5`; full gate: Director verification. See the [M1 runbook](../guide/gatehouse.md#m1-live-run). M2 live wiring landed at `0ea0d04` (see the M2 exit row and [M2 live run](../guide/lots.md#m2-live-run)). |
| **M1 exit**: two-hour shadow stream, all decisions logged, drill reproduces them under the same instrument hash; disclosure bank reports every case routed to a human with n | pending-owner | M1a reads/page wiring is built at `c14ff93`; capture-time instruments and `gatehouse.liveRun.get` at `617e094`, and retained-capture drill wiring at `c789279`. These are code completion with simulated tests, not owner live evidence. Follow the [M1 live run](../guide/gatehouse.md#m1-live-run), retaining the private ledger, history/consensus evidence and actual disclosure-bank output with n. Two-hour recording, live/replay parity and written owner sign-off remain open; today's rules cannot substitute for the live instrument. |
| Written owner sign-off before any armed real-viewer rule | pending-owner | Retain signed M1 approval. The demo still targets only owned test accounts; this package grants no real-viewer permission. |
| **M2 exit**: draw on test channel and same writ verifies in web and CLI | pending-owner | Native opt-in trusted quicknet (data-directory `live-quicknet` file, compiled-in anchor), post-verdict intake through the `ShadowPipeline`, a synchronous seal announcement before the target round, a separate cast-fed OBS Lots plate and writ export are built and recorded-transport tested at `0ea0d04` ([lots_live.rs](../../crates/cc-core/tests/lots_live.rs), [live_beacon.rs](../../crates/cc-core/tests/live_beacon.rs)). The owner must still keep a no-prize test-channel capture with the matching pool, the pre-round announcement, the signed round, the OBS winners, the writ and both verifier outputs, following the [M2 live run](../guide/lots.md#m2-live-run). No live exit is claimed. |
| Prize-draw capture prerequisites if substituted later | pending-owner | Rules template, disclaimer, free equal-odds path and policy checks must be in place. Do not unlock paid entry/weight or expand this demo to actual prize distribution. |
| **M3 exit**: simulated 50-sub gift bomb plus a real test cheer move the live OBS visual; package change reaches OBS within 1 s | pending-owner | Follow the owner [M3 live run](../guide/beacons.md#m3-live-run) and retain sanitized OBS/app evidence and measured timings. Cheer-to-live-OBS, simulated-bomb-to-OBS and OBS 1 s acceptance are not verified live yet. Code completion above and Chrome timings do not close it. Beacons remains beyond the floor demonstration. |
| Current full gate and secret scan for submitted revision | pending-build | Director must run the project gates on the final assembled revision and retain output. `5a9e4dc` proves gate tooling exists; it cannot prove future checks pass. |

## WP 6.3: public release checks, separate from submission

These checks may remain open on November 2. Do not call the hackathon package
a public production release or imply a reviewed Extension/signed installer.

| Item | Status | Evidence / next action |
| --- | --- | --- |
| Trademark search; keep or replace the working name | pending-owner | Owner confirms before public release. |
| Lawyer review of official-rules template and giveaway guardrails | pending-owner | Obtain review; offline policy code is not legal sign-off. |
| Twitch policy answer and shell review submission (historical WP 6.3 item) | pending-owner | **Deferred by operator standup:** no WP 4.0 email and no review submission for current test-only M4. Any public Extension release needs a new owner decision; do not present this as an active email ask or as completed. |
| Leonardo terms confirmed before public Extension AI art | pending-owner | Confirm ownership/use terms before shipping art in a public Extension. No such confirmation is evidenced here. |
| Privacy notice: local chat storage, retention, forget/purge, cloud opt-in | pending-owner review | [Draft privacy notice](../privacy.md), checked against `c3dea03` on 2026-10-28, cites implemented behavior and planned integration. Not reviewed by a lawyer; owner review remains open. |
| Install and login user docs | pending-owner review | [Install](../guide/install.md) and [login](../guide/login.md) cover unsigned Windows NSIS status, device flow and keychain custody. Artifact/install and owner-attended login evidence remain separate. |
| Chamber user docs | pending-owner review | [Gatehouse](../guide/gatehouse.md), [Lot Chamber](../guide/lots.md), [Beacons](../guide/beacons.md) and [Map Room](../guide/map-room.md) distinguish current features, fixtures and pending live exits. |
| Extension-service self-hosting user docs | pending-owner review | [Self-hosting stub](../guide/self-hosting.md) explicitly says M4 is not built yet. Review the stub now; a runnable deployment guide still needs the service implementation. |
| Verifier user docs and guide index | pending-owner review | [Verify a writ](../guide/verifier.md) covers CLI/web checks and independent trust; [guide index](../guide/README.md) links the doc set. No live draw or completed public release is claimed. |
| Signed Windows/macOS/Linux installers and rehearsed updater (WP 6.1) | pending-build | Supply artifacts and installation/update evidence before claiming release readiness. |
| Landing with downloads/docs/source links (WP 6.2) | pending-build | Finalize and verify actual destinations; prototype art alone is not a published landing. |

Owner-only actions are parked asks. This documentation task does not contact
Twitch, call models, log in, arm rules, record real chat, publish or submit.
