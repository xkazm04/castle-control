# WP 1.7: offline moderation page

The desktop fixture route `#/moderator` composes the shared shell, panels,
rule table, verdict chips and buttons. `#/moderator/drill` is a nested replay
page with a breadcrumb and Back link. Key 2 still uses the existing registry.
Core mode keeps its previous empty state; it cannot mount this fixture page.

`moderation-fixture.ts` generates labelled simulated payloads and validates them
through the root contract entry. There is no real chat, endpoint or credential.
The fixture consensus snapshots expose shed counts, filter variants, time series
and three-minute deltas. The chart accepts only those snapshots; its local
filter/selection cannot call a command port. Replay retains source, instrument,
named evaluation states, observed passes, an over-moderation denominator and gaps.
Its hashes are explicitly illustrative fixture values, not a live computation.

`ModerationPort` is the local read/subscribe/command seam for a future client.
This delivery implements only an in-memory preview. Review controls resolve the
local queues and mark local operations. Rule-mode controls update `preview_modes`
only; the validated contract rules stay shadow. This is prominently labelled on
the page, and the rampart continues to show the actual fixture Watching count.
No port imports a transport; no command is sent or persisted. Leaving the
chamber discards the preview. No live or armed authority is introduced.

`WindowedRows` bounds chat, held/ban queues, ledger and replay DOM rows using the
shared row/window tokens and overscan. The 4,200-line chat initially renders 16
rows; a final-window proof reaches message 4,199. Search/verdict filters reset
the window. Review quotes retain original text and can be focused/scrolled.

Local candidates for later promotion to `packages/ui`:

- `WindowedRows`: generic token-sized, accessible windowed rows and spacers.
- `ConsensusChart`: read-only time-series plot and direction selector.
- Review-row composition: original-message review with explicit action slots.
- Room-status hero, tier table and replay summary/instrument layout.

Design comes from the prototype layout and the written UI plan. No prototype
product code is copied. Paper, inks, fonts, rules and rampart come from the shared
kit; component dimensions use generated token variables. The right column uses
the prototype's 340–396 width range; the main room hero follows the written plan.
The chat window uses the existing 320-high kit token and 32-high rows rather
than copying the prototype's 430-high container. All text meets the kit's
13 px floor. Screenshots at 1440x900 and 1280x800 remain a review gate:
Chrome computer-use access was denied here, so visual fidelity is not claimed.

Validation on this builder run:

- The acceptance test first failed because the new chart component was absent.
- Desktop package typecheck and lint passed; lint included boundary, cycle,
  hygiene, file-cap and secret inventories. No new source file exceeds 400 lines.
- Desktop tests passed: 43 tests in five files, including the four requested
  acceptance cases, local-only review/mode operations, replay routing, and the
  existing rampart/client checks. The window proof uses server rendering; a
  mounted-browser interaction and performance check remains unverified.
- Root `pnpm gate` failed before Rust execution: `spawnSync cargo EPERM` in
  the unchanged contract generation script. Recursive typecheck/lint also
  failed on sandbox `spawn EPERM`; desktop-only equivalents passed.
- Vite built the frontend, but its existing first-load budget rejected
  874,079 bytes against 393,216. Baseline comparison was unavailable because
  Node's read-only git subprocess was also denied (`spawnSync git EPERM`).
  The contract/codegen and budget threshold are unchanged; baseline size is
  not asserted. This needs App Master investigation before acceptance.

No install was run over the worktree's dependency junction. No package, contract,
lockfile, Rust source, native shell or gate script was changed.
