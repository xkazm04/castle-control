# Map Room: Extension studio preview

Draft for owner review, current at `c3dea03` (2026-10-28).
Open `#/chamber/studio` or press 4 in fixture mode. The current room is an
illustrative local war table. M4's Extension bundle, hosted service and Hosted
Test connection are **not built yet**. Core mode shows an unconfigured state.
Source: [current room implementation/status](../../apps/desktop/src/rooms/studio/README.md).

## Inspect the sand table

The sample board has 54 illustrative territories in a 9 by 6 layout. Select a
tile to inspect it; selection changes neither ownership nor votes. Tile labels
remain readable, and the board can scroll at smaller desktop sizes. Keyboard
users can reach its native tile buttons and scrollable region. Sources:
[sample table](../../apps/desktop/src/rooms/studio/README.md),
[room scrolling](../../apps/desktop/src/rooms/README.md#ai-9b-room-polish-2026-10-27).

The actual local stage is **Sand table**. **Muster** (Hosted Test) and
**Proclaimed** remain locked; their buttons inspect requirements rather than
change stage. Pending shared-queue proposals appear as `DRAFT` layers and do
not operate an Extension. A simulated design hold changes only the sample look.
Sources: [test ladder](../../apps/desktop/src/rooms/studio/README.md),
[design preview/seal](../../apps/desktop/src/rooms/README.md#design-focus-ai-14).

## Planned, not currently available

The M4 plan calls for a bundled data-driven Extension shell, viewer controls,
templates and a stateless service for JWT validation and broadcasts. The
current operator standup limits M4 to local/allowlisted Hosted Test and drops
the historical policy-email/review-submission step for that test-only scope.
This does not mean an Extension has been reviewed, hosted or released.
Sources: [M4 plan](../plan/03-implementation-plan.md#m4--map-room),
[operator override and checklist](../submission/checklist.md).

There is no deployment command, Extension secret setup or public release action
to perform from this room. See the [self-hosting stub](self-hosting.md).
Any eventual public Extension release requires a new owner decision; until
then, tests must stay within the owner's allowlisted accounts.
