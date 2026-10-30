# The Gatehouse: three component variants (2026-10-30)

Chamber 2 of 4, AI moderator, ink azure. Route `#/chamber/moderator`, fixture mode.

Each file is self-contained. It links `../../../packages/tokens/src/generated.css` and nothing else.
The shell is copied from the running app: the rampart, the chamber header and the Steward dock. Only
the chamber body changes. Open a file with `?theme=stock` for dark stock, or use the dashed
"paper / stock" tab in the right gutter. That tab is a prototype control, not part of the design.
The rampart's own theme button also works.

All three variants keep:

- the three columns (held queue and ban review | live room replay | tools), each a focusable,
  independently scrolling region;
- the fixture data and words: 1 held, 1 pending ban, 420 replay lines, 3 Watching rules, a 4 s
  delay, Bridge down, the illustrative chart, the four consensus filters, 3 gate-roll decisions;
- the shared seal slot, in its current form, at the end of the tools column.

The verdict filter, room search and consensus filter work as static interactions. All 420 lines are
rendered, so the matching count is exact.

Wording changes in all three variants:

- The rule button "Watching · propose change" mixed a state with an action. It is now a Watching
  state plus a separate "Propose Arm" action. The proposal title sent to the Steward stays the same.
- Gate-roll rows now show each decision's `message_text`. It is already on the Decision, so nothing
  new is fetched.

Checked in headless Chrome at 1440x900 and 1280x800, in paper and in stock. No hex values, font
names or external URLs appear outside the token file.

---

## A · Broadsheet

**Thesis.** Read the Gatehouse like a printed gate roll: numbered sections under heavy ink rules,
hairline-ruled rows, figures in tabular mono, and a box only around the items waiting on a human.

**Better than today.** Today there are boxes inside boxes, a different heading style per block,
and "Now: …" sentences that hide their numbers. A uses one section grammar everywhere and lifts the
figures out of the sentences. The held message and the pending ban are the only boxed items, so the
eye goes straight to them.

**Defining decisions**
1. `.cc-section`: a 2 px rule, a numbered azure tag (2.1 to 2.8), the castle word in display caps
   and the plain function in a serif gloss, all on one baseline. It generalises the kit's `.cc-panel`.
2. `.cc-tally`: large tabular figures (1 held · 1 pending ban, 420 lines · 420 matching) replace
   every "Now:" sentence. "Simulated" becomes a dashed note.
3. `.cc-docket`: the one boxed component, used for both the held item and the ban review. It has a
   tone band on top (or for Hold, gules for Ban), a hanging azure quote mark, a `dl` of facts and
   toned actions.
4. `.cc-roll-line`: chat lines are time | verdict | text. Hold lines get an or wash and a wavy
   underline. Bar lines are struck through in gules. Both come from the original prototype's gate
   roll. Pass lines stay plain.
5. Rules become a ruled table (`.cc-orders`) with a hatched Watching tag. The moat becomes a
   four-stop `.cc-scale` with the applied delay as a 40 px readout.

**Porting risks**
- `.cc-tabs` replaces two `<select>`s: replay Verdict and the ConsensusChart filter. ConsensusChart
  needs its toolbar restyled or a prop to render tabs. Its data API does not change.
- The numbered tags are new copy. If numbers should name views (as in 02-ui.md), keep them stable
  across rooms.
- The roll's line decoration is CSS only. Row height must stay `var(--row-h)` for `rowWindow()`.

## B · Console

**Thesis.** An operator's console. Each column is a pane whose header and live-figure strip never
scroll away. Below that, everything is one dense row, with the verdict at the left edge and the
actions at the right.

**Better than today.** Today the room's state ("1 held", "0 Armed · 3 Watching", "4 s · Bridge
down") scrolls out of view with its column. In B the state stays pinned. The replay meters are the
filter, so one glance gives the counts and one click filters. The rule button, the delay select and
the gauge become controls that show the current value and the alternatives at once.

**Defining decisions**
1. `.cc-pane` = `.cc-pane-head` (title bar with an azure edge, plus `.cc-meters`) + `.cc-pane-body`
   (the scroll region). The meters are the pinned "Now" figures.
2. Replay meters (All 420 · Pass 332 · Hold 33 · Bar 55) are `aria-pressed` buttons that replace
   the Verdict `<select>`. A matching count sits next to "Search the room".
3. `.cc-case`: held and ban items are compact rows with a coloured left edge, the id and verdict,
   the quote and the reason. The two actions are stacked at the right; below 1360 px they move under
   the text.
4. `.cc-segmented` serves three jobs. Rule mode is Watching | Armed. Chat delay is Off | 2 s | 4 s |
   6 s, with the applied value filled azure; this also replaces the three-box gauge. The consensus
   filter uses it too. The pressed segment is the applied state; pressing another sends the same
   proposal the old control sent.
5. `.cc-dirs`: consensus becomes a table (swatch, label, sparkline, share, change). It replaces the
   big line chart for this room.

**Porting risks**
- Moving the scroll region from the whole column to `.cc-pane-body` changes which element carries
  `role=region` and `tabindex`. Update `structure.test.tsx` to match.
- In the segmented controls a click proposes and never applies. The new help line "Press the other
  mode to propose it." states this. Keep the pending state visible (`delay_pending`), or a click
  looks like it failed.
- The visible scroll hint becomes visually hidden; it remains as the `aria-describedby` target.
- `.cc-dirs` drops the large ConsensusChart plot in this room. If other rooms keep the plot, the kit
  needs both presentations.

## C · Herald

**Thesis.** Each column opens with one heraldic plate: the thing you would act on first, printed
big under an azure band, with an azure ghost slipped out of register. Everything secondary steps
down into plain cards and ruled lists below it.

**Better than today.** Today everything in the room has the same weight. In C each column has one
clear first read: the held message with two large actions, the replay counts as four verdict
banners, and the moat as a 54 px "4 s" beside the drawbridge. The plate's offset ink shadow repeats
the chamber title's ghost, so the body finally looks like the brand.

**Defining decisions**
1. `.cc-plate`: a 2 px ink frame and an 8 px offset shadow in the chamber ink
   (`--plate-ink`). The azure band carries `--press` text (4.8:1 in both themes), the castle word in
   display caps, the plain function, and a big count.
2. `.cc-big-button`: 44 px two-up actions inside the plate. Propose Pass is solid azure; Propose Bar
   is gules outline. Raise the drawbridge is a full-width danger outline with its plain function
   underneath.
3. `.cc-banners` (All / Pass / Hold / Bar with counts) are the replay filter. Below them, `.cc-feed`
   marks only exceptions: Hold and Bar rows carry a swallow-tailed `.cc-pennant` in their verdict
   ink, always beside the verdict word.
4. `.cc-stamp`: a rule's mode is a rotated, dashed azure stamp using the ON AIR stamp's grammar,
   with "Propose Arm" beneath it.
5. `.cc-print`: the Herald's chart sits in a crop-marked proof frame, and the consensus directions
   become 2x2 tiles with ink top bars.

**Porting risks**
- Order change: in the tools column the moat plate now comes before garrison orders. This is
  intentional, because the drawbridge is the emergency control. It still changes the structure
  test's expected order.
- The plate shadow needs 8 px of right padding in each column, or the column's overflow clips it.
- `--plate-ink` should be a prop so the other chambers can reuse the plate with their own ink. On
  gules, use `--gules-text` for the band text or check contrast first: `--press` on `--gules` is
  4.4:1, which fails AA for small text.
- The plate is the largest new component. It replaces `.room-stage` / `.moderator-portcullis`, the
  replay header and `.moderator-gate`, so all three columns change at once.
