# Castle Control landing site (WP 6.2)

This is a static HTML/CSS/JS site. It has no build step, package manifest,
workspace membership, dependency, analytics, app bridge or live data connection.
Serve the **repository root**, then visit `/apps/site/index.html`. For example,
run `python -m http.server 8080 --bind 127.0.0.1` from the repository root.
Direct `file:` viewing is not the delivery target: browsers can refuse external
SVG fragments on that scheme. No new hosted service is required.

## Tokens, artwork and fonts

`index.html` references `../../packages/tokens/src/generated.css` directly.
That file remains the single source; no token copy or second palette exists.
Static deployment must include it at the same relative location. `check.mjs`
checks this reference and refuses raw colors or pixel literals in site styles.
The site is not an independently deployable copy of just this directory.

`art.svg` holds extracted vector design assets: lettering, chamber illustrations
and the keep's five plates from `prototype/index.html`, `landing.js` lettering
data and `mark.js` geometry. The variable illustrative fields (stone stipple,
ticket arrangement, sample chat/chart and map) are static compositions here.
No prototype runtime, event handlers, CSS or sample-data loader is used.
`site.css` and `site.js` are new implementations of the design and interactions.
The brand mark is defined once in the HTML and reused by SVG reference.

The follow-up rebuilds the missing textures as static vector geometry in
`art.svg`, not prototype runtime code. `beacon-glow` contains 713 gold dots in
fading rings around the two flames, including the flame over the wordmark's O.
The rings leave the flame cores and tower faces clear. `moat-tone` contains 697
blue dots on a diagonal grid, growing denser toward the moat's lower edge behind
the waves. Both inherit the existing `--or` / `--azure` shared tokens and the
plate's theme blend. Neither adds an asset, palette, script, continuous animation
or layout box. Reduced motion retains both as calm, static print textures.
The page uses the generated system-font stacks unchanged. No remote font or
font service is used; absent platform faces fall through the shared stack.

### Wordmark defect and fix

The prototype desktop wordmark applies `wmMask`: its lower 38% dissolves into
halftone holes. The L foot is in the bottom 24% of the glyph, so the mask removes
the distinguishing stroke. The name can read "CASTIE CONTROI". The mobile
wordmark does not apply that mask and keeps the feet.

Both site wordmarks use the same complete condensed vector outlines and an
offset gules print. No knockout mask crosses the letter feet. The L outline is
`M0 0H24V76H50V100H0Z`; the horizontal stroke remains present at full opacity.
`check.mjs` asserts that outline and the absence of the dissolving mask. Inspect
both L letters at the desktop screenshot sizes before approving visual fidelity.

## Behavior and honest availability

The home print uses a 1600 by 1000 composition, warm paper, three heraldic inks,
key ink, halftone, registration marks and the tagline card. Narrow/portrait
viewports use stacked lettering and four illustrated strips. The masthead and
five-link banner stay fixed. Chamber views use full-bleed print illustrations,
numbered ruled notes and a further feature view with Back.

Native links and buttons support Tab and Enter. The single keymap implements
1 through 4, Escape (one level back), and left/right between open chambers.
Returning home restores focus to the originating link. Hashes are validated
against four known chambers and an optional `/features` suffix. Invalid hashes
show home. Without JS the page has no intro; all chamber content remains
available in document order. The theme toggle lasts for the current visit and
uses the shared paper/stock definitions; it does not write desktop app settings.

Navigation is enabled from the outset. For normal motion the five plates
register in sequence, then the drawbridge drops. The visual handover timer is
2,800 ms, shortened to the remaining time before 4,000 ms from navigation start
if script startup is delayed. Navigation stays enabled throughout. A chamber
shortcut or pointer input outside Skip intro ends printing immediately.
The named, native Skip intro button is second in document tab order, directly
after Skip to content. Tab keeps it visible; Enter, Space and pointer activation
reach its native click handler before it is hidden. Skip moves focus to the
first chamber link, as does automatic handover if the skip button has focus.
Reduced motion starts at the complete composition, schedules no intro, and
disables all animations and transitions. There is no ambient autoplay motion.

Honesty labels present in the page:

- Stylised illustration, drawn rather than captured.
- Sample data from a fictional channel, with invented numbers.
- Castle Control is a working name.
- Not affiliated with or endorsed by Twitch.
- In development; check releases for shipped features, artifacts and signing.
- Public Extension availability awaits Twitch policy approval and review.

The exact repository URL was read from this worktree's `git remote -v`:
`https://github.com/xkazm04/castle-control`. Downloads and Get the app point
to its `/releases` page, Docs to `/tree/main/docs`, and Source to the repository.
No download artifact, signed build or approved Extension is claimed.

## Reproducible checks

Run from the repository root, without installing anything:

```powershell
node apps/site/check.mjs
node --test --test-isolation=none apps/site/site.test.mjs
node node_modules/eslint/bin/eslint.js apps/site --max-warnings 0
node scripts/check.mjs
```

