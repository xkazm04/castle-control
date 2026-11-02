# Chamber primitives (T3 WP3)

Import from `@castle-control/ui/chamber`. Each component imports its own CSS.
The shell must load the existing generated and fused token sheets, supply a
`data-chamber` ancestor, and allocate a bounded flex/grid room with `min-height: 0`.
No new tokens are required. Winner palette updates remain with WP1.

`ChamberLayout` accepts `picture`, `picture_label`, `preview`, `program`, and a
two-item `columns` tuple. Columns contain `ChamberSection` instances; multiple
sections stack with the winner's rhythm. `heading` optionally supplies the room
title and drawer trigger. Omit it when the shell already renders that title.
`caption` defaults to “as it is on air · simulated”; override it when a real room
shows a draft or live state. Mini titles are also overridable (Gatehouse uses
“Proposal · awaiting your seal”). Slots retain the room's existing models/actions.

The layout is a size container. The picture column is as wide as a 16:9 picture
that still leaves `--chamber-reserve` (210 px) of height for the caption and the
Preview/Program pair: `clamp(380px, min(54cqw, (100cqh - reserve) * 16/9), 54cqw)`.
Short rooms (1280×720) get a smaller picture, wide rooms (1920×1080) stop at 54 %
of the width. The two section columns divide the rest equally. All three columns
stretch to the room's height: Preview/Program sit on the bottom edge at their own
height, and the last section in each column takes the remaining height, so every
column ends on one baseline. Container queries collapse to two columns below
68 rem and one below 44 rem.

One card treatment for sections and minis (section.css): `--surface` ground,
hairline `--hair`, `--r-lg` radius, 12/14 px padding, and one kicker (the
`.cc-kicker` face: `--font-label` 700, `--track-label`, lowercase small caps, chamber
ink). Rooms should not restyle the card or the kicker; style their content.

No column or mini is a scroller, and content is never clipped to disguise a
budget overrun. Keep sections within the allocated room height; put expanded
charts, full brackets and other heavy material in `Drawer`.

`Drawer` is a controlled, nonmodal detail dialog with `open` / `onClose`. It
focuses Close when opened, restores the connected opener on close or unmount,
and allows normal Tab navigation back to the room. The shell handles Escape
layering and sets `open` false; the drawer registers no keyboard listener.
Its body may scroll for long detail material. Mount it outside transformed or
clipping ancestors so its fixed position overlays the page. Its top follows
`--top-h`; its bottom follows the shell's `--dock-h` Steward bar size.

`KeyBadge letter="Q"` goes inside a positioned control, or a positioned wrapper
around an input. It uses shared `Kbd` and contributes the visible letter to the
accessible name. The room keymap supplies that letter; the badge dispatches no
shortcut and creates no additional focus target.

## Fixture harness and verification

The chosen harness is git-ignored `.port/harness/`, independent of desktop
routes. It labels all generated sample data SIMULATED and has no live client.
See its README for launch and measurement commands. Its Playwright script checks
1280×720, 1366×768 and 1920×1080, reports actual picture/column widths, verifies
16:9, equal section columns, page overflow, inner scrollers and content overflow,
and exercises drawer focus/close, shell-owned Escape, and narrow container collapse.

Unit coverage: layout/roles/slots, labelled sections, accessible key text,
controlled drawer visibility/close and focus lifecycle. Run the UI package's
`typecheck`, `lint`, `test`, followed by `node scripts/check.mjs`.
