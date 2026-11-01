# D5c: desktop on the core tournament

CORE mode opens Chat on `maproom.stage.get`. `tiltyard-core.ts` invokes the
existing generated `maproomStageGet`, `maproomTurnRun` and `tiltyardSourceUrl`
contracts, reusing the shell's validated event subscription and connection
status. No room socket, Gatehouse chat read or ballot feed remains in this path.
`maproom.turn` and `resync` drain a stage refetch; a transition back to a ready
shell connection also refetches. While live, `gatehouse.verdict` also invalidates
the stage and a one-second polling fallback reads authoritative counts. It
does not consume chat or tally ballots. Polling stops during reads/mutations,
outside the live phase, on disconnect and on unmount. Reads and mutations do
not overlap. In-flight invalidations drain afterward, and replies from a disconnected or closed view
cannot replace the picture. Mutations are never replayed on reconnect.

The shared stage's optional `chat_control` renders the supplied core picture
and forwards human events. It bypasses the TS Chat reducer, ballot sources and
clock; mode switches preserve core Chat. Showdown and Ladder retain their TS
engines and visibly say **Local demo · not sent to the core or OBS**. FIXTURE
mode keeps its existing TS sessions, simulated ballot source and journeys.

`CoreChat` renders the returned pair (the recorded pair during verdict), counts,
phase, bracket, string seed ranks, explicit winning side/reason and champion.
It derives only display labels, percentages and seconds from the snapshot.
It does not infer a winner, index ballots, fabricate a chat ticker or barred
counts, or advance a timer. Start submits the existing SAMPLE Chat list with
its seed order encoded as decimal strings, key `mill` and 15000 ms window.
Enter, calls, pause/resume, undo, reset and speed use the single core write door.
The fixture host and core host load through separate lazy imports, keeping the
core adapter and tournament validators out of the fixture-only chunk.

Controls freeze during requests/disconnection; keyboard requests that cannot
be sent get a visible explanation. Valid core error messages appear as escaped
text. Unknown network outcomes tell the operator to refresh before trying
again. **Duel on stream · Copy browser source URL** resolves the core's URL
and reports copy failures. `#/stream` has a core-only **Duel** row using the
same URL contract, selected source dimensions and existing human hold to add.

Acceptance coverage (Vitest executed in review round 4; corrected night spec awaits the Director):

| Criterion | Tests |
| --- | --- |
| Exact actions/start fields, no optimistic state | `tiltyard-core.test.tsx` |
| Invalidation draining, reconnect, errors, stale replies and source copy | `tiltyard-core.test.tsx` |
| Live post-moderation refetch/polling without turn events; polling cleanup and serialization | `tiltyard-core.test.tsx` |
| Core picture, seeds, escaped labels, call against tally, controls; fixture engine retained | UI `core-chat.test.tsx`; desktop `tiltyard-view.test.tsx` |
| Core-only Duel row resolves/copies/adds at selected size | `stream/setup-model.test.ts` |
| Desktop start, two generated ballot bursts, right-side call, next pair and same OBS match/counts/verdict | `e2e/night/tiltyard.spec.ts` (corrected; rerun pending) |
| Exact night ballot producer, 3000 ms call / 4000 ms tally theatre, late pick, advance, saved state and OBS reads | Rust `tiltyard/tests/night.rs` (authored; unrun) |

The Director owns the desktop build (including the unchanged duel chunk
budget), `pnpm gate` and the night lane. The initial builder cut ran no test
runner; review round 3 explicitly authorized the Node Vitest API runs below.
This builder still ran no cargo, pnpm or browser. The Director reports the
round-three gate, native build/window and fixture lane green (one independently
repeated Beacons flake); its night lane exposed the producer defect below.
The corrected night run and Rust regression remain Director-run. There are no
contract, lockfile, service or production Rust engine changes.

D5c review correction: closed the missing outer params object in
`sampleTournament()` and expanded its nesting for review. Re-read every D5c
file line by line, including styles/docs and the deleted feed's original
contents; no additional syntax slips found. Offline TypeScript 6.0.3
`createSourceFile` parsing plus `transpileModule` with `reportDiagnostics`
passed for all 21 changed/new TS/TSX files with zero errors. PostCSS parsed both
changed CSS files without errors, and `git diff --check` passed. No JS/MJS
files changed. These are syntax checks only; full typecheck, build and e2e
reruns remain with the Director.

