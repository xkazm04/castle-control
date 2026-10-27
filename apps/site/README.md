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
2,800 ms. Any keyboard or pointer input ends it immediately, and the visible
Skip intro button supports native keyboard and pointer activation. Reduced
motion starts at the complete composition, schedules no intro, and disables
all animations and transitions. There is no ambient autoplay motion.

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
pnpm --config.verify-deps-before-run=false exec eslint apps/site --max-warnings 0
node scripts/check.mjs
```

The static check counts its inventory and checks every local href/src and SVG
target, unique IDs, direct token consumption, wordmark strokes, policy labels,
copy hygiene, no remote scripts/fonts, the 400-line cap and a **180 KiB** total
uncompressed first-load budget (HTML, CSS, JS, SVG and shared tokens). The finite
four-chamber marketing content has no growing live lists to virtualise.

The five behavior tests execute the actual `site.js` in a small DOM adapter.
They cover the real event-loop handover timer, keyboard/pointer skip, reduced
motion at startup and when changed, all chamber shortcuts, nested views,
route validation, focus return, hover and both themes. An initial successful
run measured visual handover at **2,808 ms**; the final run measured **2,815 ms**.
The final first-load inventory was **97,081 bytes**. This is script timing, not a
browser paint or navigation measurement. The default isolated Node test runner
failed to spawn; the repository's documented in-process mode above passed.

## Required Director browser proof

**No screenshot was taken and no rendered layout assertion was run here.**
Chrome is installed, but launching it from Node in this sandbox failed with
`spawn EPERM`. Static checks and DOM-adapter tests cannot establish pixel
fidelity or the full browser time to control. Run this procedure on a machine
that permits a browser, saving proof outside the worktree:

1. Serve the repository root as above. Open `/prototype/index.html` and
   `/apps/site/index.html`. In DevTools device emulation set the viewport to
   **1920x1080**, then **1280x800**, then **390x844**, with scale 100% and DPR 1.
   Do not substitute the outer browser window dimensions for the viewport.
2. At each size, capture the home print in paper and dark stock, and all four
   chamber views. Compare retained paper, ink, type, ruled notes, masthead,
   desktop composition and mobile strips. The deliberate wordmark-mask fix
   should leave both L feet solid. Check no clipping, banner/masthead overlap,
   horizontal page overflow, or body text below 13 CSS pixels. The 390 viewport
   should show four vertical strips and a banner with a release link.
3. Reload without interacting. After the print settles, record
   `document.body.dataset.navigationReadyMs` and
   `document.body.dataset.controlReadyMs`. Both are milliseconds from browser
   navigation start. The second, conservative visual-handover measurement must
   be below **4000**; navigation must already work before it. Capture the result.
4. Reload, press Tab during the print, and confirm printing stops. Repeat with
   the Skip intro button using Enter and a pointer click. Tab/Enter through all
   four strips/banner links, open Full feature list, then return with Escape and
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

The sandbox also denied recursive pnpm typecheck/lint lifecycle spawns and
`pnpm gate` at the contract exporter's `spawnSync cargo` boundary. Those commands
did not pass. App Master must run the normal workspace gates during review.
No install was run and the existing `node_modules` junction was not modified.
