# Tiltyard (WP4–WP5)

`@castle-control/ui/duel` exports `Tiltyard`, its data/words props, the English
`tiltyardWords`, the declared keymap, and the session clock helpers. Lists have
already crossed the engine's `parseDuelList` door. This component does not parse
JSON itself, connect to a service, persist state or perform live actions. Chat
pages cross the engine's `parseBallotPage` door before classification/indexing.

The stage exposes the active list's provenance through `data-provenance` and
does not show a provenance chip in its key legend. The host must show a visible
provenance label; WP7's Map Room host shows `Sample items · simulated chat` in
the view row.

Showdown starts immediately, records each pick through `stepShow`, and renders
the result before advancing. Escape calls off a live duel; when no duel is live
it bubbles to the shell. `on_close` is reserved for host navigation and is never
called by a live-duel Escape. Enter and Escape intentionally shadow the shell's
`open` and `back` bindings when handled.

The reducer keeps one session per mode and settles outgoing theatre on a mode
change. Chat uses the supplied `key` (SAMPLE uses `mill`). Ladder has a lineup
placeholder until WP6. `StageAction` accepts a counted pair for chat. Shared
`Arena`, `Card`, `Centre`, `Seal`, `Rail`, `Champion` and board components are
available as local modules. `Rail` takes an optional right-hand slot for chat,
so both modes use the same bracket drawing. The clock schedules one timeout at
`nextDue(session, window)`: the next visible second, indexed arrival, window
end or verdict end. Motion uses a live media
subscription and changes both the stage attribute and session theatre durations.

Chat requires a `ballots(match_key, window_ms, opened_at)` prop. Without it the
stage shows a plain disconnected board and runs no chat clock. `opened_at` is
the fixed simulated epoch `2026-01-01T00:00:00.000Z` plus the zero-based match
number in milliseconds. Each source's window is parsed, classified and indexed
once per match key, retained across pause, undo and New vote. The component
never generates a fallback source.

The ring runs in CSS at `window_ms / speed` with a negative elapsed delay.
Reduced motion uses a static indexed offset. Tug and ticker are memoised on
the indexed prefix/seen count and visible second; only the newest five events
are rendered. Enter closes, arrows log streamer calls, Escape pauses, Enter
resumes, and verdicts last four seconds (tally/tie) or three (call). Calls keep
the actual tally. Inputs include the monotonic time since the last wakeup, and
a key at a theatre deadline cannot accidentally decide the next match with an
old window's counts. Close/new-window/champion announcements use the winner's
copy. Ticker provenance is explicitly SIMULATED; the host still labels SAMPLE
contestants visibly.

## WP4 validation

Commands run from the worktree root, without installing dependencies:

- `pnpm --config.verify-deps-before-run=false --filter @castle-control/ui typecheck`
  exited 0; `[pnpm typecheck] walked 95 files`.
- `pnpm --config.verify-deps-before-run=false --filter @castle-control/ui lint`
  exited 0; `[pnpm lint] walked 95 files`.
- `pnpm --config.verify-deps-before-run=false --filter @castle-control/ui test`
  exited 0; `Test Files 24 passed (24)`, `Tests 372 passed (372)`.
- `pnpm --config.verify-deps-before-run=false --filter @castle-control/ui exec vitest run src/duel --pool=threads --reporter=verbose --silent=false`
  exposes the style and keymap gate counts and their seeded red proofs.
- `node scripts/check.mjs` checks boundaries, hygiene, the 400-line cap and secrets.

Browser verification is incomplete: the browser access host was unavailable,
and native Chrome access returned `Computer Use was not approved to use Google
Chrome`. No screenshots, driven browser journey or computed-style contract is
claimed. The install and full root gate were not run: this brief prohibits
installing dependencies and network calls. No launcher returned `spawn EPERM`.

## For T1: local CSS custom properties

74 defaults are declared on `.ty-stage` in `tokens.css`. Shared tokens are
used for matching inks, type, rules and spacing. Fixed parchment/arms inks are
local because those pigments must remain unchanged under the stock theme.

