# Map Room C · Herald

## Final gate · defer local duel demos (2026-11-02)

Showdown and Ladder now live in `local-duel-demos.tsx`, loaded with `React.lazy`
only when a More view requests them. Both the room and the optional Tiltyard
view branch use this deferred module. Their original component, words, SAMPLE
lists, simulated ballot source, mode keys and markup are unchanged. The fixture
and core duel, full bracket, proposal host and drawer lifecycle are unchanged.

This removes the local demo engine and its legacy Tiltyard styles from the
`tiltyard-view` first-paint chunk. No CSS declarations or selectors changed.
The one legacy rule matching the main duel's shared Shield sets
`fill: var(--ty-arms-vert)`, which its inline SVG fill already supplies. All other
legacy demo rules target the separate `ty-*` demo structure.

`pnpm --config.verify-deps-before-run=false --filter @castle-control/desktop build`
exits 0 with the original, unchanged checks and limits:

```text
[Desktop tokens] found 299/299 generated token definitions in initial CSS
[desktop first-load budget, all four routes] walked 10 files; 422681/425984 uncompressed JS+CSS bytes
[duel chunk budget] walked 2 files; 26726/98304 uncompressed JS+CSS bytes (js 17136, css 9590)
```

Desktop `typecheck` and `lint` both exit 0 and walk 380 files. Desktop `test`
exits 0: 133 files and 1196 tests passed. Existing local-demo coverage remains;
two new tests render each deferred mode to completion and compare it against
the direct component's complete static markup. `node scripts/check.mjs` exits 0
for boundaries, hygiene, type floor, file cap and secrets; `git diff --check`
also exits 0. No dependency, build configuration or budget changes were made.

## Owner readability decision · 15 px, move more into drawers (2026-11-02)

Section prose, option names, bracket rows, controls, tally summaries, minis and
drawer detail now use `--text-px-15` with line-height 1.45 (21.75 px per line).
Small-cap headings/seed tags and the existing key badges retain their 13–14 px
roles. The picture stays at its existing size and stage type stays at least
15 px. Shared section padding (11/14/12 px), 8 px content gaps and 10 px section
gaps are retained/restored rather than compressed to fit the larger body type.
Buttons grow with wrapped text instead of forcing a 30 px small-button height.

New drawer destinations, all behind the visible keyed Full bracket/More triggers:

- Speed ×3, New bracket and Show the duel on stream, with their existing guards,
  handlers and table-derived key badges. Their keys reach the shell dispatcher
  from the drawer; a local demo/form continues to isolate its own keys.
- Contestant notes, moderation/barred provenance, the core-counting explanation
  and the eight-entry quarterfinal explanation. The `ty-barred` hook moves with
  its content; no role hook is removed.
- Ballot percentages, where the complete 15 px labels fit without competing for
  a nearly empty tally segment. Counts and the proportional bar stay in the room.
- The repeated matchup line from Preview/Program. The minis retain their existing
  title, phase and counted total; the drawer names the current pair explicitly.

Computed fit budget (not a browser measurement), using the shared token values
and the standard four-contestant SIMULATED duel:

| Item | Computed height |
| --- | ---: |
| Body line | 15 × 1.45 = 21.75 px |
| One-/two-line button, including padding and borders | 35.75 / 57.50 px |
| Live option card, allowing two name lines and two call-button lines | 148.60 px |
| Arena: options + 8 px gap + clock/action rows | 238.35 px |
| Duel section, allowing a two-line question | 428.70 px |
| Duel column including 22 px layout padding | 450.70 px live; 454.70 px verdict; round up to **460 px** |
| Bracket section, allowing two-line final placeholders/champion | 319.95 px |
| Undo/More section | 85.65 px |
| Bracket/tool column, including 10 px section gap + 22 px layout padding | **437.60 px** |

At 1280×720, the supplied 470 px room-body budget leaves 10 px after the rounded
460 px column allowance; at 1366×768, 520 px leaves 60 px. These calculations
assume the standard labels fit the stated line counts; arbitrary long custom
labels still require browser review. The picture remains the shared 380/423 px
column at those widths with its 16:9 ratio. Removing the repeated matchup row
also gives the minis more height for their 15 px text.

