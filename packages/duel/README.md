# Duel

The pure TypeScript duel engine for The Tiltyard, with zero DOM access.

Dependency boundary: `contract ← duel ← ui/duel ← desktop`.

Generated SAMPLE contestants and SIMULATED chat data live only in this package.
The public `.` entry exports the list door, SAMPLE contestants, deterministic
randomness, bracket, binary-insertion ladder, arms data, and session families.
The separate `./ballots` entry belongs to the ballot/tally engine.

`parseDuelList(object)` is the only contestant-id minting door. It rejects
unknown keys, malformed/duplicate slugs and lists outside 2–64 items. It trims
required text, preserves notes and returns a frozen copy. `slugId` implements
the winner's title-to-slug rule; it does not mint an id.

`SAMPLE.bracket` and `SAMPLE.chat` are parsed lists with `provenance: 'sample'`.
Chat also has `window_ms` and `key: 'mill'`. `SAMPLE.ladder.top` and `.queue` are parsed lists,
each with the same explicit provenance; use their `.items` arrays. All original
titles, notes and `simulated_viewer_*` attribution strings are preserved.

Session factories are `createShowSession(list, {theatre_ms?})`,
`createChatSession(list, {window_ms, key?})`, and
`createLadderSession(orderIds, queueIds, {theatre_ms?})`. Theatre is 1050 ms, or
650 ms for reduced motion. Feed elapsed time as `tick {ms}`; the engine has no
clock or timers. Every chat event supplies the caller's `counted` pair. Chat's
stable `match_key` is `<key>:<round>:<index>`; round and index are zero-based.
The key prefix uses the same slug validation as list ids and defaults to
`slugId(list.title)`. SAMPLE uses `mill` to preserve the winner's simulated windows.

`SHOW_TRANSITIONS`, `CHAT_TRANSITIONS` and `LADDER_TRANSITIONS` are readonly
plain objects whose values name handlers. Each `step*` looks up exactly one
handler in its table. Absent pairs return the identical object. Handlers resolve
data-dependent destinations (theatre expiry, champion, placement, exhausted
queue, or an empty undo history). They do not dispatch on phases elsewhere.

Decisive events record the result and history immediately. Theatre ticks and
skips retain the bracket/order and the closed counted snapshot. Chat pauses
retain elapsed time; undo opens a fresh window. Calls retain their actual tally
in a separate log, including after undo. Cancelling theatre settles it first;
a completed result remains recorded. Enter after a cancelled final starts a
new bracket, as in the winner. A cancelled live ladder climb is abandoned
without advancing its queue.

Climb places are zero-based. `stillPossible(climb, n)` is the sole range source:
inclusive one-based `from`/`to`, with `below` true when the range includes the
slot below the hill, or null after completion. A challenger below the cap has
`made_it: false` and `fell: null`. Arms expose ink names, paths and a boolean
`backing`; the renderer owns colours and clip ids.

Tests enumerate all 128 eight-seed outcomes, all 11 binary climb paths over ten
rungs and all 91 phase/event pairs. They also cover smaller brackets, list
validation, source-matched arms/randomness, timing, cancellation, undo, reset,
chat calls/ties and ladder queue exhaustion.