D5c lint correction: removed the unused clipboard-mock parameters in studio
`tiltyard-core.test.tsx` and stream `setup-model.test.ts`; assertions are
unchanged. Direct `node node_modules/eslint/bin/eslint.js <files>
--max-warnings 0` passed on all 21 changed/new D5c TS/TSX files (desktop, UI
and night spec), with no errors or warnings. That round ran no tests or builds.

D5c round 3 deliberately discloses **SAMPLE starter contestants · Gatehouse
ballots counted by the core · Shared with OBS.** The sample wording describes
the starter list; the ballot wording identifies moderation provenance and core
counting without claiming live-only chat. The session's SIMULATED ballot label
remains separate. The shell assertion now checks this exact disclosure and
the Tiltyard connection; the room test also checks it. No provenance assertion
was removed.

Full, unfiltered suites via Vitest 5.0.5's Node `createVitest`/`start` API,
threads pool, two workers, default isolation and unchanged timeouts:

| Suite | Files passed | Tests passed |
| --- | ---: | ---: |
| `apps/desktop` | 109 | 1066 |
| `packages/ui` | 38 | 492 |
| `packages/duel` | 14 | 382 |

All three runs exited successfully with zero failures, skips, pending tests or
unhandled errors. Direct Node ESLint also passed all 22 changed/new TS/TSX
files with `--max-warnings 0`; `git diff --check` passed. Builds and browser
lanes were not run.

Changed files, grouped by purpose:

- Desktop connection/host: `src/client.ts`, studio `room.tsx`, `room.css`,
  `tiltyard-view.tsx`, new `tiltyard-core-view.tsx`, new `tiltyard-core.ts`, new
  `tiltyard-source.tsx`; removed `tiltyard-feed.ts`.
- Shared duel UI: `core-chat.tsx` (new), `stage.tsx`, `types.ts`, `session.ts`,
  `card.tsx`, `shield.tsx`, `chat.css`, `index.ts`.
- OBS setup: `stream/obs-core.ts`, `setup-model.ts`, `setup.tsx`.
- Tests: shell `studio.test.tsx`, studio `tiltyard-core.test.tsx`, `tiltyard-view.test.tsx`, stream
  `setup-model.test.ts`, UI `core-chat.test.tsx` (new), night `tiltyard.spec.ts`
  (new), Rust `tiltyard/tests.rs` and new `tiltyard/tests/night.rs`.
- Night driver/diagnostics: `examples/e2e-night/main.rs`, new `ballots.rs`,
  night `launch.ts`, new `core-log.ts` and new `core-log.test.ts`.
- Docs: desktop README, studio README and this file, UI duel README, night README.

D5c round 4 root cause: the night executable emitted `SIMULATED duel ballot
left|right`. The authoritative parser accepts a leading `1` or `2` (with optional
cheer prefix); all nine generated messages were therefore chatter. `run.log`
fails at the first count assertion, before the streamer click. The 15-second
window then closes at 0–0. The test's `finally` closes the core before Playwright
takes automatic failure screenshots, so the disconnected desktop/empty OBS
screenshots do not establish a core crash. No stderr was retained in that run.
The producer now emits `1 SIMULATED duel ballot left` / `2 SIMULATED duel ballot
right`; the Rust regression imports that exact producer instead of duplicating
its spelling. Rehearsal's existing `1 SIMULATED` / `2! SIMULATED` is already valid.

Trace review: tick caps elapsed at the window and freezes the closed pair/counts;
call theatre lasts 3000 ms, tally/tie theatre 4000 ms, and remaining time saturates.
A pick during verdict skips theatre and cannot rewrite the already-recorded
winner. Settle clears elapsed and opens the next match. Persistence saves before
publishing `maproom.turn`. The state-to-Gatehouse lock order has no reverse
dependency; ledger reads and persistence are synchronous, and SSE releases the
state lock before sleeping/yielding a replacement. A clock error ends only that
worker. No panic/deadlock/process-exit defect was found in this sequence.

