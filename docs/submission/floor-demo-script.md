# Floor demo: protected chat, verifiable draws

Checked offline on 2026-10-29 against local main `97d8dd4`.
Target: Friday 2026-10-30 M0–M2 floor recording. Planned running time:
**176 seconds (2:56)**, including titles, transitions and closing card.
The final public YouTube video must remain at most 180 seconds.

This is a recording plan, not evidence that the pictured live behavior works.
The [spike record](../spike-log.md) acceptance table records all six WP 0.7
checks PASS on 2026-10-27 (run 10, 16:44:45–16:45:01 UTC), including the OBS
screenshot reference and socket recovery. Its pending header is stale for
those rows. O1–O8 have recorded passes; Twitch twins T1–T10 and local-floor
checks F0–F9 remain pending. These records do not supply finished demo footage.
Shots 3–5 need owner-approved evidence/capture; shots 6–10 remain
**LIVE-dependent**, requiring the M1/M2 runs and exits in the checklist.
M1/M2 wiring is built, but the spike's shadow verdict is a stub and its OBS
source is static; neither proves M1 moderation or M2 draw delivery.

## Capture rules

- Use only the owner's test channel and two owned test accounts. Keep real
  viewers and their messages out of every capture; stop if an uncontrolled
  participant enters. Use generated, labelled simulated data for fixtures.
- The spike's timeout/undo targets only the explicit owned non-moderator test
  account. No rule is armed against a real viewer. The M1 two-hour shadow
  stream, replay match, disclosure-bank evidence and written owner sign-off
  remain required before real-viewer arming.
- Record no login dialogs, device codes, credentials, native session data,
  private account details or keychain screens. Capture a sanitized success
  status after authentication. Use only non-sensitive test messages.
- Keep `SIMULATED SOURCE` and simulated labels visible in fixture footage.
  Never replace a missing LIVE shot with fixture footage under live narration.
  A LIVE narration line below is conditional on recording the stated evidence.
- Fixture captures can use the existing browser preview command in
  [the README draft](readme-draft.md). The fixture proof preview is a separate
  fixed vector; it is not the result of its editable entry-pool preview.

## Shot list

Time ranges are cumulative edit boundaries. Durations include all transitions.

