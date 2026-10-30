# Shared UI kit

The public entry is `@castle-control/ui`. Components own their co-located CSS,
use generated tokens, and accept caller data and copy without importing a
desktop fixture, contract or command port.

The WP 1.7 promotion adds:

| Export | Caller responsibility |
| --- | --- |
| `WindowedRows`, `rowWindow`, `rowHeight` | Stable row keys, accessible table label, fixed-height row content, optional empty-state copy. Heights default to the row token; larger review rows pass a multiple. Reset the component key when filtering. |
| `ConsensusChart` and its props/data types | Labelled snapshots with time series, window length, direction shares, preformatted change labels, accessible chart descriptions and summary copy. Selection remains local and read-only. |
| `ReviewRow` | Heading, original quote, detail, actions and optional children. Quotes remain focusable and scrollable; action handlers stay with the caller. |
| `RoomStatusHero` | Status labels, values, details and an optional action slot. |
| `ReplaySummary` | Ordered, labelled counts or other display values. |

Desktop moderation files retain contract shaping, Gatehouse vocabulary,
simulation notices and local operations. The duplicate desktop window module
was removed; the chart file remains a domain adapter. The existing `RuleTable`
has its own window calculation and did not already export the promoted API.

Run the Vite `kit` entry with the package's `dev` script. Both paper and stock
galleries contain all five components, including 10,000 generated entries,
scrollable original quotes, a chart with filters/direction selection, its empty
state and simulated action buttons. The new gallery section is lazy-loaded to
retain the existing kit first-load budget; no dependency or budget was added.

Verification uses the existing package scripts with
`pnpm --config.verify-deps-before-run=false --filter @castle-control/ui` (and
`@castle-control/desktop`). `promoted.test.tsx` renders every component and both
gallery themes, proves 16 rendered rows at the start/middle/end of 10,000 entries,
checks spacer geometry and tests the chart's empty state. Desktop tests preserve
the 4,200-line proof, original-message review and simulated replay behavior.
These are server-rendered markup checks; browser screenshots and mounted scroll
interaction are not claimed.

Validated on this worktree: UI typecheck/lint/build and 72 tests passed; desktop
typecheck/lint/build and 43 tests passed. Lint included boundaries, cycles,
hygiene, the file cap and secrets. Kit first load is 255,589 / 262,144 bytes;
desktop first load is 354,323 / 393,216 bytes, with the moderation page still a
separate lazy chunk. The initial five new tests failed before the public exports
existed, then passed after promotion. A multi-package pnpm typecheck invocation
failed at its lifecycle wrapper with `spawn EPERM`; the individual package
typecheck commands above both passed. Full workspace/Rust merge checks remain
with App Master; no Rust or contract file changed.

## Heraldic kit (owner's C picks, 2026-10-30)

Reconciled against main `4e81bf4`. No existing shared plate/stamp/readout family
was present. `55978d1` supplied the original controls and numbered panel;
`d09bec6` supplied WindowedRows; `e8807a2` supplied the field chrome. Those
defaults remain intact. This delivery changes no desktop or prototype path.
The binding source is `prototype/polish-2026-10-30/PICKS.md` and the four C
files, including their PORT NOTES. No registry subjects were named by this brief.

### Public vocabulary

Import from `@castle-control/ui`; it installs the opt-in control styles as well
as component styles. The kit's internal eager entry imports the original
controls directly; the deferred gallery imports their opt-in styles. Do not
deep-import internal modules from other packages. No dependency or token changes.

