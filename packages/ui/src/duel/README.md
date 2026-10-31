# Tiltyard (WP4)

`@castle-control/ui/duel` exports `Tiltyard`, its data/words props, the English
`tiltyardWords`, the declared keymap, and the session clock helpers. Lists have
already crossed the engine's `parseDuelList` door. This component does not parse
JSON, connect to a service, persist state or perform live actions.

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
change. Chat uses the supplied `key` (SAMPLE uses `mill`). Chat and ladder have
lineup placeholders here; their full drawings and ballot counts belong to WP5
and WP6. `StageAction` accepts a counted pair for the chat integration. Shared
`Arena`, `Card`, `Centre`, `Seal`, `Rail`, `Champion` and board components are
available as local modules. The clock schedules one timeout for theatre; WP5
extends `nextDue` with seconds and ballot arrivals. Motion uses a live media
subscription and changes both the stage attribute and session theatre durations.

## Validation

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