| # / time | Duration | Chamber | What is on screen | Narration line | Capture readiness |
| --- | --- | --- | --- | --- | --- |
| 1 / 0:00–0:08 | 8 s | Whole keep / M0 shell | Title, then four chamber links in the desktop browser preview; simulated banner remains visible. Caption: “M0–M2 floor demo.” | “Castle Control is a free, open-source Twitch toolkit. This cut focuses on protected chat and verifiable draws.” | **Fixture-capturable now.** Existing shell at `e9fbb4c`; no live claim. |
| 2 / 0:08–0:22 | 14 s | Gatehouse / M1 preview | Watching rules, generated Pass/Hold/Bar messages, and the human ban-review queue. Do not show simulated armed counts as a live result. | “Here is the simulated Gatehouse preview: watching rules report decisions, and bans default to human review.” | **Fixture-capturable now.** UI at `5073b63`, confirmation behavior at `eba4fef`. |
| 3 / 0:22–0:36 | 14 s | Gatehouse / M0 connection | After device login, owner test-channel chat marker alongside the app's connected status. Caption the exact test-channel context; unknown stream/viewer values stay unknown. | “On the owner's test channel, this owned test account sends a message through the Twitch connection.” | **LIVE-dependent — WP login/chat PASS recorded 10-27.** Owner approves sanitized evidence or captures a fresh run; do not stage it in Vite fixtures. |
| 4 / 0:36–0:52 | 16 s | Gatehouse / M0 spike | Sanitized spike shadow-stub evidence, then the owned non-moderator account's timeout and immediate undo. Label “M0 connection test; shadow verdict stub.” | “The connection test logs a shadow stub, then times out only our owned test account and immediately undoes it.” | **LIVE-dependent — WP shadow stub and timeout/undo PASS recorded 10-27.** Owner approves evidence/capture of both action and undo; this is not the M1 classifier demonstration. |
| 5 / 0:52–1:02 | 10 s | Whole keep / M0 OBS | OBS visibly displaying the static browser source created by the spike; then sanitized socket-recovery/gap status. | “The spike creates this OBS source. A forced disconnect is recorded as a gap when the connection recovers.” | **LIVE-dependent — WP OBS screenshot reference and reconnect/gap PASS recorded 10-27.** Owner approves material or captures it anew; no draw-animation or OBS-timing claim. |
| 6 / 1:02–1:16 | 14 s | Gatehouse / M1 live | Completed test stream's live watching decisions and consensus; a caption gives the recorded two-hour shadow-run interval without exposing chat history. | “In this completed two-hour shadow test, the Gatehouse records decisions while the consensus chart describes the messages that passed.” | **LIVE-dependent — pending M1 run/exit.** Page/read wiring is built at `c14ff93`; follow the [M1 runbook](../guide/gatehouse.md#m1-live-run). Current native intake uses rules-only classification; no live model claim. |
| 7 / 1:16–1:32 | 16 s | Gatehouse / M1 drill | Replay of that same owned-test-channel recording, instrument hash and matching decision comparison. Label the replay “simulated replay”; no live side effects. | “The drill replays the recording through the same instrument. Compare its decisions with the shadow run, without sending live actions.” | **LIVE-dependent — pending M1 capture/parity evidence.** Stored instruments/read built at `617e094`, capture drill wired at `c789279`. Replay stays simulated; code/tests do not establish two-hour live parity. |
| 8 / 1:32–1:50 | 18 s | Lot Chamber / M2 roll | A no-prize question draw from passed test-account messages; seal the real eligible roll and show its announced hash and selected future drand round. | “For this question draw, only passed messages enter the pool. We freeze the entries and announce the seal before the public randomness round.” | **LIVE-dependent — wiring built at `0ea0d04`; pending owner M2 run/exit.** Capture real post-verdict intake and publication before the round using the [M2 runbook](../guide/lots.md#m2-live-run). |
| 9 / 1:50–2:12 | 22 s | Lot Chamber / M2 cast | Matching signed round arrives; the once-per-second server-rendered OBS Lots result plate shows the already-derived winners. Show the same run ID/seal and winners from owned accounts only. Edit waiting time with an explicit cut. | “After the signed round arrives, code derives the winners. The OBS plate presents that result; it does not choose the winner.” | **LIVE-dependent — built at `0ea0d04`; pending owner [M2 live run](../guide/lots.md#m2-live-run) after Director clearance.** Capture verified round, cast and matching OBS winners. The source port changes on restart: the owner re-adds the OBS source after a restart. A pending seal does not resume across a restart. |
| 10 / 2:12–2:30 | 18 s | Lot Chamber / M2 writ | Export this exact draw's writ; independently open it in the single-file web verifier and CLI verifier. Match seal and winners to shots 8–9. | “This is the same draw's proof bundle. Both independent verifiers reproduce its winners, using the trusted public-beacon anchor.” | **LIVE-dependent — pending M2 exit evidence.** Both verifiers exist offline (`71d125f`, `9c34d41`), with live writ export wired at `0ea0d04`; retain the actual test draw's writ and both outputs. |
| 11 / 2:30–2:46 | 16 s | Whole keep / construction evidence | Sanitized main git history, a work-package brief and accepted diff. Show a verified thread map only after the Director fills its TODO; otherwise show no IDs. | “Codex builders implement one work package per isolated thread and worktree. The Director reviews the diff and gates before merging.” | **Fixture/offline-capturable now.** Workflow in the plan and committed package history; final thread-map evidence pending Director verification. |
| 12 / 2:46–2:56 | 10 s | Whole keep / closing | Source and verifier paths, Apache-2.0/NOTICE, four chamber names. Caption Beacons and Map Room “beyond this floor demonstration.” | “The source and verifier are open. Beacons and the Map Room extend the toolkit; this floor demonstrates the Gatehouse and Lot Chamber.” | **Fixture/offline-capturable now.** Use the closing floor claim only once the LIVE evidence above exists. |

**Timing check:** 8 + 14 + 14 + 16 + 10 + 14 + 16 + 18 + 22 + 18 + 16 + 10
= **176 seconds**. Four seconds remain under the cap; do not add an untimed intro.

## Handoff to the final submission edit

The Friday floor recording is a reserve asset, not the finished submission.
The plan's D10 note separately requires the Steward and classifier OpenAI lane
to run end to end on Codex CLI and OpenAI API on Sunday 11-01, switching the
provider in settings only, before the final video. Do not imply that offline
engine tests prove this. Reserve the final edit until that evidence is recorded;
replace/re-time shots within the same 180-second cap if showing it.

Owner asks: approve/use sanitized spike evidence or capture a fresh owned-account
test session, complete the M1/M2 runs, record the floor/final footage and upload
the final public YouTube video.
Director asks: reconcile spike clearance, verify M1/M2 exits, record the D10 proof,
verify the Codex thread map and attach evidence in [the checklist](checklist.md).
If a required shot fails, keep the package pending instead of narrating success.