Verification for this follow-up is recorded in the builder delivery. The updated
unit coverage checks moved content in the drawer, its action handlers and all
key badges, plus forwarding the moved tool keys without leaking local demo keys.
The journey checks 15 px / 21.75 px computed body styles, two-line option names,
drawer provenance/tool reachability and the speed key at both laptop sizes.
Browser access still reports the native pipe and browser host unavailable;
the targeted Playwright command still exits at `Error: spawn EPERM` before
assertions. No measured-fit or browser-journey pass is claimed.

## T3 WP4-map · The Deck (2026-11-02)

Fixture and connected-core duels now share `ChamberLayout` through `DuelStage`.
The 16:9 picture uses the same contestants, phase, clock, counts and verdict as
the controls. Preview shows the existing Steward duel draft; Program keeps the
actual tournament snapshot while a draft is shown. Sample data remains labelled
SIMULATED. No tournament model, contract, ballot generator or duel keymap changed.

Old section destinations:

| Destination | Existing content |
| --- | --- |
| Picture column | Duel picture; Preview draft and Program tournament minis; core connection/error notices |
| Column 1 · The duel | Question, round, two option cards side by side, call buttons, countdown, phase/verdict/champion, vote controls and tally including moderation provenance |
| Column 2 · The bracket | Semifinals beside final and champion; full bracket trigger. Eight-entry quarterfinals remain in the drawer |
| Column 2 · Call the duel | Undo, speed, new bracket, the existing sealed stream flow, More drawer trigger |
| Drawer | Full bracket with seeds, core source-copy/refresh, demo detail notices, and all six More views: Showdown, Ladder, sand table/design, Spyglass, Rehearse, design proposals |

The shared Drawer is portalled outside the room frame. Escape closes it before
the duel keymap receives the key; the shared focus lifecycle restores its opener.
The local proposal forms keep a stable portal host across closes, preserving
their mounted state. The room never adds action-key badges. Glass surfaces,
spacing, type and motion use existing tokens; picture type is at least 15 px,
section type at least 13 px. Bulky detail is in the scrolling drawer body.

Verification (no installation, dependency changes or git writes):

- `pnpm --config.verify-deps-before-run=false --filter @castle-control/desktop typecheck`
  exits 0: `[pnpm typecheck] walked 361 files`.
- The same desktop `lint` exits 0: `[pnpm lint] walked 361 files`.
- The same desktop `test` exits 0: `127 passed (127)` files, `1155 passed (1155)` tests.
  A competing earlier run timed out in the unchanged 900-cast crypto corpus;
  the complete suite passed when rerun without concurrent checks.
- `duel-chamber.test.tsx` covers the actual ChamberLayout composition, picture,
  minis, both columns, both drawer triggers, reachable seeded bracket/menu/source
  tools, Preview/Program separation, and drawer-first Escape/frozen controls.
- `node scripts/check.mjs` exits 0 for boundaries, hygiene, type floor, file cap
  and secrets. `git diff --check` exits 0.
- The room journey retains calls, tally freeze, call-off/resume, champion, undo,
  local demos, design proposals, Steward draft/seal and demo progression coverage;
  selectors follow the new drawer, bracket summary and focus return. It also
  checks the chamber's picture, columns and laptop fit at 1280×720 and 1366×768.

Browser verification is outstanding. The winner's supplied 1280 screenshot and
source were inspected, but Computer Use reported both browser host and native
pipe unavailable. Desktop `dev` started Vite at `http://127.0.0.1:5175/` because
5173/5174 were occupied, and was stopped after verification. The targeted command
`$env:CC_E2E_PORT='5186'; pnpm --config.verify-deps-before-run=false exec playwright test -c e2e/playwright.config.ts journey-tiltyard.spec.ts --output=apps/desktop/src/rooms/studio/.verification/e2e`
exited 1 at `Error: spawn EPERM` before browser assertions. No visual fit, browser
journey or screenshot-fidelity pass is claimed; Director verification is required.

## Stabilize maproom-03, maproom-05 and maproom-06 (2026-10-31)

Re-anchored at `14d2e78`: `hex-table.tsx` still rendered every tile in the Tab
order with no arrow handler, its faces used Free while names used unclaimed,
and the design controls did not describe their hints. The existing focus and
selection rings from `2bb2423` remain unchanged, as do the ladder and session.

