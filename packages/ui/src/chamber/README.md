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

The picture column uses exactly `clamp(380px, 50vw - 260px, 740px)`, expressed
through the existing fixed `--space-20` token. The surface fills its column at
16:9. Picture content must fill that surface and use at least 15 px text.
The two remaining columns divide available width equally. Container queries
collapse to two columns below 68 rem and one below 44 rem. All three acceptance
viewport sizes retain three columns with the harness shell allocation.

No column or mini is a scroller, and content is never clipped to disguise a
budget overrun. Keep sections within the allocated room height; put expanded
charts, full brackets and other heavy material in `Drawer`. Mini slots have a
104 px minimum and grow to 230 px, matching the winner's final fit pass.

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
