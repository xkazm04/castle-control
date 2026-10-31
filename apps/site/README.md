# Castle Control landing: Cutaway Keep (WP5a + WP5b + WP12)

A typed, framework-free Vite workspace member using the shared drawing, tokens
and stamp table. From the repository root:

```powershell
pnpm --filter @castle-control/site dev
pnpm --filter @castle-control/site typecheck
pnpm --filter @castle-control/site lint
pnpm --filter @castle-control/site test
pnpm --filter @castle-control/site build
node apps/site/check.mjs
pnpm exec playwright test -c e2e/site.config.ts
```

`build` produces a self-contained `dist/` with relative assets and checks its
180 KiB uncompressed first-load budget, offline posture and honesty labels.
`pnpm gate` builds/checks the site after recursive tests. The checker also accepts
an optional dist directory: `node apps/site/check.mjs <dist-directory>`.
Vite preserves workspace links, avoiding the Windows network-drive probe.

The page uses system fonts and local assets, with no app bridge, analytics,
storage or live-audience connection. Outbound links point to this repository;
the app CTAs open releases. The single poster footer matches the winner, while
project notices, release/signing status, Extension availability, Docs and Source
appear below the six principles at `#steward`. The stock-theme control lives in
the topbar. Every app action links honestly to releases as “Get the app”.

The revised O2 (2026-10-31) uses a stacked layout below 1280px. At 1280px and
above the winner's 1440×900 stage still uses the original desktop `fit()`.
O3 replaces the no-build static folder with a workspace package.
The existing hashes and `/features` suffix remain. Intro handover is 2700 ms;
Skip/native activation, origin focus, hover, keys and reduced motion are tested.
Overview attention follows the latest hover/focus event: pointer leave restores
the whole keep even while a hit has focus. Skip moves keyboard focus without
lighting a room; a later Tab or arrow focus lights its new room.

## Broadside and working toys

`broadside.ts` builds the sheet once. Room, features and Steward views replace
text and toggle the existing nodes from `copy.ts`. Inside/Back/pager anchors use
the public hashes, retaining the features depth when cycling. Focus and print-in
run on opening/changing the sheet, never on an unchanged render. The winner's
476×760 sheet keeps registration corners and the room-ink offset shadow. In the
Steward study, the heading/lead and bottom pager stay fixed. Only the principles
and honesty fine print scroll, in a Tab-reachable region with a token-based bottom
fade and “More below” cue; the cue changes at the end of the region.

`toys.ts` has no DOM. `toy-dock.ts` mounts four persistent panels and binds the
shared art hooks once. Inputs, verdicts, intensity, claims and the last three
draws survive room changes and features navigation. The lot decision and proof
precede the 2200ms wheel transition; reduced motion settles immediately, including
when enabled during a pending draw. `?seed=lanterns#lots` draws exactly once.
The sample line rules run links → blocked terms → shouting (at least 70% capitals
and six letters) → repeated characters. An empty line is held with a prompt.
Hexes expose buttons only in Map Room; Enter/Space use the one keymap subscription.

All toys carry the shared SAMPLE/SIMULATED stamps; Drawn/HELD/PASS also use
`stampParts` through the site's DOM adapter. Nothing is sent or broadcast.
`broadside.css` and `toys.css` use the stage type roles: reading copy is at least
17 stage pixels and labels at least 15. Proof/history state lines use the 15px
history role; the draw proof stays on one line with ellipsis and its full text in
the tooltip. The dock keeps its 874px width and bottom edge at stage y=842, growing
upward from a 142px minimum to fit all output. The illustration label moves with
it. DRAWN and HELD/PASS land in a top-right `.stampslot`, with unclipped ink bleed.
The room-mode footer retains WP5a's winner geometry.
The toy stack and broadside default to `display:none` with no pointer events
outside room mode. The stack itself stays pointer-inert even in the study;
only the displayed dock receives input. Hiding preserves every mounted toy's state.
Broadside actions and pager use the winner's line-height of 1. Toy text fields use
`--input-ink` (`#000000`) on `--white` in paper; stock uses its light ink
(`#F2EEE3`) on the existing `--card` (`#1D2027`) background to avoid white glare.

The new `data-role` hooks are `broadside`, `broadside-eyebrow`, `broadside-title`,
`broadside-fn`, `broadside-line`, `broadside-note`, `broadside-disc`,
`broadside-action`, `broadside-pager`, `principle`, `toy`, `toy-title`, `toy-note`,
`toy-input`, `toy-go`, `toy-result`, `toy-proof`, `toy-claim`, `toy-history`.
WP5a's stage/header/headline/footer/room-tag hooks remain.