| Component | Vocabulary and contract |
| --- | --- |
| `Plate`, `PlateBand`, `PlateBody`, `PlateActions` | `cc-plate`, `cc-plate-band/title/gloss/count/body/actions`. Static section/article/div, or `selection="radio" checked={boolean}` for a native button with `role=radio`. `variant="choice"` supplies the selected chief/shadow treatment. Radio groups, roving focus and selection state belong to the caller. Band variants: standard, chief, hero, bench, seal. A radio uses the chief's phrasing markup; do not nest controls inside it. |
| `StageFrame` | `cc-stage`, four `cc-crop[data-corner]`; `variant="stage"` or `"print"`. Keeps flex:1 and min-height:0. The caller supplies the content grid and keeps min-height:0 on every ancestor and image/content area. |
| `HeraldicCard`, `CardHead`, `CardBody`, `CardCopy`, `CardSide` | `cc-card` with `data-card=plain/raised/selectable/tablet/panel`, `data-tone=neutral/seal/bar`. `on_select` produces a native pressed button; `selected`, `current` and `locked` are separate states. `CardCopy` owns title/meta/reason; `CardSide` owns side/action. **Existing `cc-panel`/NumberedPanel is unchanged**: the C carded panel is `cc-card[data-card=panel]`, not a redefinition. |
| `StatusChip` | Existing `cc-chip` is unchanged without `stamp`. `stamp="label"/"mode"/"verdict"/"draft"` adds `cc-stamp`; `tone=spot/solid/ok/warn/blocked` selects treatment. Stamp copy is required and rejects blank words. Use the same component for tags; no duplicate Stamp component. |
| `HeroReadout` | `cc-hero-readout`, `cc-hero-figure/caption`; `scale=display/viewport/numeric`, `ghost=shadow/overprint/none`, `caption_style=serif/label`, `unit` and `figure_size` token. Figures are caller-formatted strings. |
| `MedalList`, `Medal`, `NumberedDiscs` | `cc-medals`, `cc-medal/disc/copy`, `cc-numbered-discs`. Medal value accepts struck/re-inked content; numbered items have stable ids, title and description. |
| shared offset | `cc-offset-shadow`; a single `--cc-offset-shadow` expression driven by `--cc-shadow-ink` and `--cc-shadow-offset`. Plate, raised/selected card, offset InkButton and large SealButton all use it. No blur or softened shadow. |
| `RuledFeed`, `RuledRow` | `cc-feed`, `cc-ruled-row`, `cc-feed-mark/text/trailing/detail/actions`. Layout line/amount/entry. Inside WindowedRows, the wrapper is presentational, its slots are cells, and WindowedRows owns the sole row. Pass row_height=rowHeight for line, rowHeight*1.5 for amount, and a fixed taller multiple for entry. Use `--cc-feed-row-height` when overriding; no extra row role. |
| `SectionHeading` | `cc-section-heading`, `cc-section-gloss/count`, title data-text ghost. Plain/banner/inline/ruled variants; heading level 2 or 3, optional id. |
| `Pennant` | `cc-pennant`; flag (swallow-tail + word) or standing (left ink stripe + count + word). Blank words are rejected. Ink alone never communicates the outcome. |
| `Ribbon` | `cc-ribbon`, label/word/note; notched ink banner with labelled status and a signal disc. |
| `InkButton` additions | `size=room` (32), big (44 minimum), wrap (32 minimum, two-line copy). `variant=offset` adds the hard shadow, `pass/bar/shield` supply the two-up/emergency treatments. New `cc-heraldic-button` opt-in only. Normal/small/icon defaults and existing variants are unchanged. |
| `SealButton` addition | `size="large"` retains the same hold state machine, cancellation and progress, adds display caps and the shared shadow. Normal markup and disabled treatment remain unchanged. |
| `ProposalCard` addition | `compact` keeps title, revision, stamp and authorization actions; omits fields and proof hash. Busy, seal_at_monitor and revision-remount behavior are preserved. Default markup is unchanged. |
| `ShieldCharge` | `cc-shield`, `cc-shield-charge`; question, cup, struck-coin. Decorative inline SVG; put the content's name next to it. Selected card fills the shield in caller ink. |
| `FieldGroup` | Opt-in `cc-field[data-field=input/select]`, hint/result. Caller supplies the labelled control id and children. The original cc-frame field style is unchanged; the new selector only applies under an explicit FieldGroup. |

`PrintOptions` uses generated token **names**: `ink`, `offset`, `shadow_ink`,
`border_ink` (for example `ink="azure" offset="space-8"`). `PrintStyle`
accepts token-valued `--cc-*` overrides for differences not covered by a prop.
Set band colours on Plate or PlateBand; set body padding on Plate or PlateBody.
Inline overrides win over component defaults. Token values must stay tokens,
color-mix of token inks, or calc of token sizes; no raw colours/pixel values.

The button selector `.cc-button.cc-heraldic-button[data-size]` (specificity
0,3,0), the radio plate selector (0,3,0), and `.cc-card.cc-card` (0,2,0)
beat `.shell-room :where(button:not(.cc-seal-button))` (0,1,0), independent of
stylesheet order. They explicitly own font, border, background, colour and
padding. No shell ancestor name is needed in the kit. SealButton remains
excluded from that shell reset.

### Literal value reconciliation

Use these settings in the later chamber ports; values are not averaged.
An em dash means that primitive is absent in that C prototype. The default is
the modal value where there is one; variants retain the different structures.
Spacing below names generated tokens (the numeral is not a new CSS literal).

