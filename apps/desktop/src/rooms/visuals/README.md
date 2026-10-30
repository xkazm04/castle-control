# Beacons · C Plates (WP 3.3 polish, 2026-10-30)

Reconciled at `683b0f6`: the earlier two-column room was still present. The
binding pick is `prototype/polish-2026-10-30/visuals/variant-c.html`; acceptance
pictures are `_shots/visuals-c-paper.png` and `_shots/visuals-c-stock.png`.
The Lot and Gatehouse C ports and the kit's Beacons reconciliation column are
the worked references. This delivery changes only the permitted Beacons paths.
No registry subjects were named by this brief.

## Structure and component map

`room.tsx` renders one `visuals-board` scroll, in this order: the three plates,
the tuning bench, then `visuals-room-details visuals-panels`. The lower row
holds the 60-offering timeline, the separate 600-event feed and the exact seal
slot node supplied by the shell. There is no competing workbench scroll and no
disclosure hiding test fire. Plates stay first at 1280x800. At the prototype's
1100px breakpoint the bench/lower row stack; at 900px the plates stack.

| C prototype component | Product component / room class |
| --- | --- |
| cc-board | visuals-board |
| cc-plates | BeaconPlates / visuals-plates, role=radiogroup |
| cc-plate | Plate choice, selection=radio, ink=or, offset space-6 |
| cc-plate-chief/state | PlateBand chief / visuals-plate-state |
| cc-plate-name | visuals-plate-name |
| cc-plate-art | visuals-plate-art / BeaconArtwork hero / selected ProposalLayers |
| cc-plate-row/figure | visuals-plate-row / HeroReadout numeric, ghost=none |
| cc-stair/step | visuals-stair / visuals-stair-step |
| cc-plate-meta/foot | visuals-plate-meta / visuals-plate-foot |
| cc-chip or/dash | StatusChip or/dash |
| cc-bench/chief/status | Plate plain / PlateBand bench / status span |
| cc-bench-grid/bay/title/gloss | visuals-bench-grid / BeaconBay / SectionHeading plain |
| cc-field/select/unit | FieldGroup select / InputPicker / visuals-native-unit |
| cc-curve/area/svg/band/line/now/marker/x | KindlingCurve / visuals-curve* and visuals-room-curve* |
| cc-fire-grid/btn/out | visuals-fire-grid / InkButton wrap (first offset or) / visuals-fire-output |
| cc-panels | visuals-panels, retaining visuals-room-details for the shell test |
| cc-panel/head/body | HeraldicCard panel / CardHead / CardBody |
| cc-panel-seal | SealPanel / visuals-seal-panel, with no inner frame or padding |
| cc-tl-svg/rule/mark, cc-axis/range/readout | OfferingTimeline and its existing hooks / visuals-room-timeline* / visuals-readout |
| cc-feed/row/qty/what/time/for | RuledFeed / WindowedRows / RuledRow amount and its mark/text/trailing/detail slots |
| cc-mono/small/note | Local metadata, readout and visuals-note styles |
| shell-seal-slot | Unchanged shell node, supplied once |
| Rampart, header, dock, Sample draft, Paper/Stock switches | Not ported; fixed shell owns the product equivalents |

`beacons-copy.ts` owns new/changed copy. Room-local styles remain under this
folder; no kit or token file changes. The bench chief uses the kit's non-flipping
press/cream/or inks. Its cream 'Tuning' prefix is generated from a copy-owned
custom property; the selected name remains or. No raw colour or pixel CSS values
are introduced. The existing SVG geometry and six-unit hero crop margins remain
unchanged; C's xMidYMax meet alignment replaces the earlier top alignment.

## Interaction and safety

Exactly one plate is checked and tabbable. Left/up and right/down wrap selection
and focus; Home/End select endpoints; Enter/Space select. Modified/composing keys
are ignored, and local navigation does not reach the shell keymap. Every plate
uses its own intensity. Stair --from/--to are unitless data set inline, with a
gules current-position rule at --frac. No new intensity engine is introduced.

The preview port and fixtures are unchanged. Gifts/subs and the explicit clock
update only local preview accounting. End test fire resets the preview. The
60 fictional offerings remain separate from those events. All simulated,
not-on-air, money-only and hold-to-seal notices remain. Drafts mirror the shared
queue only in selected art, never create another seal control or alter totals.

Core mode uses the same plates, bench and lower panel structure, retaining the
connection states, visual editor, point dragging/keyboard edits, native source
picker, per-visual browser-source copy and optional art confirmation/cost receipt.
Its live feed and synthetic simulation feed remain separate and virtualised.
No fixture rows or live totals are substituted. A core simulation may supply a
labelled blaze; it supplies no contribution total, so the ramps stay unmarked.
Missing connections retain the exact existing unavailable text and no fixture
controls. No new RPC identifier, transport, credential, dependency or paid call
is introduced.

## Forced differences from the fixture prototype

- Public kit names replace conflicting source names: C panels are cc-card,
  not the kit's existing numbered cc-panel. Chief bands/readouts use the kit's
  phrasing markup, and on/off copy follows React state rather than hidden twins.
- The radio handlers add required arrow/roving focus and Home/End behavior
  missing from the prototype; native activation and all action handlers remain.
- Field audit wins: the input select uses rule-thin solid ink on all four sides,
  rather than C's rule-strong. Core numeric/text inputs keep appearance:none and
  the same thin borders. The bay hides only the duplicate FieldGroup label
  visually; its native control remains labelled.
- The existing artwork wrapper and shared read-only ProposalLayers markup stay
  inside selected plate art. A plate expands when drafts exist so no draft,
  amendment or provenance is clipped. ProposalLayers' two shared files are
  unchanged. There are no actions nested in a plate.
- WindowedRows retains the sole row roles and virtual spacers. A presentational
  room wrapper preserves each existing whole-row data hook; RuledRow supplies
  cells. The outer rule is removed locally to avoid doubling it. Amount rows
  are rowHeight*1.5 (48px), with the original per-row simulated provenance and
  receipt timestamps retained, beyond the prototype's shorter detail line.
- SealPanel is a room-local div, rather than HeraldicCard's article, so the
  read-only shell assertion still sees </aside></div></div>. Only the prototype
  border/card fill is drawn by the frame. The slot itself receives the specified
  space-12/14/14 inset and no top rule or extra wrapper padding.
- Core has no live blaze/total or illustrative timeline. It therefore labels
  unavailable measurements honestly and uses the first lower panel for its
  retained source/optional-art controls. Its middle lower panel keeps live and
  simulated feeds separate. Editable curve and source-unit burst forms remain
  in the bench. No fake clock/end controls or fixture state are supplied to core.

## Verification

New C structure checks failed before implementation (no radiogroup or bench).
Component/handler tests cover exactly one checked radio, roving focus/wrapping,
Enter/Space, per-plate art/crops/intensities, inline stair ramps, fixed chief inks,
field border policy, selected draft placement and exactly one shared hold.
Updated structural assertions explain the C replacement without dropping
behavioral checks. The unchanged shell regression suite passes.

The desktop and UI package typecheck, lint and test scripts pass using
`pnpm --config.verify-deps-before-run=false --filter <package> <script>`.
Final test counts and command evidence are in the external builder result.
No install, git write, build, browser, e2e, network or live action was run.
The Director owns build/budgets/full gate and side-by-side browser comparison
against both acceptance pictures at 1440x900 and 1280x800. Component tests are
not a claim of browser fidelity, mounted focus, OBS delivery or live acceptance.