### Night stage, signals and fixed parchment

| Property | Winner value/default |
| --- | --- |
| `--ty-night-glow` | `#22252e` |
| `--ty-night` | `#121317` |
| `--ty-stage-rule` | `#000` |
| `--ty-pennant-idle` | `#2a2d36` |
| `--ty-stage-text-dim` | `#C9C5B8` |
| `--ty-parchment-ink` | `#16181D` |
| `--ty-parchment-top` | `#FBF9F3` |
| `--ty-parchment-bottom` | `#EFE9DA` |
| `--ty-parchment-text-dim` | `#3A3D45` |
| `--ty-parchment-muted` | `#656972` |
| `--ty-stage-muted` | `#8E919A` |
| `--ty-seal-shadow` | `#7a1e10` |
| `--ty-barrier-shadow` | `rgba(0,0,0,.4)` |
| `--ty-beam-top` | `rgba(255,244,214,.55)` |
| `--ty-beam-bottom` | `rgba(255,244,214,.08)` |
| `--ty-card-shadow` | `rgba(0,0,0,.55)` |
| `--ty-arms-shadow` | `rgba(22,24,29,.18)` |
| `--ty-stamp-paper` | `rgba(251,249,243,.85)` |
| `--ty-winner-shadow` | `rgba(0,0,0,.6)` |
| `--ty-rail-shadow` | `rgba(0,0,0,.5)` |
| `--ty-match-rule` | `rgba(242,238,227,.22)` |
| `--ty-match-well` | `rgba(18,19,23,.7)` |
| `--ty-current-ring` | `rgba(242,178,51,.35)` |
| `--ty-match-divider` | `rgba(242,238,227,.12)` |
| `--ty-champion-rule` | `rgba(242,178,51,.5)` |
| `--ty-rays-ink` | `rgba(242,178,51,.12)` |
| `--ty-champion-shadow` | `rgba(0,0,0,.7)` |
| `--ty-order-rule` | `rgba(242,238,227,.14)` |
| `--ty-arms-vert` | `#0A9A5E` |
| `--ty-seal-ring` | `#9e2a17` |

### Measured component sizes

| Property | Winner value/default |
| --- | --- |
| `--ty-arena-height` | `clamp(360px,calc(100vh - 430px),640px)` |
| `--ty-center-width` | `clamp(130px,14vw,200px)` |
| `--ty-arena-gutter` | `clamp(12px,3vw,48px)` |
| `--ty-hill-center-width` | `clamp(120px,12vw,170px)` |
| `--ty-hill-width` | `clamp(220px,21vw,300px)` |
| `--ty-arms-width` | `clamp(80px,8.5vw,128px)` |
| `--ty-card-title-size` | `clamp(22px,2.4vw,36px)` |
| `--ty-stamp-size` | `clamp(24px,2.6vw,40px)` |
| `--ty-seal-size` | `clamp(96px,10vw,136px)` |
| `--ty-vs-size` | `clamp(30px,3.6vw,48px)` |
| `--ty-seconds-size` | `clamp(34px,3.8vw,52px)` |
| `--ty-board-title-size` | `clamp(30px,4vw,58px)` |
| `--ty-champion-gap` | `clamp(18px,4vw,60px)` |
| `--ty-champion-stamp-size` | `clamp(24px,2.6vw,38px)` |
| `--ty-space-18` | `18px` |
| `--ty-pennant-tail` | `15px` |
| `--ty-text-detail` | `12.5px` |
| `--ty-compact-center` | `110px` |
| `--ty-card-width` | `340px` |
| `--ty-text-countdown` | `10px` |
| `--ty-text-number-small` | `11px` |
| `--ty-text-small` | `12px` |
| `--ty-text-seed` | `11.5px` |
| `--ty-ride-distance` | `60px` |
| `--ty-split-min` | `280px` |
| `--ty-match-width` | `150px` |
| `--ty-text-column` | `10.5px` |
| `--ty-mini-shield-height` | `17px` |
| `--ty-lineup-width` | `92px` |
| `--ty-lineup-shield-width` | `52px` |
| `--ty-lineup-shield-height` | `62px` |
| `--ty-order-min` | `240px` |
| `--ty-order-max` | `360px` |
| `--ty-champion-shadow-spread` | `70px` |
| `--ty-crown-width` | `64px` |