| Property / setting | Kit default | Lot Chamber (lottery C) | Gatehouse (moderator C) | Beacons (visuals C) | Map Room (studio C) |
| --- | --- | --- | --- | --- | --- |
| ink | ink | gules | azure | or | key, or caller house ink; unclaimed paper-2 |
| primary plate border | rule-strong ink | stage: rule-strong gules | rule-strong ink | rule-strong ink | rule-strong rule (`border_ink="rule"`) |
| plate shadow offset | space-6 | — (selected cards space-4) | space-8 (`offset="space-8"`) | space-6 | space-6 |
| plate shadow ink | caller ink | — | azure | hair-2 idle; or selected (`variant="choice"`) | house ink; unclaimed hair (`shadow_ink="hair"`) |
| band structure | standard | — | standard: title 22, gloss 13, count 40 | chief: label 13, padding space-6/14; selected or | hero: title 19, boxed label 13; seal: title 17 |
| band fill / text | caller ink / press | — | azure / press | chief paper-2/ink-2 idle, or/press selected; bench press/cream, or title | house/press; unclaimed paper-2/ink; seal key/paper |
| band/body padding | band space-8/14; body space-14/16/16 | — | default | choice no body padding, child inline margins space-14; bench band space-8/16 | hero body space-14; seal body space-12/14/14 (`--cc-body-padding`) |
| secondary card | plain: rule-medium ink; pad space-12/14; no shadow/radius | raised: pad space-14/16, r-md, hair-2 shadow space-4; seal dashed strong gules/no shadow | plain; bar tone gules top space-5; rule layout room-local | panel: rule-medium ink; head space-8/14, paper-2; body space-12/14/14 | tablet: strong rule, pad space-8/10/10, minimum space-56*2; current key/paper; locked dashed; selected rule outline space-3 |
| selectable card | selectable: space-4 hair-2 shadow, r-md | selected gules border/shadow, 40-wide shield; hover space-5 hair | — | radio is Plate choice | tablet selected outline, separate from current state |
| stamp | label: strong solid ink-2; pad space-4/8; r-sm; air-rotation | label; spot gules-text; verdict pad space-3/7, -3deg, ok border/ink text; blocked danger | mode: air-h 30, dashed azure/azure-text, display 17; armed solid azure/press | reuse ordinary StatusChip or/dash | draft: plain 13px UI label, no border/rotation |
| hero figure | display text-title (54), shadow title-ghost, caption serif 19 | viewport clamp(72,11.5vh,104), .8 line height, overprint ghost space-4 | display 54, ghost none, unit 22, label caption | numeric text-chamber*1.9 (41.8), .9 line height, no ghost, .45em unit | display 54, shadow title-ghost; inline swatch/subreadout remains local |
| medal / numbered discs | 40 / 34 | gules-ringed medal 40, number16; four 34 discs, dashed links | — | — | — |
| feed row height | row-h (32) | — | line row-h; ledger entry uses fixed caller height when windowed | amount row-h*1.5 (48), line rule, qty box34 wide/26 high | — |
| section heading | plain display17, no ghost | banner display30, ghost space-2, gloss15, grouped flex header | plain display17, gloss13, count13 mono | plain display17; bay heading gloss13; panel uses CardHead | inline/ruled display22; inline gloss15; ruled count13 UI |
| pennant | flag width8, row-h minus space-10 tall | — | flag hold=or, bar=gules, pass transparent (caller sets ink via style); always word | — | standing left stripe space-10, count22; unclaimed stripe hair/dashed via style |
| ribbon | ink/paper, notches space-14, pad space-10/28 | exact default, signal ok/warn/danger | — | — | — |
| room / big / plate buttons | room32 / big44 / offset shadow3 | room: paper, horizontal pad12; large seal text19, r-md, ink shadow4 | big44 strong border; pass azure/press, bar gules outline, shield danger; small big uses room size + big styling override | wrap32 minimum, card fill, pad6/10, two-line copy; offset or/press shadow3 ink | original InkButton unchanged |
| field | input36, paper, medium ink border, mono14 | default input group; hint/result | original frame inputs | select40, strong ink border, card, UI14; native unit and picker layout local | original frame inputs |

For a smaller big action use `size="big"` with token overrides on `style`
(`minHeight: 'var(--button-h)', fontSize: 'var(--text-label)'`). To remove a
plate shadow use `variant="plain"`. For a hero band's unclaimed state pass
`ink="paper-2" shadow_ink="hair"` and `--cc-band-text:var(--ink)`.
For a key band use `--cc-band-text:var(--paper)`; do not put press text on key.
For a key button use `--cc-button-text:var(--paper)`. A plain heading's leading
can be set with `--cc-heading-leading` (1.1 default; Beacons bay headings use 1.2).
The prototypes' press-on-gules band is only AA as large bold copy; retain their
small-copy card/scroll treatment rather than introducing smaller text on it.

### Forced structural differences and room responsibilities

- Conflicting `.cc-hero` names become Plate (container) versus HeroReadout
  (figure); conflicting `.cc-banner` names become SectionHeading versus
  room-local filter buttons. This changes names only, not design values.
- Carded C panels use `cc-card[data-card=panel]`; existing `cc-panel` keeps its
  original numbered-panel design. Generic body/copy wrappers replace per-room
  class names. No port is authorized to redefine existing kit defaults.
- WindowedRows owns the outer row and virtual spacers; RuledRow's inner wrapper
  uses role=presentation and labelled cells instead of nesting a second row.
  It removes the outer row's border only when a RuledRow is its direct child,
  avoiding a doubled rule. Ledger rows need a fixed taller caller height.
  Fixed rows clip overflow to avoid painting over a neighbor; expose long
  original content in the caller's detail view and choose an adequate row height.
- Chief bands use span/b content inside radio buttons instead of section
  headings; callers must use phrasing content and cannot nest actions in radios.
- The viewport hero's rem bounds are expressed as token calc(36*2) and
  calc(56+24*2), preserving 72/104 at the prototype's baseline. 11.5vh is retained
  because the prototype explicitly depends on viewport height; no new token.
- Crop frames omit the source's domain grid areas. The caller supplies those
  classes/areas, all content, and the min-height:0 ancestor chain. Draw artwork,
  tickets, gauges, stairs, curves, hexes, tiles and room grids remain local.
- Compact proposals omit the proof hash as well as fields: this mode is the
  title/revision/action slot; full proof and re-inked values remain on the room's
  ticket. Authorization, busy state and seal hold behavior are unchanged.
- SVG shield geometry is retained as inline paths; it is decorative beside the
  caller's content label, and has no domain behavior or fixture imports.

### Gallery and evidence

