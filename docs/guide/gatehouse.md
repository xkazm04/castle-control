# Gatehouse: moderation and replay

Draft for owner review, current at `c3dea03` (2026-10-28).
Open `#/chamber/moderator` or press 2. The drill is a nested page at
`#/chamber/moderator/drill`. This guide describes offline/fixture behavior;
the two-hour live shadow/replay exit has not been established. Sources:
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

In a built native launch, the chamber reads actual core rules and consensus
through validated methods rather than falling back to samples. You can edit
watching pattern rules. Arming, rail changes and live action grants are not
offered. Native registration refuses armed user rules and starts no live
classifier, chat adapter or action executor. Its state is isolated from the
native Twitch credential/store. Sources:
[connected room](../../apps/desktop/src/rooms/moderator/README.md),
[offline registration](../../crates/cc-core/src/offline.rs).

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

## Pending live work

The current read contract has no pending-ban or live-chat-list lookup, so the
connected UI explains that unavailability rather than acting on an unseen
message. Domain safety logic exists: crisis disclosures go to a human, the
deterministic last-door gate controls actions, and bans need human approval by
default. These safeguards are not a claim of live moderation acceptance.
Sources: [connected UI limits](../../apps/desktop/src/rooms/moderator/README.md),
[safety domain](../../crates/cc-gatehouse/README.md).

Live intake/execution, the two-hour shadow recording and replay parity, and
written owner sign-off before arming against real viewers remain pending.
The owner-attended spike targets owned test accounts only. Local classification
is the default policy; cloud classification requires explicit opt-in and sends
chat to OpenAI when wired. See [privacy](../privacy.md#optional-cloud-classification)
and [live evidence status](../submission/checklist.md#floor-build-and-live-evidence).