## Acceptance evidence (2026-10-31)

- `pnpm --filter @castle-control/site typecheck`: exit 0; `[pnpm typecheck] walked 29 files`.
- `pnpm --filter @castle-control/site lint`: exit 0; `[pnpm lint] walked 29 files`.
- `pnpm --filter @castle-control/site test`: exit 0; `Test Files 10 passed (10)`; `Tests 80 passed (80)`.
- `pnpm --filter @castle-control/site build`: exit 0; 43 modules; `[site first-load] 91002 / 184320 bytes (88.87 KiB)`; built inventory, destinations, offline posture and honesty checks PASS.
- `node packages/tokens/src/generate.ts`: exit 0; generated 2 files from the token source.
- `pnpm --filter @castle-control/tokens test`: exit 0; `Test Files 4 passed (4)`; `Tests 19 passed (19)`, including generated-file drift and the new typed-input ink role.
- `node scripts/check.mjs`: exit 0; boundaries, hygiene, type-floor, file-cap and secrets all pass.
- `pnpm gate`: exit 1 at contract export, `Error: spawnSync cargo EPERM`; the preceding 35 tooling tests passed. No install was run, as required by this brief.
- Browser verification is blocked: headless Chromium reports `spawn EPERM`;
  automatic approval review rejected native Chrome access with “Computer Use was
  not approved to use Google Chrome”. No rendered-layout verification is claimed.

The 80 Vitest cases include pure rules and DOM contracts. `broadside.test.ts`
checks all four room/features sheets against copy, six principles and the extra
notices, stable DOM inventory, focus and print behavior. `toy-dock.test.ts` checks
cross-room persistence, timed/reduced-motion draws, one-time seed handling,
three-entry history, stamps, SVG paints and scoped keymap activation. The existing
intro/navigation/theme/geometry tests and built honesty checks still pass.
The attention regressions cover Skip → hover → leave, Tab focus lighting, and
pointer leave after keyboard focus, including a later arrow focus and re-render.
The overview hit-test regression checks the production CSS display/pointer rules
for both the toy stack and broadside, together with intro, Skip and return-from-room
visibility and stable mounted toy nodes. The recent `view.ts` attention fix is unchanged.

Golden draw: `lanterns` → `cindergate44`, index 8, proof
`FNV-1a("lanterns") = 7e90abd4 → lot 09 of 12`. Blank seed →
`Type a seed word first.` Curve/band cases: 0→0%, 10→25%, 18→39%, 30→60%,
100→100%, 120→100%. Hex cycle: 0→1→2→3→0; sample tally
`[0,1,1,2,3,3,3]` → Gules 2 / Azure 1 / Or 3. The initial claims use exactly
`[0,2,3,1][hexSeed[i]]`; paints are paper / gules / azure / or.

Director review correction: opened `port-site-room1b.png`,
`winner-site-room1b.png` and `port-site-steward.png` under `.port/shots/review`.
The timed-draw test asserts the wheel transform changes to `rotate(1185deg)` with
`transform 2200ms cubic-bezier(.12,.62,.16,1)`; 1185 mod 360 = 105, equal to
`-(8*30+15)` mod 360. A second draw has the same final ticket alignment. The
Steward DOM test verifies the fixed heading/pager outside the focusable inner
region and the scroll cue at both ends. A system-Chrome rerun still fails with
`browserType.launch: spawn EPERM`; the corrected 1440×900/1280×800 layout requires
Director browser verification.

## WP12: stacked landing (owner ruling O2 revised, 2026-10-31)

`layout.ts` defines the sole width breakpoint, `stackedQuery = '(max-width: 1279px)'`.
Its live `matchMedia` subscription selects the root `.stacked` class; the stacked
stylesheet follows that class without duplicating the width condition. Desktop
still builds the original stage and uses `fit()` at 1280px and above. Mobile
scenes are created only on the first stacked visit and detached on return to the
stage. The original desktop stage/header/headline/broadside DOM and hooks remain;
the existing toy panels and shared stamp filter move back to their original places.
The stage-only overflow lock is released for normal vertical page scrolling.