Run the existing UI dev command. Screenshot `/#heraldic-paper` and
`/#heraldic-stock` at 1440x900 and 1280x800, scrolling through each ink sheet.
The gallery is `kit/heraldic-gallery.tsx`, loaded with React.lazy; it demonstrates
all primitives and both selection states in gules, azure, or and key, with
generated 10,000-row feeds and simulated controls. Arrow keys/Home/End move the
example radio focus/selection. Both themes remain in the original kit page.
The immutable first-load limit is 262,144 bytes; the build measures actual
initial JS+CSS, verifies all 122 generated tokens, and does not count deferred
gallery chunks as eager payload. No Vite or budget check was bypassed.

Server-rendered checks cover class vocabulary, print props, radio state,
word-bearing marks, compact actions/fields, unchanged default classes, both
gallery themes and fixed row windows. `styles.test.ts` now checks kit CSS as
well as source CSS. Browser screenshots/mounted interactions remain Director
checks; they have not been claimed by this builder.

Final builder checks, 2026-10-30, with
`pnpm --config.verify-deps-before-run=false --filter <package> <script>`:

| Check | Result |
| --- | --- |
| UI typecheck/lint/test | Pass; 70 TS/TSX files; 19 test files, 305 tests |
| Desktop typecheck/lint/test | Pass; 110 TS/TSX files; 34 test files, 308 tests |
| Shared lint checks | Pass; boundaries/hygiene/file-cap walked 693 files, secrets walked 870 |
| UI build | Pass; 261,338 / 262,144 initial JS+CSS bytes; all 122 token definitions retained |
| Red-first evidence | Initial eight heraldic tests all failed before the exports/opt-ins existed; the final 11 heraldic tests pass |
| Scope and whitespace | Only packages/ui changed; git diff --check passed |

The first Vite build exceeded the budget (265,626 bytes); moving the opt-in
styles behind the lazy gallery fixed it without raising the limit. Vite did
not encounter EPERM. No install or network operation was run. Full pnpm gate,
desktop build and browser/e2e checks are reserved for the Director by this
brief; no e2e command or git write was run.

### Prototype class map

Every class in the four complete source files is listed below (including the
fixed shell and prototype controls). Each row is one source class, not a
recommendation to copy CSS. `room-local` means retain its geometry, wording or
layout in the chamber port; **fixed shell** means do not port that copy at all.
Existing shared shell classes map to their current components, unchanged.
Where a source name means different things, the chamber-specific mapping wins.

