# Fused baseline (round 2 start)

Round 1 picks: Stained Glass (C) for landing, keep, overview, demo, lottery; Illuminated (A) for
setup, gatehouse, beacons, maproom. Owner's rule: one token styling across the app, two component
directions on top. This folder is that fusion.

| File | What it is |
|---|---|
| `tokens.css` | The ONE token sheet. Themes `data-theme="day"` (default) and `"night"`. Header comment documents every token. |
| `shell.css` | The ONE app shell (C's rampart, transom-light tabs, chamber head, Steward dock, theme toggle) plus every shared primitive. |
| `glass.css` | Stained Glass direction components (windows, beads, banderoles, bays, jewels, glass cards, pools). |
| `folio.css` | Illuminated direction components (folio sheet, versals, rubrics, codex sections, gilt frames, wax, drolleries, chart and art fills). |
| `landing/keep/overview/demo/lottery.html` | C pages, moved here, renamed to fused tokens. Pixel diff against round 1 is under 0.11 % (animation timing only). |
| `gatehouse.html` | **Reference A port.** Fused shell, folio body. |
| `_shots/` | `<id>.png` (day) and `<id>-night.png`, 1440x900. |

Direction sheets and pages define no colours or fonts of their own; they read tokens
(derived `color-mix()` is allowed). The only literal colours left are the prototype-only
`.cc-proto-toggle` in shell.css, which is deliberately off-design.

## Key decisions

- **Surfaces**: C's stone (`--stone*`) and limewash surfaces (`--surface*`) are the ground for the
  shell and every shared panel on every page. A's vellum survives as one extra surface family,
  `--vellum`, `--vellum-2`, `--vellum-3`, used only by folio sheets (`.cc-folio`, held-message cards).
  By day it is a warm parchment one step from `--surface`. By night it is slate with a warm cast.
  The moonlit chapel holds on A pages too. A's "dark stock" brown is gone.
- **Inks**: C's ramp (`--ink`, `--ink-2`, `--muted`, `--faint`) replaces iron, iron-2, sepia and faint.
- **Hues**: each chamber hue has `--X`, `-lit`, `-deep`, `-ink` (text-safe), `-wash` and `-glow`, for
  gules, azure, or, key, emerald, amethyst, and clear (clear has no `-ink`). They use C's values.
- **Fonts**: C's set everywhere. A pages also get `--font-book` (Alegreya roman and italic) for
  manuscript prose: quoted messages, glosses and the live-room lines. A's Alegreya SC labels became
  Alegreya Sans SC (`--font-label`). Big figures use `--font-display` (Grenze Gotisch) in both
  directions.
- **Themes**: `paper` → `day`, `stock` → `night`, using C's `?theme=` bootstrap. A's localStorage
  key is gone.
- **Chamber binding**: `[data-chamber]`/`[data-module]` → `--ch --ch-lit --ch-deep --ch-ink --ch-wash
  --ch-glow`. Keep = amethyst (the Steward's glass), not A's iron.
- **Minimum type**: `--t-label` 13 px. A's 11.5 and 12.5 px sizes are gone.

## Head block (every page, verbatim except the direction sheet)

```html
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>… · Castle Control</title>
<script>(function(){try{var t=new URLSearchParams(location.search).get('theme');if(t==='night'||t==='day')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();</script>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Grenze+Gotisch:wght@500;600;700;800&family=Alegreya+Sans:ital,wght@0,400;0,500;0,700;0,800;1,400&family=Alegreya+Sans+SC:wght@500;700;800&family=Alegreya:ital,wght@0,400;0,500;0,700;0,800;1,400;1,500&family=IBM+Plex+Mono:wght@400;500&display=swap">
<link rel="stylesheet" href="tokens.css">
<link rel="stylesheet" href="shell.css">
<link rel="stylesheet" href="folio.css">   <!-- or glass.css on C pages -->
```

`<html lang="en" data-theme="day">`. Images: `../_assets/<file>` (one level up now).

## Canonical shell markup

Copy these from **`fused/keep.html`**:

- `<body class="cc-body">` and `<div class="cc-shell" data-chamber="…">`
- `header.cc-rampart`
- `nav.cc-tabs`
- `footer.cc-dock`
- `</div>` and the `.cc-proto-toggle` button
- the first `<script>`, which handles the theme flip and the keymap (0 to 4, `/`, Esc via `[data-back]`)

When you copy, change only `data-chamber` on `.cc-shell` and move `aria-current="page"` to the right
tab. For the room header (`header.cc-chamber-head`), copy from `fused/lottery.html` (full width) or
`fused/gatehouse.html` (inside the desk column).

`gatehouse.html` also carries the **hold-to-seal script** for shell `.cc-seal`, which sets
`--cc-seal-progress`. It also has the single-choice `.cc-seg[role=group]` script, which honours
`data-multi`. Copy both.

## Token map

### Family A → fused

| A token | Fused | A token | Fused |
|---|---|---|---|
| `--vellum` | `--vellum` (folio sheet) or `--stone` (page ground) | `--iron` | `--ink` |
| `--vellum-2` | `--vellum-2` / `--surface-2` | `--iron-2` | `--ink-2` |
| `--vellum-3` | `--vellum-3` | `--sepia` | `--muted` |
| `--leaf` | `--surface` | `--faint` | `--faint` |
| `--leaf-2` | `--surface-2` | `--rule` | `--ink-2` (lines) / `--lead` (frames) |
| `--hair`, `--hair-2` | same | `--tint-ink` | `--tint` |
| `--gules/azure/or/key` | same name, C values | `--X-text` | `--X-ink` |
| `--X-wash`, `--X-deep` | same | `--verdigris` / `-text` / `-wash` | `--emerald` / `--emerald-ink` / `--emerald-wash` |
| `--murrey` | `--danger` | `--lapis` | `--art-sky` (art) / `--azure-deep` |
| `--lapis-2` | `--azure` | `--key-deep` (in art) | `--art-shade` |
| `--c-ink` | `--ch` | `--c-text` | `--ch-ink` |
| `--c-wash` | `--ch-wash` | `--c-deep` | `--ch-deep` |
| `--gilt*`, `--wax*`, `--emboss-*` | same | `--leather*` | gone (the rampart is lead): `--lead`, `--on-lead`, `--on-lead-muted`, `--gilt-text` |
| `--art-*` | same names (`--art-sheet`, `--art-shade` added) | `--art-hill*`, `--art-room-3`, `--art-moon`, `--art-wood-2` | not ported; add to tokens.css if a page needs them |
| `--font-black` | `--font-display` | `--font-text` | `--font-book` (prose) / `--font-text` (controls) |
| `--font-caps` | `--font-label` | `--font-mono` | same |
| `--num` | same | `--t-micro` (11.5) | `--t-label` (13) |
| `--t-label` 12.5 / `--t-small` 13.5 | `--t-label` 13 / `--t-small` 14 | `--t-body`, `--t-lead` | same |
| `--t-h3` 19 / `--t-h2` 24 | `--t-h4` 21 / `--t-h3` 17 | `--t-h1` 54 | `--t-title` (64; 56 at 1280) |
| `--t-figure` 64 | `--t-figure-lg` | `--track-caps` / `-wide` | `--track-label` / `--track-wide` |
| `--shadow-sheet` | `--shadow` | `--shadow-lift`, `--shadow-inset` | same |
| `--focus` (box-shadow) | gone: shell's `:focus-visible` outline uses `--focus` (colour) | `--vignette`, `--candle` | gone |
| `--vellum-grain/-fibre` | `--tex-vellum-grain/-fibre` | `--stamp-grit`, `--diaper`, `--vine`, `--crenel` | `--tex-stamp-grit`, `--tex-diaper`, `--tex-vine`, `--tex-crenel` |
| `--g-<name>` glyph masks | `--glyph-<name>` (folio.css) | local `--g` mask var | `--mask` |
| `--motion-fast`, `--ease-ink` | `--m-fast`, `--ease` | `--top-h`, `--dock-h`, `--main-h`, `--gutter` | same names (fused values: 114 / 100 / 28) |

### Family C → fused

There is one rule, applied with a script to all five pages:

| C token | Fused |
|---|---|
| `--sg-glow` (0/1 scalar) | `--glow-on` |
| `--sg-<anything>` | `--<anything>`, for example `--sg-stone` → `--stone`, `--sg-font-text` → `--font-text`, `--sg-t-body` → `--t-body`, `--sg-tex-glass` → `--tex-glass`, `--sg-pool-x` → `--pool-x`, `--sg-came-ui` → `--came-ui` |
| `--glass-<hue>`, `--glass-<hue>-lit`, `-deep` | `--<hue>`, `--<hue>-lit`, `--<hue>-deep` |
| `--glow-<hue>` | `--<hue>-glow` |
| `--<hue>-ink`, `--ch*`, `--on-glass`, `--banderole*` | unchanged |

C's legacy re-pointing of `_assets/tokens.css` names (`--paper`, `--card` …) is dropped. Fused
pages do not load `_assets/tokens.css`.

## Class collisions resolved (one definition each, in shell.css)

| Class | Kept (shell.css) | What A pages do now |
|---|---|---|
| `.cc-app`, `.cc-top`, leather `.cc-rampart`, `.cc-brand__*`, `.cc-air`, `.cc-tool`, `.cc-regs/.cc-reg`, `.cc-tab__text`, `.cc-dock__*`, `.cc-steward-face`, `.cc-quillwrap`, `.cc-theme` | C shell | Delete them and paste the canonical shell. |
| `.cc-panel` (+ `__*`) | C (lead frame, glass cap in `--ch`) | Wrap content in `.cc-panel__body`. Otherwise the cap sits inside the padding. `--rubric` is dropped (the cap is the rubric); `--sunk` is now in shell. |
| `.cc-btn` | C | `--ink` → `--primary`; `--gilt` → `--rampart`; `--azure` → **`--chamber`** (folio); `--rubric` and `--line` live in folio.css; `--lg` is in shell. |
| `.cc-stamp` | C glass stamp | Folio bodies add **`.cc-stamp--inked`** (pressed stamp in the tone's `--st-ink`). `--ink` → `--key`/`--local` + `--inked`. `--flat` is gone. |
| `.cc-sim` | C etched pane | Use it as-is. `--slip` → `--on-lead`. The skull pip is gone. SIMULATED looks the same on every page. |
| `.cc-hold` (+`__fill __text`) | → shell **`.cc-seal`** | Use `<button class="cc-seal cc-seal--wax">` with a `.cc-wax` or `.cc-seal-slot`, then `span > .cc-seal__label + .cc-seal__hint`. `--hold` (0 to 1) → `--cc-seal-progress` (0 to 100 %). |
| `.cc-seg` | C leaded panes | `--fill` → `--block`; `--caps` dropped; add `--sm` in dense forms. |
| `.cc-field > label` | added to shell | No change. |
| `.cc-check` | → `.cc-choice` | Diamond quarry. |
| `.cc-readout` (b/span/small) | C `__fig __label __sub` | Rewrite the children. |
| `.cc-lamp` (A diamond, `color`) | C on-air cabochon | → `<i class="cc-lozenge" style="--ch:…;--ch-lit:…">`; hollow = `data-lit="false"`. |
| `.cc-chip` (A pill tag) | C rampart chip | In a body use `.cc-stamp--waiting` or `.cc-stamp--inked`. |
| `.cc-hash` | **inline mono token** | No change on A pages. C blocks use `.cc-hash--block` (lottery is updated). |
| `.cc-note` (A pilcrow) | C plain note | Use **`.cc-gloss-note`** for the pilcrow version. |
| `.cc-sub` (A italic subtitle) | C ruled sub-section | → `.cc-subtitle` |
| `.cc-incipit` (+`__rest`) | → `h1.cc-title.cc-title--incipit` | The versal is still `.cc-versal > span`. `.cc-versal--lapis` is gone (it reads `--ch`). |
| `.cc-h2` | → `.cc-section__title` | |
| `.cc-shield`, `.cc-charge--*` | glass `.cc-shield` | → **`.cc-folio-shield`** (`--lg`) and **`.cc-folio-charge--*`** |
| `.cc-list/.cc-row` (+`__lead`) | C rows | → **`.cc-folio-list` / `.cc-folio-row` / `.cc-folio-row__lead`** |
| `.cc-steps` (roman li) | C `.cc-step` | → **`.cc-folio-steps`** |
| `.cc-details` | → `.cc-disclosure` (+`__body`) | |
| `.cc-empty` (droll + p) | C | `.cc-droll` is the glyph and `p.cc-empty__text` is the line. |
| `.cc-vh` | → `.cc-sr` | |
| `.cc-back` (A link) | C wrapper div | `<div class="cc-back"><a class="cc-btn" href="…" data-back>… <kbd class="cc-kbd">Esc</kbd></a></div>` |
| `.cc-crumbs`, `.cc-kbd`, `.cc-iconbtn`, `.cc-link`, `.cc-kicker`, `.cc-eyebrow`, `.cc-meter`, `.cc-table`, `.cc-stepper` | C | Same markup. `.cc-meter--gilt` is in folio. |
| `.cc-contents` (gatehouse local / lottery `.lot-contents`) | **folio.css** | Use it for the sticky rubric strip. |
| page SVG chart classes (`.hc-*`) | **`.cc-folio-chart` `.fc-*`** | `.fc-s0..3` = series, `.fc-e0..3` = end dots, `.fc-rule--margin` = red margin rule |
| page SVG art fills | **`.cc-folio-art` `.fa-*`** | See the list in the folio.css header. Keep only the truly page-specific fills local. |

Unchanged A-only names now in folio.css: `.cc-versal`, `.cc-rubric` (+`--ch`), `.cc-orn`,
`.cc-vine`, `.cc-section` (+`__no __head __title __body`), `.cc-sheet`, `.cc-mini`, `.cc-diaper`,
`.cc-gloss`, `.cc-wax`, `.cc-seal-slot`, `.cc-stat`, `.cc-dot` (`--verdigris` → `--emerald`),
`.cc-status`, `.cc-droll--*`, `.cc-sheen`.

## How to port an A page (checklist)

1. **Start from `round-1/a/<id>.html`.** Write `fused/<id>.html`. Do not touch round-1.
2. **Head**: replace the three links with the head block above, with `folio.css`. Set
   `<html data-theme="day">`. Delete A's localStorage theme script.
3. **Shell**: delete everything from `<div class="cc-app">` to `</header>`, the `aside.cc-dock`
   and A's first `<script>`. Paste the canonical shell from `fused/keep.html`. Set
   `data-chamber` on `.cc-shell` and `aria-current="page"` on your tab. Remove `data-chamber`
   and `data-back` from `<body>`. Esc now reads `a[data-back]` in the chamber head. Wrap the body
   in `<main class="cc-main" aria-label="…">`.
4. **Chamber head**: use shell `.cc-chamber-head`. Put the title in
   `h1.cc-title.cc-title--incipit` with the versal. Use `p.cc-subtitle` with `.cc-sim`, and
   `.cc-back`. It can sit full width (lottery) or in a column (gatehouse).
5. **Folio**: put the codex on `<div class="cc-folio">`. It has a vellum sheet with a chamber
   ribbon. Put `.cc-contents` first inside it if the page has one.
6. **Tokens**: run the A → fused map over the page `<style>` and inline styles. The gatehouse
   build used a regex table that matches longest names first (`--iron-2` before `--iron`). Then
   grep for any A name left over: `iron`, `leaf`, `sepia`, `verdigris`, `--c-`, `font-caps`,
   `font-black`, `--g-`, `t-micro`, `track-caps`.
7. **Fonts in page CSS**: `--font-text` (A) means prose, so map it to `--font-book`. Big figures go
   to `600 … var(--font-display)`. Labels go to `--font-label`. Nothing below 13 px except text
   inside scaled SVG or `cqw` canvases.
8. **Classes**: apply the collision table, which is mostly mechanical. Wrap every
   `.cc-panel <cls>` body in `.cc-panel__body <cls>`. Add `.cc-stamp--inked` to stamps in the
   folio body. Leave shell stamps glass.
9. **Literal colours**: delete every `[data-theme="stock"] …` override and every hex/rgba in the
   page. If a value really has no token, add one to tokens.css with a day and a night value,
   document it in the header, and tell the Director. Do not keep it local.
10. **Night**: art that used `--key-deep`/iron as a dark line can vanish on slate. Prefer
    `--muted`, `--ink-2` or `--art-*`. The moat chain on gatehouse is an example.
11. **Sticky geometry**: shell `--top-h` is 114 px and `--dock-h` is 100 px, against A's 112 and 116.
    Re-check sticky plates (`top: calc(var(--top-h) + 18px)`, height
    `calc(100vh - var(--top-h) - var(--dock-h) - 36px)`).
12. **Motion**: keep the page's one moment. Shared keyframes: `cc-press` (stamp press, folio) and
    `cc-burnish` (`.cc-sheen`). Wrap them in `prefers-reduced-motion: no-preference`.
13. **PORT NOTES**: rewrite them to name the fused shell and the folio components used.
14. **Shots**: Playwright at 1440x900, `?theme=day` and `?theme=night`, written to
    `fused/_shots/<id>.png` and `<id>-night.png`. Check for no horizontal scroll at 1280x800,
    no clipping under the dock, and AA text. Compare with `round-1/a/_shots/<id>.png`: the body
    should read as the same manuscript, and the shell should match `fused/_shots/keep.png`.
