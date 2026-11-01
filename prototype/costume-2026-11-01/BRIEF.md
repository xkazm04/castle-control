# Costume rounds: 2026-11-01

Castle Control is entering the Kiroween hackathon's **Costume Contest** track, judged
on visual creativity and level of execution. In the organisers' words (from memory,
not re-checked): a haunting user interface that is polished and unforgettable, with
spooky design elements that enhance the app's function rather than distract from it.

The current pages are judged "around average". We run **evolutionary rounds**:

1. Each round produces three variants (families **A**, **B**, **C**) of every page.
2. The owner looks through them in a triage artifact and picks one winner per page.
3. The winners become the baseline of the next round, and the next three variants evolve from them.

The output of a round is static HTML/CSS that a builder can later port into the
React app by following it literally. These files are prototypes. No product code
changes in a round.

## Pages

| id | Route today | Source to read | Baseline |
|---|---|---|---|
| `landing` | site `/` | `apps/site/src/` (broadside, stage, copy, site.css) | `_baseline/landing.*` |
| `keep` | `#/keep` | `apps/desktop/src/keep/`, `apps/desktop/src/shell/keep.tsx`, `apps/desktop/src/rampart.tsx` | `_baseline/keep.*` |
| `overview` | `#/overview` | `apps/desktop/src/overview/`, `apps/desktop/src/shell/overview.tsx` | `_baseline/overview.*` |
| `demo` | `#/demo` (On stream) | `apps/desktop/src/demo/` | `_baseline/demo.*` |
| `setup` | `#/stream` (Set up OBS) | `apps/desktop/src/stream/setup.tsx` | `_baseline/setup.*` |
| `lottery` | `#/chamber/lottery` | `apps/desktop/src/rooms/lottery/`, `lots-copy.ts`, `lots-fixture.ts` | `_baseline/lottery.*` |
| `gatehouse` | `#/chamber/moderator` | `apps/desktop/src/rooms/moderator/`, `moderation-copy.ts`, `moderation-fixture.ts`; the drill (`_baseline/drill.*`) is its nested page | `_baseline/gatehouse.*` |
| `beacons` | `#/chamber/visuals` | `apps/desktop/src/rooms/visuals/`, `beacons-copy.ts`, `beacons-fixture.ts` | `_baseline/beacons.*` |
| `maproom` | `#/chamber/studio` | `apps/desktop/src/rooms/studio/`, `studio-copy.ts` | `_baseline/maproom.*` |

`_baseline/<id>.webp` is a 1440x900 screenshot of the page today; `_baseline/<id>.txt`
is its full visible text (including text inside scrolled panels). The app shell
(rampart top bar, chamber tabs, Steward dock) lives in `apps/desktop/src/shell/`,
`apps/desktop/src/rampart.tsx` and `packages/ui/src/`. Brand background is in
`prototype/NOTES.md` and `docs/plan/02-ui.md`.

## Fixed in every variant

- **Content and honesty.** Use the same sample data, numbers and words the page
  shows today. Change wording only where it is broken or truncated. Everything
  that is simulated stays visibly labelled SIMULATED or SAMPLE; drafts stay drafts;
  "Nothing sent to Twitch" type statements stay. Real chat never appears: sample
  chat lines are invented and labelled simulated.
- **Function.** Every control the page has today exists in the variant (it may be
  regrouped, restyled or moved). The Steward dock, hold-to-seal buttons, chamber
  switching (keys 0 to 4) and Esc/back exist wherever they exist today.
- **Brand core.** Castle words beside plain functions (Lot Chamber = lottery,
  Gatehouse = AI moderator, Beacons = contribution visuals, Map Room = Extension
  studio, Steward = co-pilot, writ = sealed draw record, moat = chat delay). One
  ink per chamber: Lot Chamber gules (red), Gatehouse azure (blue), Beacons or
  (gold), Map Room key (ink/black). A family may re-tune those inks for its world
  but each chamber keeps its hue.
- **Tokens.** `_assets/tokens.css` is today's token sheet. A family may extend or
  override it in its own `kit.css` (new colour, type and effect tokens are welcome;
  declare them as custom properties on `:root` and name them). Components use
  tokens, never literal colours.