### Motion and layout inputs

| Property | Winner value/default |
| --- | --- |
| `--ty-vs-tracking` | `.02em` |
| `--ty-fall` | `-3deg` |
| `--ty-fall-right` | `3deg` |
| `--ty-matches` | `1` |
| `--ty-side-ink` | `var(--azure)` |
| `--ty-order-index` | `0` |
| `--ty-order-delay-start` | `200ms` |
| `--ty-order-delay-step` | `70ms` |
| `--ty-reduced-duration` | `.001ms` |

## WP5 validation

No dependency installation or network calls. All six package commands exited 0:

| Command | Relevant output |
| --- | --- |
| `pnpm --config.verify-deps-before-run=false --filter @castle-control/ui typecheck` | `[pnpm typecheck] walked 99 files` |
| `pnpm --config.verify-deps-before-run=false --filter @castle-control/ui lint` | `[pnpm lint] walked 99 files` |
| `pnpm --config.verify-deps-before-run=false --filter @castle-control/ui test` | `Test Files 25 passed (25)`; `Tests 383 passed (383)` |
| `pnpm --config.verify-deps-before-run=false --filter @castle-control/duel typecheck` | `[pnpm typecheck] walked 31 files` |
| `pnpm --config.verify-deps-before-run=false --filter @castle-control/duel lint` | `[pnpm lint] walked 31 files` |
| `pnpm --config.verify-deps-before-run=false --filter @castle-control/duel test` | `Test Files 12 passed (12)`; `Tests 369 passed (369)` |

`node scripts/check.mjs` exited 0: boundaries, hygiene and file-cap each walked
907 files; secrets walked 1308 files. Every changed code file is below 400 lines.

`pnpm --config.verify-deps-before-run=false --filter @castle-control/ui exec vitest run src/duel --pool=threads --reporter=verbose --silent=false`
exited 0, with 24 tests in 4 files. It prints `[duel CSS] walked 8 files`, its
three seeded style defects, the zero-conflict keymap proof, and
`[nextDue churn] 125 wakeups <= 127; 110 distinct arrivals; final 20–39`.
The pure engine test also prints the same budget and final tally through
`pnpm --config.verify-deps-before-run=false --filter @castle-control/duel exec vitest run src/chat-flow.test.ts --pool=threads --reporter=verbose --silent=false`.
The markup tests cover the 9000ms tally, barred ballots, all requested roles,
SIMULATED provenance, five ticker events, call snapshots, tally close/flip
note, tie copy, disconnected board, pause/resume, source caching and champion.
Existing Showdown tests still pass, and its button-inheritance rule is unchanged.

Browser verification remains incomplete. A headless Playwright attempt to open
the local winner failed at `chromium.launch`: `browserType.launch: spawn EPERM`.
No winner playback, screenshots or browser style-contract measurement is
claimed. No Computer Use or desktop browser was used. The full root `pnpm gate`
was not run because this brief forbids downloads/network calls.

### WP5 additions for T1

| Property | Winner value/default |
| --- | --- |
| `--ty-chat-arms-width` | `clamp(70px,6.5vw,104px)` |
| `--ty-tug-width` | `900px` |
| `--ty-tug-well` | `#1D2027` |
| `--ty-tug-text` | `15px` |
| `--ty-ticker-height` | `126px` |
| `--ty-signal-counted` | `#37D08E` |
| `--ty-signal-barred` | `#FF8B72` |
| `--ty-signal-held` | `#FFD36B` |
| `--ty-ring-track` | `rgba(242,238,227,.18)` |