Each board now has one Tab stop: its selected tile, or its first tile when no
valid selection exists (including the initially unpicked Spyglass). Arrow keys
move inspection and focus by offset row/column from `boardGeometry`; Home/End
choose the current row's ends. Edges and gaps do not wrap or jump. Only these
unmodified navigation keys are consumed; shell shortcuts, Tab, Enter and Space
retain their native paths. The handler uses no hooks, global listener or class.
Inspection does not change board ownership. The same HexTable serves the main
table and simulated viewer previews.

Every tile's accessible name contains its visible id and short house text
together, followed by the full house name when different. Unclaimed is the one
display word on faces, banners, pennants and the inspector; lowercase data-house
markers remain machine values. Existing House Tallow banner names are retained.

FieldGroup hints receive `${control_id}-hint` ids. Anchor, colour, art style and
reveal controls reference their hints with aria-describedby; invalid reveal
timing includes both hint and error ids. All four hints explicitly scope the
setting to the local art preview. Map size still changes the inspectable board.

Red-first evidence at this base: the focused desktop run (keyboard, design,
board-view) failed 10 cases and passed 11; the heraldic run failed the new hint-id
case and passed 11. Every named FAILS-today case failed. After implementation,
all 21 focused desktop cases and all 12 heraldic cases pass. Additional coverage
checks S/M/L Tab stops, empty/stale selections, focus destinations, all sample
right/down neighbours, sparse custom boards, Home/End, shortcut propagation,
custom short labels, and descriptions both with and without a reveal error.

The Director approved only the line-105 assertion change in board-view.test.tsx:
it now expects index zero to have tabIndex 0 and the others -1. Its assertion
count is **54 expect calls before and 54 after**; the custom activation case
still executes 74 assertions over 12 tiles. All activation, ownership and
non-mutation checks are retained. No other line of that file changes.

The whole desktop suite passes **614 tests in 62 files**; the whole UI suite
passes **333 tests in 20 files**. Both packages pass typecheck and lint, including
boundaries, hygiene, file-cap and secrets checks. Root tooling lint, Rust format,
workspace Clippy and `cargo test --workspace --locked` (including doc-tests)
also pass; existing owner-attended/live tests remain ignored. Desktop, overlay
and kit builds pass; rebuilding the overlay leaves its tracked bundle unchanged.
Desktop token parity is 122/122 and first-load size is 364654/393216 bytes; kit
token parity is 122/122 and first-load size is 261338/262144 bytes.

Required validation limits: `pnpm --config.verify-deps-before-run=false gate`
passes version drift, 24 tooling tests, inventories and fetch, then exits at the
unchanged contract exporter's `spawnSync cargo EPERM`. Recursive workspace
typecheck/lint also exit at lifecycle `spawn EPERM`. These launchers are unchanged
from base, whose docs/PLAN.md already records both failures. The required
`pnpm --config.verify-deps-before-run=false e2e journey-maproom.spec.ts` attempt
(with output directed outside the worktree) exits at `spawn EPERM` before browser
assertions. No browser pass or green full gate is claimed; Director verification
is still required in a process environment that permits these launches. The e2e
sources and all other prohibited paths are unchanged. No install or git write
was run.

## Challenge maproom-B · Spyglass (2026-10-31)

Re-verified at `d99478f`, including maproom-A (`3304f2c`). The Spyglass is a
**simulated viewer preview, not an Extension**. Table / Spyglass are native
pressed-state buttons; both views consume the room's actual parsed board,
including S/M/L or an injected board. There is no OBS map source, live viewer
submission, network call, new wire identifier or renderer dependency here.
The existing test ladder and WP 4.0/no-Extension copy remain unchanged.

`frames.ts` owns four deeply frozen local presets: Panel 318×500, Mobile
360×640, Video overlay 1280×720 and OBS 1080p 1920×1080. Unknown frame ids keep
the previous frame. Each frame uses the same HexTable at its source dimensions;
the entire canvas, including labels, scales down to fit the available column.
The readout describes source size, not the reduced desktop thumbnail. It uses
`boardGeometry(board).fit_width` and `fit_height`, which already include the
horizontal sqrt(3), without a SAMPLE_EXTENT or a second geometry model. The
framed canvas uses its full fit bounds; the main table retains its token gutter.

