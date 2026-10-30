# Map Room (Chamber 4, key ink): three variants

Route `#/chamber/studio`, fixture mode. All three keep the shell as the app has it today: the
rampart, the chamber header and the Steward dock. They use the same fixture: 54 illustrative
tiles, House Quill 14, House Tallow 14, House Sable 15, Unclaimed 11, A1 selected, and Sand table
as the only current stage. The words come from `rooms/studio/*.tsx`, the seal slot and
`ProposalLayers`. One addition: each ladder stage gets its plain function next to the castle word
(local test, hosted test, released), taken from the concept prototype's ladder.

Open each file directly. `?theme=stock` gives dark stock, and `?draft=1` shows a sample pending
draft (the simulated Steward's "Next turn" proposal) so the draft layer can be judged too. The
dashed control at the bottom right is a prototype control and is not part of any design.

Problems with today's room that all three variants fix:
- **The board fits.** Today only four of the six rows show and a "Scroll to inspect…" hint makes
  up for it. In every variant the board is a CSS size container and the hex size is
  `min(width / 16.46, height / 9.52)`, so all 54 hexes show at 1440x900 and at 1280x800.
- **Selection keeps the house colour.** Today the selected hex turns black and its house colour
  disappears. In every variant the selected hex keeps its house fill and gets a key-coloured ring.
- **Labels pass AA.** Today the house names are 13px dark text on solid gules, which is 4.4:1
  and fails AA. Each variant fixes this in its own way.
- **Locked stages look locked.** Today a locked rung and the current rung look almost the same.
  In every variant the current rung is filled with key, and locked rungs are dashed and carry a
  lock icon.
- **One mapping for house colours.** `[data-house]` sets `--house` once, and every component
  reads it.

---

## A · Atlas

**Thesis:** the war table is printed as a cartographer's plate that always shows all 54 hexes,
with ruled margin notes beside it instead of boxed cards.

**Better than today:** the page reads like a printed map with notes in the margin, not a stack
of bordered boxes. The hierarchy comes from numbered folios on double rules, not from borders.

Defining decisions:
1. **`.cc-folio`** is the section head: a number (4.1, 4.2, 4.3), display caps, an italic serif
   gloss, a meta line on the right, and a 3px double rule underneath. It replaces every bare
   h2/h3 and caption in the room.
2. **The plate (`.cc-mapframe` + `.cc-crop`).** The board sits inside crop marks. Each hex has a
   thin ink outline and is filled with a 46% screen of its house ink, a printed tint. Unclaimed
   tiles are dotted paper.
3. **`.cc-key`** is a real map key with hex swatches and tabular counts, sharing a footer rule
   with the instruction line.
4. **`.cc-cartouche`** shows the inspector as a ruled entry with no box: a 40px "Tile A1", the
   serif "Now" line, House / Share / Record rows, and the Steward note in italic.
5. **`.cc-route`** shows the ladder as numbered stops joined by a dashed line. Under it is a
   margin note with a key-coloured bar that holds the requirement for the stage being inspected.

Port risks: `container-type: size` needs a definite height from the flex column. The 46%
`color-mix()` screen is what makes 13px ink labels pass AA, so do not swap it for solid ink. The
seal slot's two buttons are the kit's `InkButton`, and the shell's
`.shell-room :where(button…)` reset must not override it. The margin column scrolls once the seal
slot is reached.

## B · Console

**Thesis:** an operator console where every fact is a labelled readout in a ruled panel, so the
table, territory, selection and stage read at a glance without prose.

**Better than today:** everything you need to know is a number or a value in a 32px row. The
territory count has share bars, the selection appears both on the board's coordinate rulers and
in a key/value inspector, and the ladder is a three-row table with state tags.

Defining decisions:
1. **`.cc-panel` + `.cc-panel-head`** is the single container: a head bar on `--paper-2` with the
   title in caps and a meta on the right. The columns are ruled, not carded.
2. **`.cc-tally` + `.cc-meter`** shows each house with its count and a share bar coloured in the
   house ink. Unclaimed gets a hatched bar.
3. **Coordinate rulers (`.cc-axis`)** run A to I and 1 to 6 around the board. The selected column
   and row are marked on the rulers. The hexes are flat fills (house ink mixed 86% with white) so
   that press-ink labels pass AA.
4. **`.cc-kv`** is the inspector as a key/value table: Tile, House, Column, Row, Share, Record.
5. **`.cc-steps` + `.cc-tag`** is the ladder as table rows with a stage number, the name with its
   plain function, and a tag: a solid "Local only" or a dashed "Locked" with a lock icon.

Port risks: three columns is the densest option. The table column needs about 700px, which it
gets at 1280. Text on the `--paper-2` panel heads must use `--ink-2`, never `--muted`, because
`--muted` on `--paper-2` is 4.3:1 and fails AA. The ruler labels use the same `--s` / `--hw`
maths as the hexes, so a change to the hex geometry has to move both. "Panel drafts · 0 pending"
and "No panel drafts." are new empty-state words.

## C · Herald

**Thesis:** one heraldic hero; the selected tile is a big banner card in its house's ink, and
the houses and stages are bold cards you can read from across the room.

**Better than today:** there is one obvious focal point. The selected tile becomes a banner,
with a band in the house ink, a 54px tile id with an out-of-register ghost in the house ink, and
a hard offset shadow in the house ink. Standings and stages are big, countable cards, and the
board uses full-strength spot inks.

Defining decisions:
1. **`.cc-hero[data-house]`** holds the house band, the giant id, Column/Row/Share, the Now line,
   the Steward note and the instruction hint. Its colours follow the selection.
2. **The hex field** uses full gules, or and azure. The tile id is set at 19px or larger in bold
   display type, so it counts as large text and passes AA. The house name sits on a small
   `--card` label. The selected hex is lifted with a key ring and a hard key drop-shadow.
3. **`.cc-pennants`** shows the house standings under the board as cards with an ink-coloured
   left band and a 22px figure.
4. **`.cc-tablets`** shows the ladder as three stage cards side by side. The current stage is
   filled with key, locked stages are dashed with a lock icon, and the stage being inspected gets
   an offset outline. Below the cards, `.cc-proclamation` is the requirement card.
5. **`.cc-seal-card`** shows the seal slot as a card with a key-coloured head band.

Port risks: text on house ink must stay at `--text-wordmark` (19px) bold or larger. Smaller text
goes on `--card`. The hero's shadow, ghost and band all read `--house`, so the hero must receive
`data-house` from the selection. On a tall side column the ladder sits partly below the fold at
1280x800, by design: the hero takes the first screen. Bahnschrift draws the capital I like an
l, so the I-column ids lean on the label underneath.
