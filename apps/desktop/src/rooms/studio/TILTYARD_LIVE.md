# WP10: core-mode Tiltyard

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
