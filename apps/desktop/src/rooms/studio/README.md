# Map Room C · Herald

Binding design: `prototype/polish-2026-10-30/studio/variant-c.html`, its PORT
NOTES, the C section of its README and `_shots/studio-c-{paper,stock}.png`.
Reconciled at base `683b0f6`: studio was still the earlier room; no C port
was already present. The shared kit is the merged `a9aec46` delivery.

## Structure and component map

| Prototype | Product |
| --- | --- |
| cc-herald / field / side | Room-local two-column grid; field flex chain; independently scrollable, keyboard-focusable side |
| cc-banner-head | SectionHeading inline, h2 with serif gloss |
| cc-hexfield / plate / hex / face / id / house | Room-local size-container geometry in hex-field.css; 54 existing native buttons and data-hex-tile hooks |
| cc-pennants / pennant | List with Pennant standing; house stripe, 22px count and word |
| cc-hero / band / body | Plate, PlateBand hero and PlateBody with 14-token padding |
| cc-hero-figure | HeroReadout display (54px), local swatch and Column/Row/Share |
| cc-hero-kicker / now / house / note / hint | Room-local copy and typography; data-house drives band, shadow, swatch and ghost |
| cc-side-head | SectionHeading ruled with current-stage count |
| cc-tablets / tablet | Local three-column group and HeraldicCard tablet; current and inspected states remain separate |
| cc-tablet-no / state | Local number, flag/lock SVG and state word |
| cc-proclamation / label | Local role=status requirement readout |
| cc-draft / stamp / rev | Unchanged ProposalLayers markup; equivalent dashed styling scoped under studio-room |
| cc-seal-card / head / body | Plate plain frame around the unchanged shell node; its existing h2 is the key band; child spacing supplies the body insets |
| cc-seal-designs / caption / empty / button | Original shared seal-slot content and design actions, with scoped styling |

`StudioRoom` remains lazy-loadable and takes `snapshot` and optional `seal_slot`.
Fixture mode uses `StudioWork`; its tile and rung selection remain React state.
All 54 records are unchanged, invented, illustrative territory data. Selecting
any hex changes only inspection. House Quill/Tallow/Sable retain full gules/or/
azure fills; unclaimed is paper-2. Labels on ink remain at least wordmark bold,
with small house labels on card. The board's query computes its hex size from
both axes, so the six rows fit rather than scroll. The standings follow it.

Sand table is always the sole current stage. Muster and Proclaimed are dashed,
locked requirement inspectors, never stage transitions. The live policy gate,
no-network statement, human operator consent, illustrative and simulated labels
are retained verbatim. Pending studio drafts remain DRAFT · NOT ON AIR; their
shared queue is never changed by rendering. Core mode keeps The map table is
bare and hides fixture controls. The shell's core route stays untouched.

## Forced differences

- Kit markup replaces prototype wrappers: Plate/PlateBand/PlateBody,
  SectionHeading, HeroReadout, Pennant and HeraldicCard keep their public class
  names and slots. The figure row uses studio-tile-figure to avoid colliding
  with the kit's cc-hero-figure. Pennant sits inside an li; its decorative i is
  hidden by the kit's standing variant. HeroReadout's required accessible Tile
  caption is visually hidden to preserve the prototype's figure-only row.
- The seal slot is opaque, shell-owned and passed through unchanged. No
  PlateBand or extra heading is inserted: scoped CSS makes its existing h2 the
  key head band. The frame and slot have zero padding and no inner top rule;
  body spacing is on the slot's existing children. The human-operator consent
  line stays immediately before the frame because the room cannot inject it
  inside that node. Exactly one shared hold control exists with a pending draft.
- ProposalLayers remains unchanged, including its stamp paragraph, re-inked
  values, revision animation and semantic field markup. Scoped room CSS draws
  the prototype draft treatment; no second proposal or seal implementation.
  The wrapper is hidden when its shared list is empty, so it adds no grid gap.
- The old visible board-scroll instruction is replaced by an accessible hidden
  side-scroll hint. Only the side column is tabbable as a scrolling region;
  all tiles remain native keyboard buttons. This preserves scroll access while
  showing all six rows, as the chosen C design requires.
- The prototype's 21rem side minimum becomes calc(space-56 * 6), preserving
  336px at the specified baseline using tokens. Hex coordinates remain numeric
  local CSS custom properties; SVG coordinates remain geometry. No token or
  kit file changes, raw colour or raw pixel size.
- Shared shell, Steward and core fallback are outside this body port. Prototype
  Paper/Stock and Sample draft controls are omitted; real queue drafts supply
  the draft state. The implementation plan's hosted/live stage acceptance is
  not claimed: WP 4.0 and owner-only actions remain pending.

## Checks and test changes

- room.test.tsx: core title now matches the required bare-map state; locked-rung
  checks use kit attributes independent of their order. All prior fixture,
  proposal, non-mutation, lazy-load and no-network assertions remain.
- Added three C tests: house-following banner/ghost/shadow and counts; type
  floor, token-only field geometry and separate current/inspected/locked states;
  exact shared slot markup and one hold control with a pending draft.
- keyboard.test.tsx: the native-button collector unfolds HeraldicCard tablets.
  Both activation tests still exercise every tile and every ladder requirement.
- shell/room.test.tsx, studio only: (1) side/seal ordering checks C's frame;
  (2) workbench inset check becomes field inset check; (3) current background
  reads the kit's key fill; (4) title-once stays unchanged, while the scroll-hint
  branch checks the focusable side and hidden hint; (5) scrollbar check guards
  side overflow and size-container field. Prototype README line references are
  on each changed assertion. All other room assertions stay byte-identical;
  data-hex-tile, War-table panel design and The map table is bare checks remain.

Desktop typecheck/lint and all 320 tests (35 files) pass. UI typecheck/lint and
all 305 tests (19 files) pass. Focused studio/keyboard/shell: 28 tests. The new
C checks first failed against the old room. Lint proves boundaries, hygiene,
400-line cap and secrets; shell/room.test.tsx remains at 400 lines. No install,
network, Vite, Chrome, build, e2e or git write was run. Director screenshot,
budget, full-gate and browser verification remains required after integration.