## Free in every variant

- The shell (rampart, chamber tabs, Steward dock) may be redesigned, consistently
  across all pages of a family. Its information stays: ON AIR state, viewers,
  uptime, Twitch/OBS/Gatehouse registration chips, SIMULATED marks, chamber figures.
- Fonts: Google Fonts are allowed (OFL faces only; the port will bundle them). Load
  them with one `<link>` in the page head. Always give a fallback stack.
- Images: inline SVG, CSS, canvas, and the existing raster art in `_assets/*.webp`
  (Malakor the skeleton streamer, the war map, the urn/altar/frame/hex/vote-bar art
  presets) referenced relatively, e.g. `../../_assets/malakor-facecam.webp`.
  `_assets/keep-art.svg` is today's keep illustration. Nothing else from the network.
- Motion: one orchestrated moment per page beats scattered effects. Respect
  `prefers-reduced-motion`. The page must be complete and readable at rest; never
  leave content at opacity 0 waiting for an observer.

## Technical rules

- One self-contained HTML file per page: `round-N/<family>/<id>.html`, plus the
  family's shared `round-N/<family>/kit.css` (linked as `kit.css`). Inline `<style>`
  for page-specific CSS; a little inline `<script>` for static interactions only.
- Design at **1440x900**; must work at 1280x800 with no horizontal scroll and no
  clipped text. The page may scroll vertically when today's page does.
- WCAG AA text contrast. Visible keyboard focus.
- Class names in a kit vocabulary (`.cc-panel`, `.cc-field`, `.cc-seal`...), one
  vocabulary per family, so the port can lift them into `packages/ui`.
- A `<!-- PORT NOTES ... -->` comment at the top of each page: the components it
  introduces and which existing packages/ui component or room CSS each replaces.
- Before finishing, screenshot each page you made at 1440x900 with Playwright
  (`require('playwright')`, `chromium.launch()`, `file://` URL) and look at it.
  Fix overlaps, clipping, unreadable text and anything that looks unfinished.
  Write screenshots to `round-N/<family>/_shots/<id>.png`.
- Write nothing outside your assigned folder. No git commands. No product code.

## Round 1 families

The three families are three distinct costume directions for the same castle. Each
family is one coherent design language across all nine pages.

### A · Illuminated

The current printed heraldic brand taken to its highest level of craft: an
illuminated manuscript and herald's roll. Warm vellum, ink rules, gold leaf (or)
used as a precious accent, rubricated red capitals, wax seals that really look
pressed, blackletter or uncial display used sparingly beside a refined text face,
marginalia and drolleries (tiny grotesques, bats and skulls in the margins) as the
spooky costume. Light paper is the primary theme; dark stock ("the scriptorium by
candle") should also work through the token switch. Thesis: the most refined
evolution of what exists, haunted at the edges.

### B · Haunted

The keep after midnight. Dark stone and night sky are the ground; moonlight,
candlelight, will-o'-wisp azure and ember red are the light sources. UI surfaces
are lit, not printed: glows, fog, flicker, deep shadow. Spooky elements carry
function: held messages wait as ghosts at the portcullis, the moat is black water
with a mist that thickens with the delay, beacons are real fire, the urn's lots are
souls, the Steward is a candlelit spectre. Dark is the only theme. Thesis: the
"haunting interface" brief taken literally, still a working tool at 2am.

### C · Stained Glass

The castle's chapel windows. Every panel is leaded glass in jewel tones lit from
behind; the chamber inks become glass colours; heavy lead came forms the grid;
light falls through as coloured pools. Rose-window motifs for circular readouts
(the urn, the consensus chart, the kindling curve), lancet arches for panels, and
gothic tracery for frames. Spooky through the night version: a moonlit chapel,
gargoyles, the glass glowing in the dark. Both a day (light) and a night (dark)
theme. Thesis: the most theatrical, visually unforgettable option.

## Later rounds

Round N+1 starts from the fused winners of round N in `fused/` (one winner per page, see
`round-N/PICKS.md`). Its three families are mutations of each winner, typically:
**A** refine (fix flaws, raise craft, keep direction), **B** push (amplify what made
it win), **C** cross (bring in the best idea from a losing variant or a new twist).
