# Floor demo: protected chat, verifiable draws

Drafted offline on 2026-10-26 against local main `0181ffd`.
Target: Friday 2026-10-30 M0–M2 floor recording. Planned running time:
**176 seconds (2:56)**, including titles, transitions and closing card.
The final public YouTube video must remain at most 180 seconds.

This is a recording plan, not evidence that the pictured live behavior works.
All LIVE shots are **pending the 2026-10-27 owner-attended WP 0.7 spike**;
shots 6–10 additionally require completed M1/M2 integration and their exits.
The spike alone cannot unlock those shots. `docs/spike-log.md` still records
every live item as pending. Its shadow verdict is explicitly a stub, and its
OBS source is static; neither proves M1 moderation or M2 animation delivery.

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
| 3 / 0:22–0:36 | 14 s | Gatehouse / M0 connection | After device login, owner test-channel chat marker alongside the app's connected status. Caption the exact test-channel context; unknown stream/viewer values stay unknown. | “On the owner's test channel, this owned test account sends a message through the Twitch connection.” | **LIVE — pending 10-27 spike.** Need login and message-arrival evidence; do not stage it in Vite fixtures. |
| 4 / 0:36–0:52 | 16 s | Gatehouse / M0 spike | Sanitized spike shadow-stub evidence, then the owned non-moderator account's timeout and immediate undo. Label “M0 connection test; shadow verdict stub.” | “The connection test logs a shadow stub, then times out only our owned test account and immediately undoes it.” | **LIVE — pending 10-27 spike.** Owner verifies both action and undo; this is not the M1 classifier demonstration. |
| 5 / 0:52–1:02 | 10 s | Whole keep / M0 OBS | OBS visibly displaying the static browser source created by the spike; then sanitized socket-recovery/gap status. | “The spike creates this OBS source. A forced disconnect is recorded as a gap when the connection recovers.” | **LIVE — pending 10-27 spike.** Need visual OBS confirmation and reconnect/gap evidence; no draw-animation claim. |
| 6 / 1:02–1:16 | 14 s | Gatehouse / M1 live | Completed test stream's live watching decisions and consensus; a caption gives the recorded two-hour shadow-run interval without exposing chat history. | “In this completed two-hour shadow test, the Gatehouse records decisions while the consensus chart describes the messages that passed.” | **LIVE — pending 10-27 spike and M1 exit.** Needs integrated gate, recorder and chart, not the stub or fixture chart. |
| 7 / 1:16–1:32 | 16 s | Gatehouse / M1 drill | Replay of that same owned-test-channel recording, instrument hash and matching decision comparison. Label the replay “simulated replay”; no live side effects. | “The drill replays the recording through the same instrument. Compare its decisions with the shadow run, without sending live actions.” | **LIVE-dependent — pending 10-27 spike and M1 exit.** Recorded source is from the owned test channel; replay itself is simulated. |
| 8 / 1:32–1:50 | 18 s | Lot Chamber / M2 roll | A no-prize question draw from passed test-account messages; seal the real eligible roll and show its announced hash and selected future drand round. | “For this question draw, only passed messages enter the pool. We freeze the entries and announce the seal before the public randomness round.” | **LIVE — pending 10-27 spike and M2 integration.** Needs real post-verdict intake and publication before the round. |
| 9 / 1:50–2:12 | 22 s | Lot Chamber / M2 cast | Matching signed round arrives; the OBS draw animation displays the already-derived result. Show the same run ID/seal and reveal winners from owned accounts only. Edit waiting time with an explicit cut. | “After the signed round arrives, code derives the winners. The animation presents that result; it does not choose the winner.” | **LIVE — pending 10-27 spike and M2 integration.** Requires live beacon verification, cast and OBS delivery; offline scenes at `e37bfeb` alone do not prove this. |
| 10 / 2:12–2:30 | 18 s | Lot Chamber / M2 writ | Export this exact draw's writ; independently open it in the single-file web verifier and CLI verifier. Match seal and winners to shots 8–9. | “This is the same draw's proof bundle. Both independent verifiers reproduce its winners, using the trusted public-beacon anchor.” | **LIVE-dependent — pending 10-27 spike and M2 exit.** Both verifiers exist offline (`71d125f`, `9c34d41`); the live draw's writ is still missing. |
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

Owner asks: attend the spike, approve capture of the owned-account test session,
record the floor/final footage and upload the final public YouTube video.
Director/build asks: complete M1/M2 wiring and exits, record the D10 proof,
verify the Codex thread map and attach evidence in [the checklist](checklist.md).
If a required shot fails, keep the package pending instead of narrating success.
