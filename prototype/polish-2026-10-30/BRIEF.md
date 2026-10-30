# UI polish prototype round: 2026-10-30

The owner looked at the running desktop app and judged the component design "tragic".
This round produces **three upgraded design variants for each of the four chambers**, as
static HTML/CSS. The owner picks one variant per chamber. Codex then ports the picked
variant into the React app **by following it, not reinventing it**. Design every
component so that a literal port is possible.

## What you are redesigning
The **component design inside the chamber body**: panels, rows, lists, tables, cards,
fields, buttons, chips, gauges, empty states, headings, figure readouts, spacing rhythm
and the visual hierarchy between them. The problem is the components themselves, not
the colours.

## What stays fixed (copy it as it is, so every variant is judged in real context)
- The **app shell** on every page:
  - the rampart (top bar with CASTLE CONTROL, ON AIR SIMULATED, the stat cells, registration chips and the STEWARD button);
  - the chamber header (breadcrumb, big chamber title, "Chamber N of 4 · ...", the SIMULATED label, the "Chambers 1 2 3 4" switcher and "Back to the keep Esc");
  - the Steward dock at the bottom.

  Reproduce these from the current app as faithfully as you can, from its source and the baseline screenshots. Do not redesign them; a shell change is a separate decision.
- **Tokens:** link `../../../packages/tokens/src/generated.css` first. Use ONLY its CSS variables for colour, font, radius and easing (`--paper --paper-2 --card --ink --ink-2 --muted --faint --line --rule --key`, the spot inks `--azure --gules --or` and their `-text` variants, the signal colours, `--font-display --font-serif --font-ui --font-num`, `--r-sm --r-md --r-lg`, `--ease`). Invent no colour, no hex value, no new font. `[data-theme="stock"]` on `<html>` is the dark theme. Every variant must look right in both themes.
- **Brand:** printed rather than rendered. Warm paper, ink rules, heraldic spot inks, one ink per chamber (Lot Chamber: gules; Gatehouse: azure; Beacons: or; Map Room: key), Bahnschrift display caps, tabular mono figures, and a castle word next to its plain function. Read `prototype/NOTES.md` and `docs/plan/02-ui.md`.
- **Content:** the same sample data and words the app shows today (fixture mode). Take them from the room's source and fixture files and from the baseline screenshot. Change words only where the current wording is broken. Everything stays labelled simulated or sample, as it is now.

## Constraints
- 1440x900 is primary. It must also work at 1280x800 with no horizontal scroll and no clipped text.
- Self-contained: inline `<style>` and, if needed, a few lines of inline `<script>` for a theme toggle and static interactions only. No network, no CDN, no web fonts, no images except inline SVG.
- Text contrast meets WCAG AA in both themes.
- Name component classes the way a kit would, e.g. `.cc-panel`, `.cc-field`, `.cc-row`, `.cc-readout`, `.cc-tag`, so they port to packages/ui. One class vocabulary per variant.
- Put a PORT NOTES comment at the top of each file: the components the variant introduces, which existing packages/ui component or room CSS each one replaces, and anything the port must not miss.

## Make the three variants genuinely different
Different component philosophies inside the same brand, not three colourings of one layout. Each variant needs:
- a one-word name;
- a one-sentence thesis;
- what it does better than today.

Examples of axes, which are not mandatory: editorial print hierarchy vs. dense operator console vs. bold heraldic cards; one dominant hero readout vs. an even grid; ruled lists vs. carded rows.

## Deliverables (only inside your chamber folder)
- `variant-a.html`, `variant-b.html`, `variant-c.html`. Each has a small fixed theme toggle (paper/stock) in a corner that is clearly not part of the design, and each also honours `?theme=stock` in the URL, so screenshots can be taken headless.
- `README.md`: for each variant, its name, its thesis, the 3 to 5 component decisions that define it, and its risks for porting.

Write nothing outside your chamber folder. No git commands.
