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

## Mount in the follow-up

At base `cabd3b3`, edit these exact lines in
`apps/desktop/src/shell/room.tsx` after merging AI-5 (line numbers may move):

- Insert after line 10:
  `const StudioRoom = lazy(() => import('../rooms/studio/room.jsx'));`.
- Between the visuals branch at line 24 and fallback at line 25, add
  `: chamber === 'studio' ? <StudioRoom snapshot={snapshot} />`.
- Lines 25–26: simplify the remaining fallback to an unconfigured room; its
  `chamber === 'studio'` title condition is no longer needed.

The shell still supplies the breadcrumb, Back/Esc and shared seal slot. After
mounting, open `#/chamber/studio` in fixture mode. AI-6 does not mount a route or
change the shell; render tests exercise this default module directly.

## Evidence

`room.test.tsx` covers fixture/core modes, all 54 tiles and queue drafts without
ownership or stage changes. `keyboard.test.tsx` covers native Enter/Space button
activation paths for every hex and all three ladder requirement inspectors.
These are component tests, not browser Tab automation. The Director compares
mounted screenshots after integration.