For the default M board, fit_width=16.46 and fit_height=9.52. Radius scale is
`min(frame.width / fit_width, frame.height / fit_height)`; hex width is
`floor(scale * sqrt(3))`. This gives **33 / 37 / 130 / 196 px**, respectively.
Panel and Mobile fail the 44px tap-target floor; the two display canvases have
no touch-target requirement. Labels use a conservative 44px source-width floor
for the two-line id/house stack, so OBS 1080p reports labels legible. Small
frames explicitly warn about overlapping labels rather than hiding the limit.

Spyglass reads the injectable shared `DesignSession` without changing it. It
shows Current alone until a map proposal has been previewed, then Current and
Draft · NOT ON AIR side by side. The selected map preview takes precedence,
otherwise the most recent remaining map preview is shown. `canSeal` supplies
the STALE mark; previews for other artifacts are ignored. Review, Preview,
hold-to-Seal and Tear it up stay in the existing shared design path. A sealed
map look now reaches the **Map Room table** as well as the Spyglass. Ink affects
the plate and selection accent; engraved/halftone affect face texture; quiet
hides house words and bold enlarges ids. Look attributes use `data-look-ink`,
never the territories' `data-ink`; house ownership and colours remain intact.
The separate session-only art controls retain their existing meaning.

Viewer picks are component-local. Enter/Space on a native hex button updates
only Your pick, never the streamer inspector, proposal queue, board ownership
or stage. No second Seal control is added to the Spyglass.

Evidence: the two new unit suites first failed on missing frames/spyglass
modules. They now cover frozen presets, unknown ids, actual fit readouts at
all sizes, one/two frames, stale/re-preview/seal/tear, non-map filtering,
native activation with a pending proposal, inspector/queue/board isolation,
no fetch, look-versus-side inks, and token-only CSS. The existing studio tests
and the untouched 400-line shell/room.test.tsx remain green. Desktop typecheck
and lint pass (159 source files; 761 boundary/hygiene/file-cap files and 1031
secret-scan files). The card's full desktop test command passes **515 tests in
54 files**. The new Spyglass block in the existing `e2e/journey-maproom.spec.ts`
keeps the original journey intact; it checks all four sizes, real canvas fit,
keyboard pick isolation, S/M/L, Current/Draft, Seal/STALE/Tear, and saves a
screenshot under the Playwright test output directory. The e2e TypeScript
check passes. Browser execution/screenshots are **Director-run and pending**.
The final narrowed studio plus shell/room test run passes 55 tests in 10 files.
E2e journey ESLint passes. The desktop production build passes with 122/122
tokens and 364480/393216 bytes in the all-route first-load budget.

The required `pnpm --config.verify-deps-before-run=false gate` was attempted
without an install or a change to the shared node_modules junction. It passes
version drift, all 24 tooling tests, workspace inventories and Cargo fetch,
then fails in `packages/contract/scripts/codegen.mjs:26` with
`spawnSync cargo EPERM` while exporting the contract. The gate, run helper,
Rust wrapper, exporter and contract check are unchanged from `d99478f`
(`git diff d99478f --` those paths is empty). Later full-gate checks did not
run; this is not a green `pnpm gate`. No alternate spawn path, second tree,
tooling edit or sandbox workaround was used. Director full-gate verification
remains required in an environment that permits that Cargo subprocess.

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

## Rehearse a round (2026-10-31)

A third view beside Table and Spyglass plays a deterministic, simulated round on
the room's own parsed board. It answers "will my board make a good round at 30
or 300 viewers?" locally, while the Muster and Proclaimed rungs stay locked. It
adds no wire identifier, dependency, network call or stage transition.