| Source class | Lot C | Gate C | Beacons C | Map C |
| --- | --- | --- | --- | --- |
| `cc-actions` | room-local | ? | ? | ? |
| `cc-aside` | room-local | ? | ? | ? |
| `cc-axis` | ? | ? | room-local | ? |
| `cc-banner` | cc-section-heading (SectionHeading banner) | room-local (verdict filter button; not SectionHeading) | ? | ? |
| `cc-banner-head` | ? | ? | ? | cc-section-heading (SectionHeading inline) |
| `cc-banners` | ? | room-local | ? | ? |
| `cc-bay` | ? | ? | room-local | ? |
| `cc-bay-title` | ? | ? | cc-section-heading (SectionHeading plain; caller gloss) | ? |
| `cc-bench` | ? | ? | cc-plate (Plate plain; paper background via style) | ? |
| `cc-bench-chief` | ? | ? | cc-plate-band (PlateBand bench) | ? |
| `cc-bench-grid` | ? | ? | room-local | ? |
| `cc-bench-status` | ? | ? | room-local | ? |
| `cc-big-button` | ? | cc-button cc-heraldic-button (InkButton big; pass/bar/shield) | ? | ? |
| `cc-blazon` | cc-card (HeraldicCard selectable) | ? | ? | ? |
| `cc-blazon-act` | cc-card-action (CardSide action) | ? | ? | ? |
| `cc-blazon-body` | cc-card-copy (CardCopy) | ? | ? | ? |
| `cc-blazon-meta` | cc-card-meta | ? | ? | ? |
| `cc-blazon-reason` | cc-card-reason | ? | ? | ? |
| `cc-blazon-side` | cc-card-side (CardSide) | ? | ? | ? |
| `cc-blazon-title` | cc-card-title | ? | ? | ? |
| `cc-blazons` | room-local | ? | ? | ? |
| `cc-block` | ? | room-local | ? | ? |
| `cc-board` | ? | ? | room-local | ? |
| `cc-brand` | existing Rampart (fixed shell where copied) | existing Rampart (fixed shell where copied) | existing Rampart (fixed shell where copied) | existing Rampart (fixed shell where copied) |
| `cc-bridge` | ? | room-local | ? | ? |
| `cc-btn` | cc-button cc-heraldic-button (InkButton room) | ? | cc-button cc-heraldic-button (InkButton wrap; offset where specified) | ? |
| `cc-button` | existing InkButton (unchanged) (fixed shell where copied) | ? | existing InkButton (unchanged) (fixed shell where copied) | existing InkButton (unchanged) (fixed shell where copied) |
| `cc-caption` | room-local | ? | ? | ? |
| `cc-card` | cc-card (HeraldicCard raised; tone seal where specified) | cc-card (HeraldicCard plain; tone bar where specified) | ? | ? |
| `cc-card-actions` | ? | room-local | ? | ? |
| `cc-card-quote` | ? | room-local | ? | ? |
| `cc-card-title` | room-local (static card title; not selectable CardCopy title) | ? | ? | ? |
| `cc-charge` | cc-shield-charge (ShieldCharge) | ? | ? | ? |
| `cc-chip` | existing StatusChip (unchanged) (fixed shell where copied) | existing StatusChip (unchanged) (fixed shell where copied) | existing StatusChip (unchanged) (fixed shell where copied) | existing StatusChip (unchanged) (fixed shell where copied) |
| `cc-chip-toggle` | ? | room-local | ? | ? |
| `cc-chip-toggles` | ? | room-local | ? | ? |
| `cc-col` | ? | room-local | ? | ? |
| `cc-copy` | room-local | ? | ? | ? |
| `cc-crop` | cc-crop (StageFrame) | ? | ? | ? |
| `cc-curve` | ? | ? | room-local | ? |
| `cc-curve-area` | ? | ? | room-local | ? |
| `cc-curve-band` | ? | ? | room-local | ? |
| `cc-curve-line` | ? | ? | room-local | ? |
| `cc-curve-marker` | ? | ? | room-local | ? |
| `cc-curve-now` | ? | ? | room-local | ? |
| `cc-curve-svg` | ? | ? | room-local | ? |
| `cc-curve-x` | ? | ? | room-local | ? |
| `cc-design-row` | room-local | ? | ? | ? |
| `cc-desk` | room-local | ? | ? | ? |
| `cc-disclosure` | room-local | ? | ? | ? |
| `cc-disclosure-body` | room-local | ? | ? | ? |
| `cc-draft` | ? | ? | ? | room-local |
| `cc-draft-rev` | ? | ? | ? | room-local |
| `cc-draft-stamp` | ? | ? | ? | cc-chip cc-stamp (StatusChip draft) |
| `cc-drill` | ? | room-local | ? | ? |
| `cc-feed` | ? | cc-feed (RuledFeed) | cc-feed (RuledFeed) | ? |
| `cc-feed-empty` | ? | room-local | ? | ? |
| `cc-feed-for` | ? | ? | cc-feed-detail | ? |
| `cc-feed-mark` | ? | cc-feed-mark | ? | ? |
| `cc-feed-qty` | ? | ? | cc-feed-mark (RuledRow amount) | ? |
| `cc-feed-row` | ? | cc-ruled-row (RuledRow line) | cc-ruled-row (RuledRow amount) | ? |
| `cc-feed-text` | ? | cc-feed-text | ? | ? |
| `cc-feed-what` | ? | ? | cc-feed-text | ? |
| `cc-field` | cc-field (FieldGroup) | ? | cc-field (FieldGroup) | ? |
| `cc-field-hint` | cc-field-hint | ? | ? | ? |
| `cc-field-result` | cc-field-result | ? | ? | ? |
| `cc-field-row` | ? | ? | room-local | ? |
| `cc-figure` | existing Rampart (fixed shell where copied) | existing Rampart (fixed shell where copied) | existing Rampart (fixed shell where copied) | existing Rampart (fixed shell where copied) |
| `cc-figures` | ? | room-local | ? | ? |
| `cc-fire-grid` | ? | ? | room-local | ? |
| `cc-fire-out` | ? | ? | room-local | ? |
| `cc-gloss` | ? | ? | room-local | ? |
| `cc-group` | room-local | ? | ? | ? |
| `cc-hall` | room-local | ? | ? | ? |
| `cc-handle` | room-local | ? | ? | ? |
| `cc-handles` | room-local | ? | ? | ? |
| `cc-hash` | room-local | ? | ? | ? |
| `cc-heading` | ? | cc-section-heading (SectionHeading plain) | ? | ? |
| `cc-herald` | ? | ? | ? | room-local |
| `cc-herald-field` | ? | ? | ? | room-local |
| `cc-herald-side` | ? | ? | ? | room-local |
| `cc-hero` | cc-hero-readout (HeroReadout viewport, overprint) | ? | ? | cc-plate (Plate; caller house ink, border_ink rule) |
| `cc-hero-band` | ? | ? | ? | cc-plate-band (PlateBand hero) |
| `cc-hero-body` | ? | ? | ? | cc-plate-body (PlateBody; padding14) |
| `cc-hero-caption` | cc-hero-caption | ? | ? | ? |
| `cc-hero-figure` | cc-hero-figure | ? | ? | cc-hero-readout (HeroReadout display) + room-local swatch/subreadout |
| `cc-hero-hint` | ? | ? | ? | room-local |
| `cc-hero-house` | ? | ? | ? | room-local |
| `cc-hero-kicker` | ? | ? | ? | room-local |
| `cc-hero-note` | ? | ? | ? | room-local |
| `cc-hero-now` | ? | ? | ? | room-local |
| `cc-hero-sub` | ? | ? | ? | room-local |
| `cc-hex` | ? | ? | ? | room-local |
| `cc-hex-face` | ? | ? | ? | room-local |
| `cc-hex-house` | ? | ? | ? | room-local |
| `cc-hex-id` | ? | ? | ? | room-local |
| `cc-hexfield` | ? | ? | ? | room-local |
| `cc-hexfield-plate` | ? | ? | ? | room-local |
| `cc-hint` | ? | room-local | ? | ? |
| `cc-hold` | cc-seal-button cc-offset-shadow (SealButton large) | ? | ? | ? |
| `cc-inkbutton` | ? | room-local (fixed shell/prototype control; do not port) | ? | ? |
| `cc-keep` | ? | room-local | ? | ? |
| `cc-kicker` | room-local | ? | ? | ? |
| `cc-ladder` | ? | ? | ? | room-local |
| `cc-legend` | room-local | room-local | ? | ? |
| `cc-link-group` | existing Rampart (fixed shell where copied) | existing Rampart (fixed shell where copied) | existing Rampart (fixed shell where copied) | existing Rampart (fixed shell where copied) |
| `cc-live-group` | existing Rampart (fixed shell where copied) | existing Rampart (fixed shell where copied) | existing Rampart (fixed shell where copied) | existing Rampart (fixed shell where copied) |
| `cc-mark` | existing Mark (fixed shell where copied) | existing Mark (fixed shell where copied) | existing Mark (fixed shell where copied) | existing Mark (fixed shell where copied) |
| `cc-mark-gate` | existing Mark (fixed shell where copied) | existing Mark (fixed shell where copied) | existing Mark (fixed shell where copied) | existing Mark (fixed shell where copied) |
| `cc-medal` | cc-medal (Medal) | ? | ? | ? |
| `cc-medal-copy` | cc-medal-copy (Medal) | ? | ? | ? |
| `cc-medal-disc` | cc-medal-disc (Medal) | ? | ? | ? |
| `cc-medals` | cc-medals (MedalList) | ? | ? | ? |
| `cc-moat-figure` | ? | cc-hero-readout (HeroReadout display, ghost none, label caption) | ? | ? |
| `cc-moat-gauge` | ? | room-local | ? | ? |
| `cc-moat-row` | ? | room-local | ? | ? |
| `cc-moat-stops` | ? | room-local | ? | ? |
| `cc-moat-top` | ? | room-local | ? | ? |
| `cc-mono` | ? | ? | room-local | ? |
| `cc-note` | ? | room-local | room-local | ? |
| `cc-panel` | ? | ? | cc-card (HeraldicCard panel; never redefine cc-panel) | ? |
| `cc-panel-body` | ? | ? | cc-card-body (CardBody) | ? |
| `cc-panel-head` | ? | ? | cc-card-head (CardHead) | ? |
| `cc-panel-seal` | ? | ? | room-local | ? |
| `cc-panels` | ? | ? | room-local | ? |
| `cc-pennant` | ? | cc-pennant (Pennant flag + caller verdict word) | ? | cc-pennant (Pennant standing; caller house ink) |
| `cc-pennants` | ? | ? | ? | room-local |
| `cc-plate` | ? | cc-plate (Plate) | cc-plate (Plate choice radio) | ? |
| `cc-plate-actions` | ? | cc-plate-actions (PlateActions) | ? | ? |
| `cc-plate-art` | ? | ? | room-local | ? |
| `cc-plate-band` | ? | cc-plate-band (PlateBand standard) | ? | ? |
| `cc-plate-band-gloss` | ? | cc-plate-gloss | ? | ? |
| `cc-plate-band-title` | ? | cc-plate-title | ? | ? |
| `cc-plate-body` | ? | cc-plate-body (PlateBody) | ? | ? |
| `cc-plate-chief` | ? | ? | cc-plate-band (PlateBand chief) | ? |
| `cc-plate-count` | ? | cc-plate-count | ? | ? |
| `cc-plate-figure` | ? | ? | cc-hero-readout (HeroReadout numeric, ghost none) | ? |
| `cc-plate-foot` | ? | ? | room-local | ? |
| `cc-plate-meta` | ? | room-local | room-local | ? |
| `cc-plate-name` | ? | ? | room-local | ? |
| `cc-plate-quote` | ? | room-local | ? | ? |
| `cc-plate-reason` | ? | room-local | ? | ? |
| `cc-plate-row` | ? | ? | room-local | ? |
| `cc-plate-state` | ? | ? | room-local | ? |
| `cc-plates` | ? | ? | room-local | ? |
| `cc-print` | ? | cc-stage (StageFrame print) | ? | ? |
| `cc-print-caption` | ? | room-local | ? | ? |
| `cc-proclamation` | ? | ? | ? | room-local |
| `cc-proclamation-label` | ? | ? | ? | room-local |
| `cc-rampart` | existing Rampart (fixed shell where copied) | existing Rampart (fixed shell where copied) | existing Rampart (fixed shell where copied) | existing Rampart (fixed shell where copied) |
| `cc-range` | ? | ? | room-local | ? |
| `cc-readout` | ? | ? | room-local (boxed textual output; not hero) | ? |
| `cc-ribbon` | cc-ribbon (Ribbon) | ? | ? | ? |
| `cc-ribbon-label` | cc-ribbon-label | ? | ? | ? |
| `cc-ribbon-note` | cc-ribbon-note | ? | ? | ? |
| `cc-ribbon-word` | cc-ribbon-word | ? | ? | ? |
| `cc-roll-entry` | ? | cc-ruled-row (RuledRow entry) | ? | ? |
| `cc-roll-entry-actions` | ? | cc-feed-actions (RuledRow actions) | ? | ? |
| `cc-roll-entry-head` | ? | room-local (row mark/title/trailing slots) | ? | ? |
| `cc-room-locator` | room-local (fixed shell/prototype control; do not port) | room-local (fixed shell/prototype control; do not port) | room-local (fixed shell/prototype control; do not port) | room-local (fixed shell/prototype control; do not port) |
| `cc-rule-card` | ? | cc-card (HeraldicCard plain) + room-local grid | ? | ? |
| `cc-rule-side` | ? | room-local | ? | ? |
| `cc-rule-text` | ? | room-local | ? | ? |
| `cc-sample` | existing Rampart (fixed shell where copied) | existing Rampart (fixed shell where copied) | existing Rampart (fixed shell where copied) | existing Rampart (fixed shell where copied) |
| `cc-seal-button` | room-local | ? | ? | room-local |
| `cc-seal-caption` | ? | ? | ? | room-local |
| `cc-seal-card` | ? | ? | ? | cc-plate (Plate plain, border_ink rule) |
| `cc-seal-card-body` | ? | ? | ? | cc-plate-body (PlateBody; padding override) |
| `cc-seal-card-head` | ? | ? | ? | cc-plate-band (PlateBand seal) |
| `cc-seal-designs` | ? | ? | ? | room-local |
| `cc-seal-empty` | ? | ? | ? | room-local |
| `cc-seals` | cc-numbered-discs (NumberedDiscs) | ? | ? | ? |
| `cc-search` | ? | room-local | ? | ? |
| `cc-select` | ? | ? | cc-field select (FieldGroup select) | ? |
| `cc-separator` | existing Rampart (fixed shell where copied) | existing Rampart (fixed shell where copied) | existing Rampart (fixed shell where copied) | existing Rampart (fixed shell where copied) |
| `cc-shield` | cc-shield (ShieldCharge) | ? | ? | ? |
| `cc-side-fine` | ? | ? | ? | room-local |
| `cc-side-head` | ? | ? | ? | cc-section-heading (SectionHeading ruled) |
| `cc-side-lede` | ? | ? | ? | room-local |
| `cc-small` | ? | room-local | room-local | ? |
| `cc-spacer` | existing Rampart (fixed shell where copied) | existing Rampart (fixed shell where copied) | existing Rampart (fixed shell where copied) | existing Rampart (fixed shell where copied) |
| `cc-stage` | cc-stage (StageFrame stage) | ? | ? | ? |
| `cc-stage-foot` | room-local | ? | ? | ? |
| `cc-stage-kicker` | room-local | ? | ? | ? |
| `cc-stage-wrap` | room-local | ? | ? | ? |
| `cc-stair` | ? | ? | room-local | ? |
| `cc-stair-step` | ? | ? | room-local | ? |
| `cc-stamp` | cc-chip cc-stamp (StatusChip label) | cc-chip cc-stamp (StatusChip mode) | ? | ? |
| `cc-status` | room-local | room-local | ? | ? |
| `cc-steward-bar` | existing StewardBar (fixed shell where copied) | existing StewardBar (fixed shell where copied) | existing StewardBar (fixed shell where copied) | existing StewardBar (fixed shell where copied) |
| `cc-steward-controls` | existing StewardBar (fixed shell where copied) | existing StewardBar (fixed shell where copied) | existing StewardBar (fixed shell where copied) | existing StewardBar (fixed shell where copied) |
| `cc-steward-identity` | existing StewardBar (fixed shell where copied) | existing StewardBar (fixed shell where copied) | existing StewardBar (fixed shell where copied) | existing StewardBar (fixed shell where copied) |
| `cc-steward-message` | existing StewardBar (fixed shell where copied) | existing StewardBar (fixed shell where copied) | existing StewardBar (fixed shell where copied) | existing StewardBar (fixed shell where copied) |
| `cc-steward-proposal` | room-local (fixed shell/prototype control; do not port) | ? | ? | ? |
| `cc-steward-suggestions` | existing StewardBar (fixed shell where copied) | existing StewardBar (fixed shell where copied) | existing StewardBar (fixed shell where copied) | existing StewardBar (fixed shell where copied) |
| `cc-steward-with-proposal` | room-local (fixed shell/prototype control; do not port) | ? | ? | ? |
| `cc-swatch` | ? | ? | ? | room-local |
| `cc-tablet` | ? | ? | ? | cc-card (HeraldicCard tablet) |
| `cc-tablet-no` | ? | ? | ? | room-local (tablet number) |
| `cc-tablet-state` | ? | ? | ? | room-local (tablet state/lock content) |
| `cc-tablets` | ? | ? | ? | room-local |
| `cc-tally` | room-local | ? | ? | ? |
| `cc-text-button` | ? | room-local | ? | ? |
| `cc-theme-toggle` | room-local (fixed shell/prototype control; do not port) | ? | ? | ? |
| `cc-ticket` | room-local | ? | ? | ? |
| `cc-ticket-body` | room-local | ? | ? | ? |
| `cc-ticket-head` | room-local | ? | ? | ? |
| `cc-ticket-stub` | room-local | ? | ? | ? |
| `cc-tile` | ? | room-local | ? | ? |
| `cc-tiles` | ? | room-local | ? | ? |
| `cc-tl-mark` | ? | ? | room-local | ? |
| `cc-tl-rule` | ? | ? | room-local | ? |
| `cc-tl-svg` | ? | ? | room-local | ? |
| `cc-unit` | ? | ? | room-local | ? |
| `cc-urn` | room-local | ? | ? | ? |
| `cc-verdict` | ? | existing VerdictChip (unchanged) (fixed shell where copied) | ? | ? |
| `cc-verdict-stamp` | cc-chip cc-stamp (StatusChip verdict) | ? | ? | ? |
| `cc-visually-hidden` | ? | room-local | ? | ? |
| `cc-wordmark` | existing Rampart (fixed shell where copied) | existing Rampart (fixed shell where copied) | existing Rampart (fixed shell where copied) | existing Rampart (fixed shell where copied) |
| `cc-writ` | room-local | ? | ? | ? |
| `cc-writ-fair` | room-local | ? | ? | ? |
| `cc-writ-fields` | room-local | ? | ? | ? |
| `cc-writ-rev` | room-local | ? | ? | ? |
| `cc-writ-seal` | room-local | ? | ? | ? |
| `cc-writ-title` | room-local | ? | ? | ? |
| `desktop-shell` | room-local (fixed shell/prototype control; do not port) | room-local (fixed shell/prototype control; do not port) | room-local (fixed shell/prototype control; do not port) | room-local (fixed shell/prototype control; do not port) |
| `desktop-surface` | room-local (fixed shell/prototype control; do not port) | room-local (fixed shell/prototype control; do not port) | room-local (fixed shell/prototype control; do not port) | room-local (fixed shell/prototype control; do not port) |
| `proto-ctl` | ? | ? | ? | room-local (fixed shell/prototype control; do not port) |
| `proto-empty` | room-local (fixed shell/prototype control; do not port) | ? | ? | ? |
| `proto-state` | room-local (fixed shell/prototype control; do not port) | ? | ? | ? |
| `proto-theme` | room-local (fixed shell/prototype control; do not port) | room-local (fixed shell/prototype control; do not port) | room-local (fixed shell/prototype control; do not port) | ? |
| `proto-tools` | room-local (fixed shell/prototype control; do not port) | ? | ? | ? |
| `proto-writ` | room-local (fixed shell/prototype control; do not port) | ? | ? | ? |
| `room-caption` | ? | room-local (fixed shell/prototype control; do not port) | room-local (fixed shell/prototype control; do not port) | ? |
| `room-design-actions` | ? | room-local (fixed shell/prototype control; do not port) | room-local (fixed shell/prototype control; do not port) | ? |
| `shell-room` | room-local (fixed shell/prototype control; do not port) | room-local (fixed shell/prototype control; do not port) | room-local (fixed shell/prototype control; do not port) | room-local (fixed shell/prototype control; do not port) |
| `shell-room-back` | room-local (fixed shell/prototype control; do not port) | room-local (fixed shell/prototype control; do not port) | room-local (fixed shell/prototype control; do not port) | room-local (fixed shell/prototype control; do not port) |
| `shell-room-content` | room-local (fixed shell/prototype control; do not port) | ? | room-local (fixed shell/prototype control; do not port) | room-local (fixed shell/prototype control; do not port) |
| `shell-room-header` | room-local (fixed shell/prototype control; do not port) | room-local (fixed shell/prototype control; do not port) | room-local (fixed shell/prototype control; do not port) | room-local (fixed shell/prototype control; do not port) |
| `shell-room-heading` | room-local (fixed shell/prototype control; do not port) | room-local (fixed shell/prototype control; do not port) | room-local (fixed shell/prototype control; do not port) | room-local (fixed shell/prototype control; do not port) |
| `shell-room-simulated` | room-local (fixed shell/prototype control; do not port) | room-local (fixed shell/prototype control; do not port) | room-local (fixed shell/prototype control; do not port) | room-local (fixed shell/prototype control; do not port) |
| `shell-room-title` | room-local (fixed shell/prototype control; do not port) | room-local (fixed shell/prototype control; do not port) | room-local (fixed shell/prototype control; do not port) | room-local (fixed shell/prototype control; do not port) |
| `shell-room-work` | room-local (fixed shell/prototype control; do not port) | room-local (fixed shell/prototype control; do not port) | room-local (fixed shell/prototype control; do not port) | room-local (fixed shell/prototype control; do not port) |
| `shell-seal-slot` | ? | room-local (fixed shell/prototype control; do not port) | room-local (fixed shell/prototype control; do not port) | ? |
| `shell-steward-proposal` | room-local (fixed shell/prototype control; do not port) | ? | ? | ? |
| `visuals-room-cutout` | ? | ? | room-local | ? |
| `visuals-room-fire` | ? | ? | room-local | ? |
| `visuals-room-fire-core` | ? | ? | room-local | ? |
| `visuals-room-glow` | ? | ? | room-local | ? |
| `visuals-room-stone` | ? | ? | room-local | ? |
| `visuals-room-test-tools` | ? | ? | room-local | ? |
