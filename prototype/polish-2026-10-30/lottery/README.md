# Lot Chamber: three component variants (polish round 2026-10-30)

Chamber 1 of 4, ink gules, route `#/chamber/lottery`, fixture mode.

Each file is self-contained. It links `../../../packages/tokens/src/generated.css` and uses
only its variables. The rampart, room header and Steward dock are copied from today's app and
are not part of the proposal: only the markup between the two `ROOM BODY` comments is. Each
file starts with a PORT NOTES comment that maps every new class to the component or room CSS it
replaces.

The small dashed control in the bottom-right corner is for the prototype only:
- **stock** toggles the paper and stock themes;
- **writ** toggles between the baseline "no draft waiting" state and the drafted writ (Questions
  for the hall, amended to 5 winners, revision 2).

The same settings work from the URL, for headless screenshots: `?theme=stock`, `?state=writ`, or
both.

All words and figures come from `lots-copy.ts`, `lots-fixture.ts`, `session.ts` and the shell.
All three variants show these figures, which the app already holds but does not display:
- the per-template guardrail result from `checkFixturePolicy` and its reasons. Both prize
  examples read **Blocked**;
- the counts per cohort (50 new accounts, 24 subscribers, 13 raiders), so that "Lots coloured
  by cohort" is now true;
- the hint from `lotsCopy.lookup_hint`, which was never rendered.

## What all three fix compared with today
- **Hierarchy.** Today the room has one flat run of 13 px captions and default-looking boxed
  buttons. Each variant gives it a single, clear entry point instead.
- **The fold.** Today the lookup, the seal slot and the fairness steps all sit below the fold.
  Each variant brings the seal slot and the lookup into view at 1440x900.
- **Figures.** The headline figures from `docs/plan/02-ui.md` (entries, winners, held out by
  cooldown) were buried in sentences. Each variant now shows them as tabular figures.
- **Guardrails.** A template's guardrail result is now visible before you draft from it.
- **Contrast.** Signal colours are used only as marks, and the words beside them are in ink,
  because `--ok` as text fails AA on paper. The hold-to-seal label is set at large-text size,
  because ink on gules measures 4.4:1.

---

## A · Broadsheet (`variant-a.html`)
**Thesis:** the chamber is printed like a broadsheet: three ruled columns, numbered sections and
one ghosted hero figure, with no boxes around anything.

**Better than today:** it reads top to bottom like a page. Every section has the same head
(roman numeral, display caps and a serif standfirst over a double rule), so the eye always knows
where a section starts. The templates become a ruled ledger, not three heavy boxes.

**Defining decisions**
1. **Three columns** (`.cc-broadsheet`, `.cc-column`). Column 1 holds the writ and fairness,
   column 2 holds only the urn, and column 3 holds the seal, lookup and saved proof. Each column
   scrolls on its own.
2. **`.cc-head`**, the section head: a gules roman numeral, display caps, a serif italic
   standfirst, and a 2 px rule with a hairline beneath it. It replaces every caption style the
   room uses today.
3. **`.cc-ledger`**: ruled, borderless template rows with a radio pip, a `.cc-tally` mark and
   word, a "Draft writ" cue and the blocked reasons in serif italic.
4. **`.cc-lede` and `.cc-figures`**: an 87 in 76 px display type with a gules ghost, over a
   ruled strip of three readouts.
5. **`.cc-deed`**: the writ printed between two dashed gules rules, with a rotated stamp, a
   ruled field list and the struck value with its re-ink.

**Porting risks**
- At 1280x800 the third column is about 350 px wide, and the urn shrinks to about 200 px high,
  because column 2 gives it only the height that is left over.
- The seal card in the room needs a compact `ProposalCard`, showing the title, revision and
  actions but not the fields.
- Moving the lookup and the seal slot into column 3 changes the order that
  `structure.test.tsx` asserts. The test must be updated on purpose.

## B · Console (`variant-b.html`)
**Thesis:** an operator's instrument panel. The six figures a streamer checks mid-stream sit in
one fixed readout band, and every list below it is a dense, aligned table in a framed panel.

**Better than today:** you never need to scroll to know the state. Lots, winners, held out,
raider cap, guardrails and "Now" are always visible. The writ becomes a field / struck / inked
diff table that can be scanned in one pass, and the saved proof is shown flat, without a
disclosure.

**Defining decisions**
1. **`.cc-readouts`**: a six-cell `<dl>` band under the room header, with 28 px tabular values
   and the lots in gules.
2. **`.cc-panel`**: a panel with a 2 px ink top rule, a `paper-2` tab bar, a section number
   (1.1, 2.1 and so on), and a body and foot. Three stacks of panels scroll independently.
3. **`.cc-table`** for templates, with a Draft button on each row, a selected gules inset bar
   and full-width reason rows. The same table shows the writ diff.
4. **`.cc-lamp`**: a signal square beside an ink word. It is used in the band and in the
   tables.
5. **`.cc-kv`**: the fixture writ's fields (recorded winners, sealed at, entries, winner count,
   source, seal), labelled with `lotsCopy.writ_fields`.

**Porting risks**
- It is the densest variant, and at 1280x800 every stack scrolls. The band carries the summary
  by design.
- The readout band duplicates the "Now" and guardrail lines. Those lines must be removed from
  the workbench, not shown twice.
- The cohort share bar uses computed `flex-grow` values, which are inline in the prototype.
- It needs the same compact `ProposalCard` as variant A. The seal slot moves to stack 1.

## C · Herald (`variant-c.html`)
**Thesis:** one stage and one writ. The urn is a printed gules plate that owns the chamber, the
writ is a physical ticket, and everything else is a printed card that steps back.

**Better than today:** it is the only variant with a single dominant image, which the "Layer 1:
the stage" section of `02-ui.md` asks for. The urn fills the full height inside a plate with
crop marks, next to the hero 87 and three medallion figures. The templates become heraldic
cards with shields. When a writ is drafted, the hold-to-seal sits on the writ itself, directly
under its fields.

**Defining decisions**
1. **`.cc-stage` with `.cc-crop`**: a 2 px gules plate with four crop marks and the grid areas
   kicker, tally and urn, and foot. It can be reused as the shared stage frame for the other
   chambers.
2. **`.cc-hero` and `.cc-medals`**: the 87 at a height clamped to the viewport, with a ghost,
   and three gules-ringed discs for winners, held out and raider cap.
3. **`.cc-blazon`**: a card with a shield charge for each content type (question, prize, paid).
   When selected it gets a gules border, a gules offset shadow (overprint) and a filled shield,
   and it carries a rotated verdict stamp.
4. **`.cc-ticket`**: a stub with a dashed perforation, taken from the original prototype's writ.
   It is used for the saved proof and, with `.cc-writ`, for the drafted writ, which includes its
   own `.cc-writ-seal` row.
5. **`.cc-ribbon`**: a notched ink banner for the guardrails. **`.cc-seals`**: the four fairness
   steps as numbered discs joined by a dashed line.

**Porting risks**
- The stage moves to the left. This is the biggest layout change of the three and reverses
  today's writ-left, urn-right order.
- The `min-height: 0` chain from the wrap through the stage to the urn must survive the port, or
  the urn overflows at 1280x800.
- When the hold lives on the writ, the seal slot shows only its copy and the design actions
  while a writ is drafted. That needs a slot mode or a compact `ProposalCard`.
- The three shield charges are new inline SVG icons for the kit's icon set.
- Below the fold, the desk is the longest of the three variants.