| File | Job |
| --- | --- |
| `rehearsal.ts` | Pure simulation and the setup door `parseRehearsalSetup` (seed 1-24 chars, viewers 10-1000, turns 2-24). |
| `rehearsal-verdict.ts` | `balanceReport`: spread of shares, leader margin, chokepoints, turn of last change, lead changes and the verdict words. |
| `rehearse-state.ts` | Pure reducer: start, step, tick, pause, resume, reset, again, replay, compare sizes, compare crowds, brush, paint, restore, comparison list. |
| `rehearse-paint.ts` | Redraw start: the edit overlay (`paintEdits`) and the board it makes (`startBoard`, re-parsed by `parseStudioBoard`). |
| `rehearse-tools.tsx` | The What if row (Compare sizes, Compare crowds, Redraw start) and the brush palette. |
| `rehearse-strip.tsx` | Territory by turn: one stacked column per turn, legend, tooltips and a table for screen readers. |
| `use-rehearse.ts` | The only hooks: the clock tick, the reduced-motion flag, the redrawn start board and the reset when the base board changes. |
| `rehearse.tsx`, `rehearse-side.tsx` | Hook-free views (the same split as Spyglass), so tests render them directly. |
| `rehearse-copy.ts`, `rehearse.css` | Copy and token-only styles. |

