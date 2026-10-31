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
| cc-hero-kicker / now / house / note / hint | Room-local copy and typography; parsed side data-ink drives band, shadow, swatch and ghost |
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

## WP L4 local journey (2026-10-31)

The Director's revised scope keeps desktop independent of the renderer package.
This room imports the six kept styles and `art(style, 'hexmap')` from the demo
model read-only. No dependency, contract, shared kit, scene or overlay changes.

The default M board keeps all 54 original records, territory counts and geometry.
S is 6 × 4 (24 tiles); L is 12 × 8 (96 tiles), with deterministic additional
sample territories. Each size fits its container using numeric CSS geometry.
Hexes remain native keyboard buttons. Banner buttons inspect the first visible
tile of that house; they never join a side, claim territory or change outcomes.
Shrinking the map retains a valid selection or returns to A1; an unavailable
tile now shows an honest empty inspector instead of silently displaying A1.

The kit FieldGroups expose size, anchor, preset colour, all six art styles and
reveal timing. Native selects and number fields support keyboard editing. The
preview positions and scales the kept hex-map art, applies the chosen token ink
to its frame, and reveals it over the chosen duration. The territorial board
keeps house colours. Invalid timing (blank, fractional, negative or over 60000)
shows an accessible error and keeps the last valid preview. Replay restarts the
local animation; reduced motion shows its final state immediately. Reset restores
the default design. SIMULATED · SAMPLE ART · AI-generated remains visible.

All these settings are React session state: leaving the room or reloading resets
them. `maproom.design.upsert` still takes `Pending = never`; there are no typed
payload fields for `size`, `anchor`, `colour`, `art_style` or `reveal_ms`. No RPC,
storage, channel transition, Hosted Test, paid call or external service is used.
Sand table remains current; Muster and Proclaimed remain requirement inspectors.
Core mode keeps its original empty state and exposes no sample controls.

Red-first evidence: journey.test.tsx initially failed on missing Map size and
the invalid-tile fallback; session.test.ts initially could not load the absent
session module. The new Playwright journey was written before implementation;
its expected-red base assertions are missing banner controls, map fields,
24/96-tile sizes, preview attributes/art, invalid-timing error, replay and reset.
Existing hex and test-ladder keyboard assertions remain. The Director executes
`pnpm --config.verify-deps-before-run=false exec playwright test -c
e2e/playwright.config.ts e2e/journey-maproom.spec.ts` at both configured viewport
sizes. The spec reuses network/style/field audits without changing those helpers.
Only Playwright discovery and TypeScript compilation were run in this builder.

Focused validation: studio plus shell/room tests pass 38 cases across six files.
New design tests activate native field callbacks and banner controls, render all
six kept styles, verify every map size and prove no fetch. Desktop and renderer
typecheck/lint pass via `node ../../scripts/package-gate.mjs <mode>` from each
package (the recursive pnpm lifecycle launcher encountered spawn EPERM before
running them). Lint covers boundaries, hygiene, the 400-line cap and secrets.
Renderer output proofs and their limits are documented in viewer/README.md.

## maproom-A: one board-spec door (2026-10-31)

Decision: `board.ts` owns the desktop-room-local display parameter, not a new
wire schema. `parseStudioBoard(unknown)` returns `{ ok: true, board }` or
`{ ok: false, error: { code: 'invalid_board', message } }`, never a partial
board. It snapshots and freezes `{ title, sides: [{ id, label, short, ink }],
tiles: [{ q, r, side? }] }`, including every array and record. Unknown fields
at all three levels, duplicate side ids/locations, undeclared sides, blank
text, non-integer coordinates, empty/sparse tile arrays and over 200 tiles
are refused. Absent side keys stay omitted. The closed inks are gules, or,
azure and key; arbitrary CSS and colour values cannot cross the door.

Tile fields deliberately mirror the renderer's axial HexTile minus image_path.
No renderer import, dependency, contract identifier, host route or schema change
is involved. A future shell adapter can consume q/r/side without remodelling.
`boardGeometry` is a pure derivation of pointy-top centres using q+r/2 and
1.5*r, normalised to full-hex bounds. X uses hex-width units; Y uses radii.
It also supplies offset display columns/rows, spreadsheet column labels,
display ids, side counts and unclaimed count. Display ids are labels only;
neither coordinates nor short side labels are parsed out of their text.

The sample is parsed once at module load as `STUDIO_SAMPLE_BOARD`. All original
54 territories and A1–I6 ids remain; counts are 14/14/15/11. `fixtureTiles`
and `tilesForSize` remain read-only compatibility inventories derived from
boards, not a second rendering model. L4's S/M/L boards now pass the same
parser, and session selection, banner inspection, preview dimensions and the
inspector consume those boards. HexTable, TileInspector and StudioWork accept
another parsed board; its dimensions/labels/counts replace the sample's. The
fixture-size picker is disabled for an explicitly supplied board, whose shape
it does not own; other local preview controls still work. Reset and banner
selection use that board, and selection never mutates its ownership.

The CSS receives numeric `--board-w`/`--board-h`, fit bounds and each centre's
`--x`/`--y`; no odd-row placement selector or fixed grid dimensions remain.
The sample's fit is preserved exactly by deriving a conservative width rounded
up to hundredths of a radius and a height with 0.02-radius breathing room.
Together with the unchanged hex-width ratio this reproduces the prior sample
rectangles and container fit. A 3-column/2-row board spans 3.5 hex-widths by
3.5 radii, as corrected by the card critic. Colours use four data-ink token
selectors, never house-name selectors; explicit data-unclaimed handles paper-2
without reserving any side id or label. Copy derives its title, dimensions and
tile count from the supplied board. WP 4.0 wording remains the owner's call.

Evidence: board.test.ts first failed because board.ts was absent. Its tests
cover the refusal matrix, deep freeze/copy, exact independent ownership parity,
sample and corrected 3×2 bounds, signed sparse coordinates, all inks and original
sample rectangle parity with width/height-limited containers. board-view.test.tsx
covers a two-side 4×3 board, exact pennant counts, short N/S labels, azure tiles/
pennant/inspector, activation of all twelve native buttons, non-mutation,
StudioWork/custom-board session controls, no fetch, D4 coordinates and AB1's
multi-letter column. Existing fixture, proposal, lazy-load, no-network and
keyboard tests remain; shell/room.tsx and its 400-line test are untouched.

Validation for this delivery: desktop typecheck and lint pass (152 source files;
the lint's boundary/hygiene/file-cap inventory is 751 and secret scan 1021).
The card's full desktop test command passes 385 tests in 50 files. The final
narrowed studio plus untouched shell/room test run passes 47 tests in eight
files. The desktop production build passes token parity (122/122) and the
all-route initial bundle budget (364457/393216 uncompressed bytes).

The required `pnpm gate` was attempted with dependency verification disabled
for the shared node_modules junction; nothing was installed. It passes version
drift, all 24 tooling tests, workspace inventories and the fetch step, then
stops in the contract exporter at `spawnSync cargo EPERM` (codegen.mjs:26).
The exporter, check script and gate script are byte-unchanged from base
`6cc8455` according to git diff. This is an execution permission failure, not a
contract-drift result; the later Rust format/Clippy/tests and recursive workspace
gates did not run. Full-gate verification remains for the Director. No second
tree, alternative spawn path, install, gate-tooling change or git write was used
to bypass that refusal. Screenshot/browser verification was not run; sample
placement fidelity is established numerically against the original C geometry.
