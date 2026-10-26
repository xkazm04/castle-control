# Shared UI kit

The public entry is `@castle-control/ui`. Components own their co-located CSS,
use generated tokens, and accept caller data and copy without importing a
desktop fixture, contract or command port.

The WP 1.7 promotion adds:

| Export | Caller responsibility |
| --- | --- |
| `WindowedRows`, `rowWindow`, `rowHeight` | Stable row keys, accessible table label, fixed-height row content, optional empty-state copy. Heights default to the row token; larger review rows pass a multiple. Reset the component key when filtering. |
| `ConsensusChart` and its props/data types | Labelled snapshots with time series, window length, direction shares, preformatted change labels, accessible chart descriptions and summary copy. Selection remains local and read-only. |
| `ReviewRow` | Heading, original quote, detail, actions and optional children. Quotes remain focusable and scrollable; action handlers stay with the caller. |
| `RoomStatusHero` | Status labels, values, details and an optional action slot. |
| `ReplaySummary` | Ordered, labelled counts or other display values. |

Desktop moderation files retain contract shaping, Gatehouse vocabulary,
simulation notices and local operations. The duplicate desktop window module
was removed; the chart file remains a domain adapter. The existing `RuleTable`
has its own window calculation and did not already export the promoted API.

Run the Vite `kit` entry with the package's `dev` script. Both paper and stock
galleries contain all five components, including 10,000 generated entries,
scrollable original quotes, a chart with filters/direction selection, its empty
state and simulated action buttons. The new gallery section is lazy-loaded to
retain the existing kit first-load budget; no dependency or budget was added.

Verification uses the existing package scripts with
`pnpm --config.verify-deps-before-run=false --filter @castle-control/ui` (and
`@castle-control/desktop`). `promoted.test.tsx` renders every component and both
gallery themes, proves 16 rendered rows at the start/middle/end of 10,000 entries,
checks spacer geometry and tests the chart's empty state. Desktop tests preserve
the 4,200-line proof, original-message review and simulated replay behavior.
These are server-rendered markup checks; browser screenshots and mounted scroll
interaction are not claimed.

Validated on this worktree: UI typecheck/lint/build and 72 tests passed; desktop
typecheck/lint/build and 43 tests passed. Lint included boundaries, cycles,
hygiene, the file cap and secrets. Kit first load is 255,589 / 262,144 bytes;
desktop first load is 354,323 / 393,216 bytes, with the moderation page still a
separate lazy chunk. The initial five new tests failed before the public exports
existed, then passed after promotion. A multi-package pnpm typecheck invocation
failed at its lifecycle wrapper with `spawn EPERM`; the individual package
typecheck commands above both passed. Full workspace/Rust merge checks remain
with App Master; no Rust or contract file changed.