The static check counts its inventory and checks every local href/src and SVG
target, unique IDs, direct token consumption, wordmark strokes, policy labels,
copy hygiene, no remote scripts/fonts, the 400-line cap and a **180 KiB** total
uncompressed first-load budget (HTML, CSS, JS, SVG and shared tokens). The finite
four-chamber marketing content has no growing live lists to virtualise.

The nine behavior tests execute the actual `site.js` in a small DOM adapter
with a controlled monotonic clock, including `performance.now`, `setTimeout`
and `clearTimeout`. They never sleep. The unattended intro is still printing at
2,799 ms and hands over at exactly **2,800 ms**, with no timer left. A simulated
2,500 ms script startup shortens printing and hands over at exactly **4,000 ms**
from navigation start. Reduced motion hands over at **0 ms** with no timer;
switching the preference at 800 ms also cancels the pending timer.

The tests assert a named native button before header links, uncancelled Tab and
Enter/Space, survival through pointerdown until click, focus return, cancelled
timers, shortcuts, nested views, route validation, hover and both themes.
Five new regression cases failed against the previous implementation before
its handlers were fixed. Native event dispatch and keyboard traversal still
need browser verification; the adapter checks the actual handlers and markup.
The first-load inventory after restoring both textures is **152,814 bytes**.

## Required Director browser proof

**No screenshot was taken and no rendered layout assertion was run here.**
The browser automation interface reports no available browsers in this build
session. Static checks and DOM-adapter tests cannot establish pixel fidelity,
horizontal overflow or the full browser time to control. Run this procedure on
a machine that permits a browser, saving proof outside the worktree:

1. Serve the repository root as above. Open `/prototype/index.html` and
   `/apps/site/index.html`. In DevTools device emulation set the viewport to
   **1920x1080**, then **1280x800**, then **390x844**, with scale 100% and DPR 1.
   Do not substitute the outer browser window dimensions for the viewport.
2. At each size, capture the home print in paper and dark stock, and all four
   chamber views. Compare retained paper, ink, type, ruled notes, masthead,
   desktop composition and mobile strips. The deliberate wordmark-mask fix
   should leave both L feet solid. Check the gold dotted halo behind the flame
   over the O and the blue dotted moat behind its waves in both themes.
   Check no clipping, banner/masthead overlap,
   horizontal page overflow, or body text below 13 CSS pixels. The 390 viewport
   should show four vertical strips and a banner with a release link.
3. Reload without interacting. After the print settles, record
   `document.body.dataset.navigationReadyMs` and
   `document.body.dataset.controlReadyMs`. Both are milliseconds from browser
   navigation start. The second, conservative visual-handover measurement must
   be at or below **4000**; navigation must already work before it. Capture the result.
   A slow page load or a blocked browser main thread can delay browser timers;
   the controlled-clock test proves the script deadline, not a paint guarantee.
4. Reload, press Tab twice during the print, and confirm Skip intro receives
   focus and remains visible. Activate it with Enter, then repeat using Space
   and a pointer click. Printing stops and focus moves to the first chamber link.
   Tab/Enter through all four strips/banner links, open Full feature list, then return with Escape and
   each Back link. Confirm origin focus returns; drive 1 through 4 and left/right.
   Check hover ghosting and the chamber name printed above the keep.
5. In DevTools Rendering, emulate `prefers-reduced-motion: reduce` and reload.
   The complete composition should appear with no autoplay motion, no visible
   Skip intro control and no running animation. Record
   `document.getAnimations().filter(a => a.playState === 'running').length`
   (expected zero). Check all navigation and theme switching again.
6. At each viewport check `document.documentElement.scrollWidth <= innerWidth`,
   document order and visible focus, then inspect the console/network panel for
   broken resources or CSP errors. Only local page assets should load; outbound
   navigation happens only through the explicit GitHub links. Re-run with JS
   disabled to verify the ordinary anchor fallback.

Follow-up validation, 2026-10-28: `check.mjs`, all nine behavior tests, direct
site ESLint and `node scripts/check.mjs` passed. The latter walked 556 code
files for boundaries, hygiene and the file cap, and 690 files for secrets.
Both texture groups parse as SVG and every new dot stays inside the existing
1600 by 1000 viewBox. No CSS or layout dimensions changed.

Recursive pnpm typecheck and lint failed at lifecycle startup with `spawn EPERM`.
`pnpm --config.verify-deps-before-run=false gate` passed 14 tooling tests and the
workspace inventory, then failed at the contract exporter with `spawnSync cargo
EPERM`. Those commands did not pass; their runners are unchanged from HEAD.
App Master must rerun the normal full gate, recursive typecheck/lint, workspace
tests and desktop build during review, plus the separate site checks above.
Browser screenshots, native skip activation and horizontal-overflow assertions
at all three sizes remain required. No install was run and the existing
`node_modules` junction was not modified.