`stacked.ts` provides a compact header, skip link, one h1, the full keep overview,
then lots → gate → beacons → map, the six-principle study and footer. Each room
has its real heading/function/notes from `copy.ts`, a crop using the public
`keepRooms[artRoom[id]].frame`, its original toy and SAMPLE/SIMULATED stamp, and
an inline features disclosure. The art comes entirely from `keepArt()`; repeated
SVG IDs and paint references are namespaced per scene. No missing keep-art API
or package change was needed. The Herald remains illustration only.

The four existing `toy-dock.ts` panels use the unchanged `toys.ts` decisions.
Seed text, winner/proof, the last three draws, a pending draw, line text/verdict,
gift value/flame intensity, and all hex claims survive resizing in both directions.
The cached inline disclosures also retain their open state. Mobile honours a
validated `?seed=` even on the overview, drawing once. The mobile hex grid uses
native labelled buttons with 44px minimum targets, with the same claim cycle,
tallies and scene paints as desktop; Enter/Space retain native button activation.
The drawing's small hexes remain texture rather than undersized controls.

All stacked type sizes use existing `--text-*` roles (minimum 13px); text is never
scaled. Header controls, links, disclosures, forms and hex buttons have at least
44px targets. Visible HTML carries the room information independently of the art.
The header, main, footer, one h1, ordered h2s and principle h3s provide landmarks
and heading order. Theme controls share the existing visit-only theme state.
Room/study hashes scroll and focus their section, and `/features` opens its inline
copy. Reduced motion uses instant scrolling and immediate wheel results, with no
print-in, dolly, smooth scroll or ambient animations. CSP and offline posture stay
unchanged.

WP12 acceptance results (2026-10-31):

- `pnpm --filter @castle-control/site test`: PASS, 11 files / 93 tests.
- `pnpm --filter @castle-control/site typecheck`: PASS, 32 files.
- `pnpm --filter @castle-control/site lint`: PASS, 32 files; repo checks green.
- `pnpm --filter @castle-control/site build`: PASS, 46 modules;
  `[site first-load] 101829 / 184320 bytes (99.44 KiB)`.
- `node scripts/check.mjs`: PASS, including boundaries, hygiene, type-floor,
  file-cap and secrets.
- `pnpm --config.verify-deps-before-run=false exec playwright test -c e2e/site.config.ts`:
  BLOCKED, exit 1, `Error: spawn EPERM`. Debug output identifies Playwright's
  attempt to start the Vite preview web server as the blocked subprocess;
  no browser or test starts.
- Additional static validation: e2e TypeScript and ESLint both PASS.
- `pnpm gate`: BLOCKED at contract export, `Error: spawnSync cargo EPERM`,
  after all 35 tooling tests passed. No dependency install was run.

The 13 new Vitest cases cover the media switch, stacked landmarks/copy/stamps,
namespaced art references and public crops, overlays at rest and wheel paints,
every room/study/features route,
desktop/mobile node and state retention (including a draw in flight), pure toy
parity, seeded drawing, and reduced motion. The existing 80 tests still pass.
The browser lane adds 390×844 and 768×1024 cases for all rooms and toys, route
landing, minimum computed text size, touch targets, overflow (also at 360, 1024
and 1279px), reduced motion, external-request/page-error checks, and room screenshot
attachments. It also adds a 1279↔1280 resize case. The desktop cases are unchanged;
the former 390px scaled-stage expectation is replaced by the new stacked cases.
Browser assertions, screenshots and pixel equivalence still require Director
verification outside this sandbox. No installs or git writes were performed.

WP12 Director review correction: the stacked drawings now have their own
`.dim` and `.litglow` rest rules. Both overlays have opacity 0, and the dim paint
uses `--night` with multiply blending, matching the desktop overview at rest.
This correction only adds `.stacked-art` selectors; desktop rules are unchanged.
The new Vitest regression failed before the correction and passes after it,
checking every stacked drawing's overlay rules and the retained wheel paints.
The two mobile e2e cases now assert computed overlay opacity/display and a
visible, non-black painted wheel interior in both themes. The wheel hook itself
is a group, so the paint assertion checks its explicitly painted descendants.
The DRAWN stamp expectation accepts the shared accessible name ending in
`Drawn`, preserving the Stamp grammar `Sealed by the streamer: Drawn`.

After this correction, site test/typecheck/lint/build and `node scripts/check.mjs`
all pass, as do e2e TypeScript and ESLint. The budget and test count above reflect
this rerun. The browser lane was retried and remains blocked at preview-server
startup with `Error: spawn EPERM`; the new computed-style assertions need the
Director's browser rerun. The Director's preceding review reported no horizontal
overflow at 360/390/768px and a minimum visible text size of 13px.