`launch.ts` now appends raw stderr and timestamped start/exit metadata (PID,
code, signal, whether teardown had been requested) to `NIGHT_OUT/core-stderr.log`,
falling back to `e2e/night-results/core-stderr.log`. Exit status is captured at
`exit`, before a subsequent `finally` can mislabel it; the logger flushes/closes
at stdio `close`. stdout and the handoff capability never enter the logger.
Diagnostic failures surface at cleanup. The night test also captures both
pictures before closing the core on failure.

Round-four Node Vitest API: desktop **1068/1068** in 109 files; UI **492/492** in
38; duel **382/382** in 14. No failures, skips or unhandled errors. The native
Node logger tests pass **2/2** with `node --test --test-isolation=none
e2e/night/core-log.test.ts`; default test isolation cannot spawn in this sandbox.
Rust execution and the browser rerun remain pending under the builder's original
no-cargo/no-browser constraint.
The TypeScript compiler API reports zero diagnostics for e2e (47 files), desktop
(291), UI (118) and duel (34), using each package's unchanged strict config.
Node ESLint passes all 25 touched TS/TSX files with no warnings; standalone
rustfmt checks all four touched Rust files. Boundaries, hygiene, type floor,
file cap, secrets and `git diff --check` pass.

The WP10 notes below are historical and describe the superseded core ballot
feed. Their recorded test results do not verify D5c.

# Historical WP10: core-mode Tiltyard

Owner ruling 2 is implemented with the existing `gatehouse.verdict` event and
`gatehouse.chat.list` read. There are no contract or Rust changes.

The desktop read model forwards already-parsed StreamEvent kinds to subscribers.
The Gatehouse connection exposes that subscription alongside its existing
in-memory launch/transport/port. `parseEvent` remains the sole event door and
the app retains its one `/events` socket, including its existing reconnect path.

`CoreGatehousePort.readChat` uses the existing validated Gatehouse call path with
limit 100 and an omitted-or-server-minted cursor. `coreBallotFeed` connects that
read to the pure duel feed and subscribes it only for an open UI chat window.
Closing removes the event listener and timer; late replies cannot deliver chat
or change the availability notice. Errors show a fixed, sanitized retry notice.

Core-mode Map Room now lazily shows the Tiltyard alone, with SAMPLE contestants
and the shared seal slot. It retains EmptyState when no core connection exists.
Fixture mode retains all four views and the existing simulated ballot source.
Ticker and tally provenance come from each window's validated chat data.

Validation (2026-10-31, no install, real core, Twitch, browser or Computer Use):

- Duel: 381 tests in 13 files; typecheck/lint inventories 33 source files.
- UI: 405 tests in 28 files; typecheck/lint inventories 106 source files.
- Desktop: 958 tests in 97 files; typecheck/lint inventories 263 source files.
- All nine package checks exit 0. `node scripts/check.mjs` exits 0:
  boundaries/hygiene/file-cap each walk 1000 files; secrets walks 1461 files.
- Production build exits 0 and reports both budgets:
  `[desktop first-load budget, all four routes] walked 7 files; 371099/393216`
  uncompressed JS+CSS bytes; `[duel chunk budget] walked 2 files; 88056/98304`
  uncompressed JS+CSS bytes (js 60230, css 27826).
- Four new fake-transport cases cover core-mode rendering, the existing
  contract door, cursor tailing, malformed replies/retry and late replies.
  Instrumented output: initial + verdict = 2 chat reads; chat.message = 0
  additional reads; 1 socket for the app and all event subscribers.
- The first desktop suite run, concurrent with other package checks, timed out
  in the existing 900-cast corpus test. The unchanged suite passed when rerun
  alone. No timeout or test configuration was changed.

Commands use `pnpm --config.verify-deps-before-run=false --filter
@castle-control/{duel,ui,desktop}` with each of `typecheck`, `lint` and `test`.
Feed counts can be reproduced with the duel package's `exec vitest run
src/ballot-feed.test.ts --pool=threads --reporter=verbose --silent=false`.
Root hygiene is checked with `node scripts/check.mjs`; production budgets with
the desktop package's `build` command. Browser fidelity/e2e and a real-core
session remain for the Director; no such verification is claimed here.
