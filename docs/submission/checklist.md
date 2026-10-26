# Hackathon package checklist

Offline evidence snapshot: **2026-10-26**, local main
`0181ffd985cb627b73b2290b1d3abcb8b83bacd2`. All short commit citations below
refer to ancestors of that main tip, read from this worktree. No remote
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
commit never counts as a live exit. These draft files are not yet on main and
do not mark their own delivery done.

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
| Codex thread map | pending-owner | **TODO — Director:** verify package → thread → delivered commit(s) → review evidence against the journal. Publish no private transcript data. |
| Main Codex session ID for Devpost | pending-owner | **TODO — Director:** verify the main thread ID from the journal and fill the README/form slot. No ID is fabricated or copied into this draft. |
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
| Owner test channel and two owned test accounts | pending-owner | Prepare isolated capture; armed spike action targets only an owned non-moderator account. Do not use a real viewer. |
| Twitch device-flow application, OBS v5 and local runtime | pending-owner | Prepare public client configuration, OS keychain entries and local model. Record only sanitized outcomes. |
| **M0 exit / WP 0.7**, scheduled Tue 10-27 | pending-owner | `cf75bb7` supplies the runner, but [spike-log.md](../spike-log.md) explicitly says pending owner live run: device login, app chat arrival, shadow stub, owned-account timeout/undo, visual OBS confirmation, forced-drop reconnect/gap. Fill every acceptance row with genuine evidence. |
| M1/M2 live bridge and UI wiring after spike | pending-build | Offline modules and fixture controls do not implement live RPC/data integration. Connect only after spike approval; do not infer a working live chart/draw from offline tests. |
| **M1 exit**: two-hour shadow stream, all decisions logged, drill reproduces them under the same instrument hash; disclosure bank reports every case routed to a human with n | pending-build | Prepare and complete integration/evaluation, then retain sanitized run interval, instrument hash, comparison and disclosure-bank results. Spike's shadow stub is insufficient. |
| Written owner sign-off before any armed real-viewer rule | pending-owner | Retain signed M1 approval. The demo still targets only owned test accounts; this package grants no real-viewer permission. |
| **M2 exit**: draw on test channel and same writ verifies in web and CLI | pending-build | Record post-verdict pool, seal announcement before round, trusted signed round, cast-fed OBS result and both verifier outputs with matching seal/winners. Use a no-prize question draw for the floor. |
| Prize-draw capture prerequisites if substituted later | pending-owner | Rules template, disclaimer, free equal-odds path and policy checks must be in place. Do not unlock paid entry/weight or expand this demo to actual prize distribution. |
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
| Privacy notice: local chat storage, retention, forget/purge, cloud opt-in | pending-build | Finalize/review notice against actual behavior. `d9e6ff2` adds store controls, not proof of a complete privacy notice. |
| Install/login/chamber/self-host/verifier user docs complete | pending-build | Existing desktop and verifier instructions are partial evidence; complete the release doc set against working features. This README draft does not finish WP 6.3. |
| Signed Windows/macOS/Linux installers and rehearsed updater (WP 6.1) | pending-build | Supply artifacts and installation/update evidence before claiming release readiness. |
| Landing with downloads/docs/source links (WP 6.2) | pending-build | Finalize and verify actual destinations; prototype art alone is not a published landing. |

Owner-only actions are parked asks. This documentation task does not contact
Twitch, call models, log in, arm rules, record real chat, publish or submit.
