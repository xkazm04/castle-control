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
This delivery implements only an in-memory preview. Ban review controls resolve
the local queue and mark local operations; held-message controls wait for fixture
confirmation, as described below. Rule-mode controls update `preview_modes`
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

## WP 1.7: portcullis follow-up (fixture only)

Reconciliation against the main checkout found the existing held queue in
`moderation-review.tsx` (Pass/Strike), the hard-coded `4 s` hero delay in
`moderation-page.tsx`, and immediate Shield preview toggling in
`moderation-model.ts`. This follow-up extends those controls rather than adding
a second queue. No delay selector or confirmation state existed there.

Prerequisite delivery: `packages/contract/src/index.ts` now re-exports
`gatehouseHeldResolve`, `gatehouseDelaySet`, `gatehouseShieldSet` and
`gatehouseLeaseEnd`. All four already existed in generated validation. Their
types were already public through `export type *`; no schema, generated file
or Rust identifier was changed. App Master should commit that one-file
prerequisite separately, before the desktop delivery, as it did for `df09a30`.

The small `moderation-held.tsx` and `moderation-gate-controls.tsx` components use
the existing panels, buttons, chips and windowed rows. Held rows show the original
generated message and an explicit AutoMod hold reason. Allow/Deny are native
buttons; both disable while resolution is pending. Until confirmation, the row,
chat verdict and ledger retain the held state. Confirmation alone removes the
row, updates the chat verdict and records a released/removed decision retaining
the original text. Duplicate or opposing in-flight resolutions are ignored.

The applied delay selector offers only off, 2, 4 and 6 seconds. It keeps its
previous applied value while disabled/pending. Both Shield controls (hero and
panel) share the same component and retain the confirmed pressed state until
confirmation. New display strings live in `moderation-copy.ts`. The extended
fixture provides initial states, a 400 ms confirmation delay, schema-validated
request/result pairs and explicit Twitch-UI action provenance. Human actions
from Twitch are labelled in the gate roll; local preview actions have a
different label. Provenance metadata is local fixture data, not a new wire
field. No RPC, transport, subscription, live timing or armed authority is added.

Validation, 2026-10-26:

- Red first: the new acceptance suite failed on the missing gate-controls
  component before implementation.
- Desktop command `pnpm --config.verify-deps-before-run=false exec vitest run
  --pool=threads src/moderation-gate.test.tsx src/moderation.test.tsx` passed
  18 tests. Coverage includes confirmation timing, applied select/pressed
  displays, original text/reason, pending holds for both outcomes, duplicate
  requests, native button tab-order semantics and keyboard-generated click
  activation, provenance labels and no fetch. The keyboard proof checks the
  native button contract and handler; it is not a mounted-browser Tab test.
- Contract command with `src/gatehouse-gate.test.ts src/gatehouse.test.ts
  src/index.test.ts` passed 37 tests, using the same Vitest flags.
- `node ../../scripts/package-gate.mjs typecheck` passed independently from
  both desktop (39 files) and contract (17 files). The equivalent lint runners
  passed with boundary/cycle, hygiene, file-cap and secret inventories.
- `pnpm --config.verify-deps-before-run=false --filter
  @castle-control/desktop build` passed, including the first-load budget:
  389,450 / 393,216 uncompressed JS+CSS bytes.
- Recursive `pnpm --config.verify-deps-before-run=false -r typecheck` and
  `-r lint` failed at subprocess launch with `spawn EPERM`, before checking
  packages. These are failures, not full-repository passes.
- `pnpm --config.verify-deps-before-run=false gate` passed 14 tooling tests
  and workspace inventories, then failed in the unchanged contract exporter
  with `spawnSync cargo EPERM`. Rust and later full-gate stages did not run.
  `git diff HEAD -- scripts packages/contract/scripts` is empty; no gate was
  changed to suppress this failure. App Master must run the full gate before
  acceptance. No full-suite or visual-fidelity pass is claimed here.

The changes remain uncommitted under the builder sandbox exception. No install
or git write was run, and the node_modules junction was left untouched.