**The model.** Each turn every generated viewer emits `join_side` then
`pick_tile`, the renderer's closed viewer-action shapes mirrored by value (the
desktop does not import the renderer). Join odds come from a per-house pull drawn
from the seed, a small per-turn jitter and a mild bandwagon on held share. A
viewer attacks (a tile beside the house's holdings, unclaimed or enemy) or
defends (one of its own border tiles). Per tile the highest count wins; a held
tile starts with a garrison of 2 plus 1 per two friendly neighbours; ties are a
seeded coin; a house with no land musters on unclaimed tiles. Only tiles picked
in a turn can change owner, and tests prove it on S, M and L boards. The
generator is mulberry32 over an FNV-1a hash of the seed text; nothing reads a
clock or `Math.random` (a test scans the sources).

**Tuning.** The first naive version (72% attack, no garrison, strong bandwagon)
ended in a 100% conquest within four turns on every board. The constants now give
rounds that vary with the seed and with the crowd: on the M board 30 viewers
mostly stall, 120 mix runaways, tight races and contested rounds, and 300 mostly
run away. A test pins that variety so a later tweak cannot make the room boring.

**Copy law.** The band "SIMULATED REHEARSAL · no viewers, no identities, no
Extension state · sample territory" is rendered unconditionally at the top of the
view. Tests assert its exact words in every state, that it is the section's first
child, that the source does not gate it, and that the CSS cannot hide it. Tile
history, comparison boards and the Spyglass note all say simulated.

**Behaviour.** Flips ink in from the left over the hexagon (the room's print-in
wipe, with an a/b alternation so a tile can flip on consecutive turns) and are
outlined for the turn. The turn log is a `RuledFeed`; each turn goes to a polite
`Notice`, and the finish announces the verdict. Reduced motion skips straight to
the end state. Enter in a field plays; there is no key listener. Changing Map size
ends the round on screen and keeps finished runs in Compare runs (last three).
Compare sizes is offered only when the room owns the S/M/L boards.

**Layout.** The board needs height, so the verdict, replay, report and log sit in
the side column and the table's own heading is kept for screen readers only.
Boards over 60 tiles drop the house words from the hexes.

**What if.** One row of tools sits between the run controls and the board. *Redraw start* is a toggle that keeps its
place; while it is on, a brush palette (one brush per house, plus Unclaimed, and a Restore button that carries the
count) stands where the compare buttons were, so painting never costs the board a line. Pressing a hex, pressing Enter on a focused hex, or dragging across hexes repaints
the rehearsal's starting territory. The edits are an overlay of tile id to house id on one base board, so painting a
tile back to what it was removes the edit; the board that is played is rebuilt through `parseStudioBoard` and never
mutated. The Table and Spyglass views keep the untouched sample, a size change drops the edits, and a painted tile is
announced in the polite notice. Painting ends the round on screen and voids a crowd table made on the old start;
finished runs stay in Compare runs, marked "redrawn start". Arrow keys still only move focus in paint mode.
*Compare crowds* plays the same board, seed and turns at 30, 120 and 300 simulated viewers (each through the
setup door) and shows verdict rows with a Use button that puts that crowd in the form. Both comparison tables also
say how twelve seeds ended ("Across 12 seeds: 9 stalemate, 3 tight", `rehearsal-sweep.ts`), because one seed can mislead:
on the sample board 30 viewers mostly stall and 300 mostly run away. *Compare sizes* plays the
redrawn start for the current size and the stock layouts for the others, and says so in the row.

**Reading the round.** Chokepoints (tiles that changed hands twice) carry a black diamond on the board as soon as
they qualify, so the contested ground can be found and redrawn; the count in the report uses the same function.
Territory by turn is a stacked column per turn in the house inks. The inks are the repo's locked tokens: the
colour-blind separation passes, but the gold is pale on paper (1.83:1), so segments carry an inked edge, the
legend names each house, each segment has a tooltip and the same numbers are a table for screen readers.

**Kit note.** The kit's `primary` button variant hides its label on hover in the
paper theme (hover text and fill are both `--press`); this view uses `plate`.
The kit is another package, so it is reported here, not changed.

## WP7: Tiltyard host (2026-10-31)

Fixture mode adds Tiltyard after Table and Spyglass as a third native pressed
button. The choice is local React state and never changes the hash. Table and
Spyglass keep their contents and session state; the table is unmounted while
the duel is shown. Core mode retains the bare-map empty state and shared slot.

`tiltyard-view.tsx` is a separate React.lazy import. It supplies the parsed SAMPLE
lists, simulateChatPages and tiltyardWords to the shared stage. The view row shows
“The duel component · hosted as a Map Room view” beside “Sample items · simulated
chat”. The active room uses one full-width grid column; the unchanged inspector,
ladder, drafts and shared seal slot follow below, accessible by room scrolling.

The host adds no key handler. The stage consumes live Escape with preventDefault
and stopPropagation, calling off the duel while retaining the Map Room. Enter
reopens it. Escape on the placed board falls through to the existing shell back
dispatcher, which already checks defaultPrevented. Enter and live Escape
intentionally shadow the shell open/back bindings while the stage has focus.

Validation from the worktree root, with no install or browser launch:

- `pnpm --config.verify-deps-before-run=false --filter @castle-control/desktop typecheck`
  and `lint` exit 0; both walk 194 source files.
- The same prefix with `test` exits 0: 733 tests in 73 files. The five new
  server-render cases check the host labels, stage, three switch states, default
  54-tile table, lazy import and core fallback. No existing test line changed;
  no existing two-button-switch assertion was present to update.
- The same prefix with `build` exits 1 at the new duel budget. First-load output
  is unchanged from the measured base: 7 files, 370818/393216 bytes (delta 0).
  Duel output is 2 files, 84750/49152 bytes: 56971 JS + 27779 CSS. The 48 KiB
  limit remains enforced; reducing the shared duel is outside this host scope.
- `e2e/journey-tiltyard.spec.ts` covers all three modes, theatre skips, seven
  decided matches/eight final places, live Escape/reopen, barred ballots, a
  streamer call with frozen before/after tally numbers, ten hill rungs, idle
  Escape to the keep, and return to the 54-tile Table. It uses guardPage and the
  existing reduced-motion configuration. Browser execution is unrun by owner
  instruction: the Director runs this journey at both configured viewports.
- `node scripts/check.mjs` exits 0: boundaries/hygiene/file-cap each walk 915
  files; secrets walks 1342. Every changed file is below 400 lines.
- `pnpm --config.verify-deps-before-run=false exec tsc -p e2e/tsconfig.json --noEmit`
  and `exec eslint e2e/journey-tiltyard.spec.ts --max-warnings 0` exit 0.
- `pnpm --config.verify-deps-before-run=false exec playwright test -c
  e2e/playwright.config.ts e2e/journey-tiltyard.spec.ts --list` discovers two
  cases in one file, without starting a server or browser.
- The UI keymap suite passes all three cases and reports zero conflicts,
  including live/verdict Escape consumption and idle/done Escape fallthrough.

The merged Map view switch is Table, Spyglass, Rehearse, Tiltyard, in that order.

## D5c: core-owned Chat tournament

Core-mode Tiltyard now uses the core stage and turn contracts; its Chat picture
persists across room visits and matches the Duel browser source. Showdown and
Ladder remain explicitly local demos; fixture mode retains the TS engine.
See [TILTYARD_LIVE.md](TILTYARD_LIVE.md) for the adapter, action/source behavior,
acceptance-test inventory and Director verification still required.
