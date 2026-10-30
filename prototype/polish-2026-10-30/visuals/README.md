# The Beacons: three component variants (polish round 2026-10-30)

Open `variant-a.html`, `variant-b.html` or `variant-c.html` straight from disk. Add `?theme=stock` for dark
stock; the dashed `proto · paper/stock` button at bottom right is a prototype switch, not part of the design.
Click a beacon to change the selection. The shell (rampart, chamber header, Steward dock) and the shell-owned
seal slot are copied from the app and not redesigned. Every colour, font, radius and easing comes from
`packages/tokens/src/generated.css`. Checked headless in Chrome at 1440x900 and 1280x800 in both themes, with
no horizontal scroll.

The three variants share these rules:
- **The artwork is unchanged.** `artwork.tsx` geometry, the hero viewBox crops and the `.visuals-room-stone/-fire/-fire-core/-glow/-cutout` classes are kept, so a port only replaces the wrapper.
- **Tier ramp wording (one fix).** A range cell used to print only the intensity at the range's start ("10–30 · 25% intensity"), while the Now line said 39% blaze for a total inside that same range. Each cell now prints the ramp, for example `25→60%`, using `point.intensity → next.intensity`. Nothing else in the model changes.
- **Feed rows.** The amount and the source label sit in separate cells, so "1 subscriptions" no longer reads as a broken sentence. The words themselves are unchanged.
- **Ink rules.** Or is used only as a fill, with `--press` text on it. Text that should look gold uses `--or-text`.

---

## A · Hearth
**Thesis:** the selected beacon's blaze is the one big figure in the room, and every other component serves that fire.

**Better than today:** the empty brazier box and the loose caption become a stage with a readout you can read
from across the room. The curve and the tiers stop disagreeing, and the test fire is no longer hidden.

Defining decisions:
1. **Hero readout.** A `.cc-readout` with a 70 px tabular figure, its weighted-subs line and a tier-ticked gauge sits beside the art. It replaces both the card's "Now:" line and the test fire's own result line.
2. **The ladder is the curve's x axis.** `.cc-ladder` cells sit exactly under equal curve columns. The lit area is filled up to the gules "now" marker, and the active range is filled with or.
3. **Picker as a real field.** `.cc-field` puts the label, the select and a boxed "Native unit" readout together, with the simulated-only note as a ruled aside.
4. **Ruled beacon selector.** `.cc-beacon` rows carry the chamber-strip stripe (from `cc-chamber`) instead of boxed cards. Each row has its name, figure, meta line and a mini tier track (`.cc-pips`) showing progress inside the active range.
5. **Test fire is always visible.** `.cc-testfire` is a toolbar directly under the curve it moves.

**Port risks:**
- The segmented x scale is a deliberate non-linear axis. It needs the stated formula `(i + frac) / ranges.length`, and a later editable curve must not reuse it for dragging.
- The SVG uses `preserveAspectRatio="none"`, so every stroke needs `vector-effect: non-scaling-stroke`.
- Three `data-panel` copies stand in for one React stage fed by `selected`. Do not port the copies.

## B · Ledger
**Thesis:** read the chamber like a printed ledger. One ruled table compares every beacon, and numbered figures below it explain the selected one.

**Better than today:** all three beacons, their drivers, decays, tiers and blaze fit in one 200 px table you can
scan. One scroll replaces two competing column scrolls. Section numbers (3.1 to 3.6) give the page a reading order.

Defining decisions:
1. **`.cc-ledger` table.** It replaces the three cards: one `<tr>` per visual, a real `<th scope="col">` header, `aria-selected` on the row and the existing `aria-pressed` selection button in the name cell.
2. **Editable cell.** The "Driven by" select lives inside the selected row (`.cc-cell-edit`). The other rows show the same words read-only (`.cc-cell-read`).
3. **`.cc-scale`.** Four joined cells sit in one ink frame. The active cell is filled with or, and passed cells get an or underline.
4. **Numbered section heads (`.cc-sec`)** come from the original concept: an or-text number box, display caps, an italic serif gloss, right-aligned meta and a 2 px rule. Notes become footnotes (`.cc-footnote`).
5. **Figures, not panels.** Fig. 3.2 shows the brazier on a plate with print crop marks. Fig. 3.3 is the honest linear curve, now with y and x axes.

**Port risks:**
- Table cells hold interactive controls. Keep row clicks and the name button in sync, and do not make the `<tr>` itself the focus target.
- The brazier is smaller than today. If the owner wants the fire to dominate, this is the wrong variant.
- The 7-column `table-layout: fixed` needs the colgroup widths. Below about 1100 px the spreads stack, but the ledger itself does not reflow. Below 900 px it needs its own stacked row form, which is not drawn here.

## C · Plates
**Thesis:** three beacons as three printed plates side by side, so you compare the fires before you tune one. The selected plate prints its or ink out of register, and the bench below tunes it.

**Better than today:** each visual shows its own fire at its own blaze, so the comparison is visual and not a
column of text. Selection is unmistakable, and every tuning control sits in one framed bench under the plates.

Defining decisions:
1. **`.cc-plate` as a radio card.** It is a `<button role="radio" aria-checked>` in a `radiogroup`, with an `.cc-plate-chief` band (or with `--press` text when selected). Selection is shown by an or offset shadow, the brand's out-of-register plate.
2. **`.cc-stair`.** Each range column is a clip-path ramp from `--from` to `--to`, so the four columns together draw the kindling curve. The active column has a gules "now" rule at `--frac`.
3. **Chips for the description lines.** The driver is an `or` chip and the decay is a `dash` chip, the same variants as the kit's `StatusChip`.
4. **`.cc-bench`.** One ink frame with a `--press`/`--cream` chief band (these tokens do not flip with the theme) holds three bays: Driven by, The kindling curve, and Test fire as a 2x2 grid.
5. **Carded lower row.** `.cc-panel`: the timeline, the feed as two-line rows with a boxed amount, and the shell's seal slot.

**Port risks:**
- Arrow-key radio behaviour has to be written in the port. The prototype only clicks.
- The altar art is small at 112 px plate height because its viewBox is tall. Keep the hero crops, do not crop the geometry.
- The `clip-path` ramps rely on unitless `--from` / `--to` custom properties set inline per step.
- The bench chief deliberately uses the non-flipping `--press`/`--cream`/`--or` tokens. Do not swap them for `--ink`/`--paper`: `--or` on `--ink` fails contrast in stock.
- The plate and bench take about 560 px. At 1280x800 the bench is below the fold, so the plates must stay the first thing on the page.
