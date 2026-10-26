# Map Room detail room (AI-6)

`room.tsx` default-exports `StudioRoom({ snapshot }: { snapshot: Snapshot })`.
`Snapshot` comes from `../../model.ts`. The module is lazy-loadable and has no
breadcrumb, seal control, app entry import or Steward input.

Fixture mode contains the 9 by 6 war table, an inspector, pending war-table panel
drafts, and the test ladder. `fixture.ts` uses the reference sample's dimensions
and house names. The reference has no tile dataset (`keep/NOTES.md`); the 54
invented territory records are explicitly illustrative. They contain no viewer
identities or votes. House names and monochrome patterns distinguish territories.
Each native hex button changes only inspection, never ownership.

The shared queue's pending `studio` proposals appear as dashed
`DRAFT · NOT ON AIR` layers via `ProposalLayers`. The room does not transition a
proposal. Tests pass an isolated queue into `StudioWork`.

The only actual stage is Sand table. Ladder buttons inspect requirements; Muster
and Proclaimed remain locked. M4 waits for Twitch's WP 4.0 answer. This room has
no Extension bundle, connection, hosted test, review submission or release action.
Core mode shows an unconfigured state without sample tiles or controls.

## Mounted in wave 2b

The shell lazily mounts `StudioRoom` at `#/chamber/studio` in fixture mode,
passing `snapshot`. Live mode keeps the shell's empty state. Breadcrumb, Back/Esc,
seal slot and Steward remain owned by the shell. The room-wide provenance strip
is removed; draft layers still say `DRAFT ? NOT ON AIR`.

## Evidence

`room.test.tsx` covers fixture/core modes, all 54 tiles and queue drafts without
ownership or stage changes. `keyboard.test.tsx` covers native Enter/Space button
activation paths for every hex and all three ladder requirement inspectors.
These are component tests, not browser Tab automation. The Director compares
mounted screenshots after integration.
