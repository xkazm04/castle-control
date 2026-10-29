# Gatehouse: moderation and replay

Draft for owner review; M1a read wiring updated 2026-10-29 on base `ce488e1`.
Open `#/chamber/moderator` or press 2. The drill is a nested page at
`#/chamber/moderator/drill`. This guide covers fixture and connected behavior;
the two-hour live shadow/replay exit has not been established. Core mode now
also displays retained chat and decision history. Sources:
[room instructions](../../apps/desktop/src/rooms/moderator/README.md),
[M1 exit](../plan/03-implementation-plan.md#m1--gatehouse).

## Explore the sample room

In the isolated browser preview, sample chat, held-message review, watching
rules, the moat (chat delay) and the gate log use generated fixtures. Watching
means shadow: report what a rule would do. Armed means it may act, but this
preview sends no moderation action to Twitch. Shared Steward/design proposals
remain simulated; a seal changes only their simulated presentation.
Sources: [fixture/core separation](../../apps/desktop/README.md),
[room composition](../../apps/desktop/src/rooms/README.md).

## Use the connected offline core

In a built native launch, the chamber reads actual core rules, chat, decision history and consensus
through validated methods rather than falling back to samples. You can edit
watching pattern rules. Arming, rail changes and live action grants are not
offered. With the explicit native Twitch configuration below, the existing
core starts shadow intake using rules-only classification and no moderation
executor. Without that configuration there is no live intake. Its Gatehouse
store is separate from the native credential/store. Sources:
[connected room](../../apps/desktop/src/rooms/moderator/README.md),
[registration](../../crates/cc-core/src/offline.rs),
[shadow host](../../crates/cc-core/src/integration.rs),
[shadow pipeline](../../crates/cc-core/src/live/mod.rs).

Chat and history show each returned row's `live` or `simulated` provenance.
`unavailable_count` counts entries missing retained text or trustworthy metadata;
legacy or erased rows are not assigned invented verdicts/provenance. Each read
scans at most 100 ledger entries. Use Load more chat / Load more history until
disabled, even when a page has no rows. Counts accumulate over scanned pages.
Refresh Gatehouse restarts both page walks and fetches current consensus;
the page does not claim automatic tailing. Invalid reads display an error and
never substitute fixture chat. Source:
[read semantics](../../packages/contract/GATEHOUSE_READS.md).

The consensus chart describes the available core window; it does not act on
people. Filters request that core window/series. A connected room is not
evidence that live Twitch chat is feeding the chart. Source:
[Gatehouse analysis](../../crates/cc-gatehouse/README.md).

For an offline drill:

1. Open the drill and import a source-labelled recording JSON document with
   `source`, `messages` and `gaps`, or select a recording name already in core.
2. Supply the rule-test bank, judge and prompts as explicit inputs. Recordings
   outside the retention window are refused. Use labelled simulated logs for
   demos and tests; never turn real chat into a repository fixture.
3. Run the drill and retain its instrument hash, source, gaps and named outcome
   states. Save a baseline, edit watching rules, then compare against that
   baseline. Do not merge results with different instrument hashes.

The drill is simulated evaluation and writes no live moderation decisions.
Imported content remains local stored chat, covered by the
[privacy notice](../privacy.md). Sources:
[connected drill workflow](../../apps/desktop/src/rooms/moderator/README.md),
[recorder validation](../../crates/cc-gatehouse/src/recorder.rs),
[replay domain](../../crates/cc-gatehouse/README.md).

## M1 live run

This is an owner runbook, not a completed live exit. Use only the owner's test
channel and owned test accounts, after the Director confirms the live-spike
prerequisite. Prepare Twitch's public client ID, device login and OBS v5 as in
the [login guide](login.md); credentials stay in the OS keychain. Do not use the
spike runner's timeout action for this shadow session.

From the repository root in a normal checkout with dependencies present:

```powershell
pnpm --config.verify-deps-before-run=false --filter @castle-control/desktop build
cargo run -p cc-desktop --features custom-protocol -- --client-id YOURPUBLICCLIENTID --test-channel your_test_channel --login
```

Replace the public ID and test-channel login. Omit `--login` only when reusing
an existing keychain grant. The custom-protocol build is required for core
mode. Browser `dev` preview remains visibly simulated and cannot enable live
intake. This runbook adds no arming or cloud opt-in.

1. Complete device login privately. Confirm the rampart's core/Twitch status,
   then press **2** to open Gatehouse. Keep user rules Watching; fixed rails
   remain enforced. The current host uses rules-only classification: do not
   describe it as a model evaluation.
2. Start a test stream and record sanitized start/end UTC times. Keep it running
   for **two hours**. Send owned-test-account chat, including benign messages
   that pass the gate. Click **Refresh Gatehouse** during the run to fetch chat,
   history and consensus. Use **Load more chat** and **Load more history** to
   traverse bounded pages. Check provenance, unavailable counts and the chart's
   window, directions and shedding count. Never relabel simulated rows.
3. Retain private evidence locally: the native app-data root is
   `io.castlecontrol.desktop` (resolved by Tauri). Its `gatehouse/` store holds
   the append-only `decisions` ledger and retained recordings/cache. The
   `gatehouse.history.list` read is the visible decision-history view, with
   recorded-at times and provenance; it is not a second ledger. The
   `gatehouse.chat.list` read joins retained originals. Do not copy these stores
   or real chat into repository fixtures or public submission evidence.
4. Keep sanitized screenshots of Gatehouse history and the consensus chart
   (`gatehouse.consensus.get`), with the interval and scanned-page counts.
   Preserve gaps as gaps; a screenshot/count alone cannot prove every decision
   was captured. Record the private store location and sanitized outcomes in
   the Director's M1 evidence record.
5. Separately run the generated disclosure bank and retain its **reported n**
   and routed-to-human/non-punitive result in that evidence record:

   ```powershell
   cargo test --locked -p cc-gatehouse --test safety simulated_disclosure_bank_n96_reaches_streamer_without_punishment -- --nocapture
   ```

   The current bank asserts n=96 and prints its result. This is generated,
   simulated safety-test evidence, not proof of live model behavior; retain
   actual output rather than filling a result in advance.
6. Open **The drill**. Existing recording import, **Run simulated replay**,
   **Save comparison baseline** and **Compare rules** remain available for
   replay-only evaluation. The panel says **live parity: pending capture
   evidence**. Capture-time `instrument_hash` and a retained live recording
   reference are not exposed by today's reads. Live parity (a drill against
   that exact capture-time instrument) is pending the separate
   `gatehouse.liveRun.get` delivery and its subsequent wiring. Do not hash
   today's rules as a substitute, relabel a replay as live, or claim a
   match/mismatch. Preserve the private capture for that later check.

The two-hour run, complete decision accounting, capture-time replay parity and
written owner sign-off remain **pending-owner**. No rule may act on real viewers
before the M1 exit and that written approval.

## Pending live work

The current read contract has no pending-ban queue lookup, so the
connected UI explains that unavailability rather than acting on an unseen
message. Domain safety logic exists: crisis disclosures go to a human, the
deterministic last-door gate controls actions, and bans need human approval by
default. These safeguards are not a claim of live moderation acceptance.
Sources: [connected UI limits](../../apps/desktop/src/rooms/moderator/README.md),
[safety domain](../../crates/cc-gatehouse/README.md).

Owner verification of shadow intake, the two-hour shadow recording and replay parity, and
written owner sign-off before arming against real viewers remain pending.
The owner-attended spike targets owned test accounts only. Local classification
is the default policy; cloud classification requires explicit opt-in and sends
chat to OpenAI when wired. See [privacy](../privacy.md#optional-cloud-classification)
and [live evidence status](../submission/checklist.md#floor-build-and-live-evidence).
