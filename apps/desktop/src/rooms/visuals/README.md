# Beacons · C Plates (WP 3.3 polish, 2026-10-30)

## L3 accessible select names, 2026-10-31

Decay and the core simulation's Input source use standalone labels linked to
React-generated select IDs. Their existing grid spacing and visible copy stay
unchanged. Static-markup regression cases failed first for both controls, then
passed with exact label text, matching select IDs and no label nesting. The
unchanged Playwright journey remains the Director's browser accessibility proof.

## L3 streamer journey, 2026-10-31

Open `#/chamber/visuals` without a native launch (fixture mode). Pick a plate
with click or the existing radio keys. The bench now exposes the existing curve
model through labelled points, numeric ranges, decay/half-life and gift-sub
weighting. Dragging changes the selected preview immediately; release saves
locally. Arrows/Shift+arrows edit, Enter saves and Escape restores the last local
save without reaching shell navigation. Accounting and other visuals stay intact.
Each editor stays bound to its original visual; late local save completion after
switching plates cannot replace the next visual's curve (proved red then green).
The 50-gift test adds exactly 50 SIMULATED rows. The explicit 60-second clock
applies decay; End test fire resets test accounting/feed/clock while retaining
the selected visual, curves, routing, weighting and appearance settings.

The new appearance preview has kit-labelled native controls for S/M/L size,
anchor, token ink (gold/red/blue/key), and burst duration (integer 0–60000 ms).
Altar art consumes the six kept `styles` and `art(style, 'altar')` from the demo
model read-only. Other shapes retain their existing artwork and do not expose
an ineffective art-style picker. Size/anchor affect placement; ink colours the
preview glow; intensity controls its opacity; a test burst starts a duration-
controlled highlight. Reduced motion disables the highlight animation.

Appearance is a per-visual room-session map in fixture and connected core mode.
`Visual` has no `size`, `anchor`, `colour`, `art_style`, `burst_ms` or
`gift_weight` fields. No unsupported field is sent to an RPC. Core curve editing
still saves ranges and decay through `beacons.curve.set`; existing visual
creation/input editing stays on `beacons.visual.upsert`. Fixture curves and
gift weighting remain local. Leaving the room discards this session state.
Only the existing core simulation supplies a core preview intensity; missing
live measurements still say unavailable.

Fixture Copy browser-source URL copies the pre-existing validated
`fixture-not-live` example and explicitly says it is SIMULATED and not a live
source. Core copy still calls `beacons.source.url` unchanged. Its confirmation
names the captured visual and says to paste into an OBS browser source, even if
selection changed while the clipboard was pending. Capability URLs never enter
the read snapshot or confirmation text. Denied clipboard access reports failure
and requires an explicit retry. Optional paid art remains hidden without a key;
the kept sample-art picker makes no paid call.

### Verification and handoff

`e2e/journey-beacons.spec.ts` was written before implementation. It reuses the
unaltered network and style audits and walks selection, keyboard/pointer edits,
decay, weighting, all appearance parameters, test fire, virtual feed, decay
clock, copy confirmation and configuration-preserving End test fire at both
configured viewport sizes. The Director runs Chrome; no browser or OBS pass is
claimed by the builder. Expected-red base assertions: no fixture curve form or
point controls, no weighting/appearance controls or kept altar image, no fixture
copy action/confirmation, and End test fire discards configuration.

The first Vitest run recorded five new failures (four journey assertions plus
visual-specific core copy feedback), with nine existing source-copy tests green.
New handler/model tests additionally cover immediate drag intensity, save/cancel,
unchanged accounting, all six art URLs, per-visual session isolation, invalid
parameter rejection and clipboard failure. All existing Beacons tests are kept.
Desktop typecheck/lint and e2e TypeScript validation pass. Final narrowed test
counts and exact commands are recorded in external `result.json`.

Lane L5 still owns renderer/scene/overlay output. These local parameter controls
do not change OBS. Persisting/rendering the missing fields requires a separate
contract delivery and L5 integration; no overlay bundle, demo, kit, token,
contract, dependency or Rust file is changed here. No install or git write ran.

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

## beacons-B: saved atlas presets reach the OBS host

Reconciled at `2bb2423`, including beacons-A preview sessions and obs-A's page
table. The existing Art style choice now saves the visual's `design_id` rather
than a session-only `art_style` substitute. `demo/model.ts` remains the single
desktop list of six styles. Each offers an altar and the provisional `frame2`
camera frame. The picker also offers No design (neutral) and Custom design ID.
Saving in core mode uses the existing `beacons.visual.upsert`; a custom ID still
needs a verified native import before OBS can show it.

The fixture uses the same picker and saves through its local Beacons port. The
small `design` method in `beacons-model.ts` validates with the existing visual
schema, replaces only the selected visual's design and publishes the fixture
snapshot. `room.tsx` supplies that fixture port to the appearance component;
`core.tsx` and `beacons-core.ts` are unchanged. Save visual style locally keeps
the existing SIMULATED labels and sends nothing to OBS. Size, anchor, colour and
burst timing remain session previews. End test fire preserves the saved design.

Native core lazily installs only selected built-ins before a visual commit and
reinstalls saved preset IDs at startup. `include_bytes!` reads the existing atlas
WebPs; no image is extracted to disk and no binary asset is added. Embedded
metadata re-enters the schema door; exact image inventory, MIME and byte limits
are checked before hashing. Built-ins use the same consent/capacity/publication
gate as imported packages and are never registered as paid-art destinations.
Altar opacity runs 0.35–1 and scale 0.9–1.05; frames use opacity 0.25–1. Desktop
art follows those same bindings, while non-preset IDs retain the existing SVG.

`cargo test -p cc-core beacons_presets` covers native URL/hash/snapshot/image
byte equality, unknown-design withholding, restart hash stability without loose
WebPs, zero provider calls for preset art generation, and all twelve IDs, asset
URLs and dimensions. Its parity test evaluates the real TypeScript catalog
with the existing repo compiler, then compares it with native snapshots and
WebP headers. Desktop tests cover saved/neutral/custom choices, the single
style list, object labels, unchanged SVGs, fixture saves and unchanged accounting.
The asset and artwork regressions were red on base before implementation.

The Director-approved test updates change only the art-style journey step to
save pixel: `journey.test.tsx` has 14→15 `expect` call sites (29→30 checks when
its label loops are expanded); `e2e/journey-beacons.spec.ts` has 19→20. All other
assertions, including every SIMULATED label check, remain. The Playwright run
was attempted but stopped at `spawn EPERM` before workers/browser startup; it
is not a browser pass. Exact final gate results are in external `result.json`.
No live Twitch, OBS connection, provider call, dependency install or git write
is part of this delivery.
