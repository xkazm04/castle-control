# Desktop and overlay browser lane

The Director's first run on main `71fd803` reported 58 failures, including
default serif leakage and the overlay's missing token styles. This polish
delivery addresses those sources and scopes the OBS transparency policy below.
It has not rerun Chrome or claimed new screenshots. The browser lane is not part
of `pnpm gate` or CI yet; its Node harness and style-policy tests run in `pnpm gate`.

Main now declares **`@playwright/test@1.64.1`** as an exact root devDependency;
the config enforces that exact runtime version. This polish delivery changes no
dependencies or lockfile and installs nothing.
Never install packages or browsers through a worktree's `node_modules` junction.

With that dependency and system Google Chrome already available, run from the
repo root:

```powershell
pnpm --config.verify-deps-before-run=false e2e
```

`pnpm e2e` runs the desktop/overlay lane, then `pnpm e2e:site`, which builds the site before running `e2e/site.config.ts` against its preview server on 5175; either lane failing makes the command fail.
Extra arguments in `pnpm e2e --headed` go only to the desktop lane; use `pnpm e2e:site --headed` for site arguments.
Optional `--headed` is for manual review; **headless is the default**. The two
projects use system `channel: 'chrome'` at 1440×900 and 1280×800. No bundled
browser download is needed. The server command is the desktop workspace's Vite
dev server on 127.0.0.1:5174 (override with CC_E2E_PORT; 5173 stays free for tauri dev), with a strict port and no reuse of an existing server.
`main.tsx` receives no native launch and therefore uses its fixture source.
No core, Twitch viewer, credential or paid call is involved.

## Coverage and evidence

`inventory.ts` reads the actual `chambers` declaration in the UI shell, walks the
`canonicalHash` AST for literals and ID templates, and runs that function in an
isolated VM to deduplicate aliases into canonical routes. It currently finds
nine routes, including `#/demo` and the OBS setup page `#/stream` (added in
`2ebd543`). Unknown template syntax fails rather than silently losing a route.
Empty ID, route, token and rendered-element inventories fail loudly. CSS custom
property names come from declarations in `packages/tokens/src/generated.css`
(currently 122 unique names), with no maintained token list.

Every route runs in paper and stock, with the Steward resting and open: currently
36 desktop cases per project. The Steward is already mounted in the current
shell; “open” focuses its real input via the rampart button and selects Overview's
Talkback tab where present. It submits no request. Routes wait for fixture and
lazy content, and assert that navigation stayed on the intended canonical hash.

Style checks compare against an empty browser document. They check resolved root
tokens, visible surfaces' font/colour/effective background, default serif leakage
through visible HTML elements, the default-white canvas, and document overflow.
Intentional brand serif stacks are permitted; browser-default serif is rejected.
Transparent child surfaces inherit their effective background from ancestors.
Only `overlay-simulated-connected` allows a transparent canvas: OBS composites
the page over the streamer's scene. Explicit browser-white backgrounds still
fail, and the rendered simulated layer must use the token UI font and ink.
Every desktop route retains the opaque canvas policy and all other checks.
The kit's `.cc-frame` base styles own select and text-like input chrome in every room.
Every desktop case audits visible fields for `appearance: none` and all four token borders (hidden, checkbox, radio and range inputs are excluded).
Fields require `--rule-thin`, except the named `strongBorderFields` list in
`styles.ts`: the Cutaway Steward prompt requires exactly `--rule-strong`.
Both paths require solid ink on all four sides, resolved under the field's theme.
The isolated Beacons overlay explicitly audits every declaration in its embedded
`generated-base.css` (135 tokens); desktop pages still require the full
`generated.css` inventory (299 tokens). Transparency alone never selects the subset.
The current chamber navigation appears as the keep cross-section, chamber strip
or room locator rather than the old vertical column; all are audited under that
surface role, alongside the frame, rampart and room body. Each surface counts its
matches and a missing surface fails. Console and uncaught page errors must be zero.

HTTP/SSE requests and WebSockets are guarded before navigation; non-loopback
destinations are blocked and recorded as failures. Service workers are disabled.
The diagnostics report counts requests and verifies both error listeners even
when an earlier assertion fails.

The overlay test owns an ephemeral loopback static server serving the real
`apps/overlay/index.html` and `bundle.js` unchanged at `/beacons/simulated-frame`.
It answers `/push/beacons?visual_id=simulated-frame` with two generated,
SIMULATED-labelled snapshots accepted by the actual contract parser, then asserts
the rendered text and final intensity. SSE stays open until teardown, avoiding
EventSource reconnect errors. No native listener is required. It applies the
same style/overflow/error policy to the canvas and rendered layer, with only
the explicitly scoped OBS transparency exception above.

The renderer embeds the unchanged token sheet and its overlay styles in the
single local module. Its canvas stays transparent; scene text inherits the UI
font and token ink. No test CSS is injected into product content.

Screenshots are taken in `afterEach`, including after failed assertions, at
`e2e/screenshots/<project>/<route-and-state-slug>.png`. They use stable names,
full-page capture, disabled animations and hidden carets. Both screenshots and
`e2e/test-results/` (including failure traces) are ignored. They are created only
by real runs. This is a style smoke lane, not a pixel-diff baseline suite.

## Checks without Playwright

`pnpm gate` starts with `scripts/e2e-harness-test.mjs`, which counts the Node
`e2e/*.test.ts` inventory and refuses an empty one. It runs both `harness.test.ts`
and `styles.test.ts` before Cargo or browser builds. The harness CSP matches the
native isolated overlay policy, including exactly `/push/beacons` and
`/push/gatehouse` on its own localhost port; the vote bar added in `dd93ea4`
subscribes to the latter. Native CSP and its strict parity assertion stay intact.

```powershell
node --test --test-isolation=none e2e/harness.test.ts e2e/styles.test.ts
pnpm --config.verify-deps-before-run=false exec tsc -p e2e/tsconfig.offline.json
pnpm --config.verify-deps-before-run=false exec eslint e2e --max-warnings 0
```

The Node tests exercise live source discovery, synthetic route additions,
negative/empty inventories, loopback URL policy, and the real contract-parser
and static/SSE server. Policy tests also keep desktop canvas checks strict and
reject missing/non-token overlay text styles under the transparency exception.
They cover both field widths, every border side, both themes, rejected native
chrome, and missing tokens under both the full and explicitly scoped base sheets.
They require no browser or Playwright runtime.
`--test-isolation=none` runs them in-process because this headless Windows
environment can deny the default test runner's child-process spawn.
The offline TypeScript config uses a **compile-only local API subset shim**;
it checks this lane's strict TS but cannot certify compatibility with Playwright.
With the installed dependency, check against the real declarations instead:

```powershell
pnpm --config.verify-deps-before-run=false exec tsc -p e2e/tsconfig.json
```

The directory is deliberately outside `pnpm-workspace.yaml`. CI can run headless
once Chrome, Node 24+, pnpm and the exact dependency are provisioned, with port
5174 available. It is **not yet proven reliable in CI**: system Chrome can drift,
the amended browser assertions still need the Director's run and screenshots.
Run it for real and retain evidence before adding it to the blocking gate.

Initial lane delivery validation (before main installed Playwright): the six in-process harness tests, offline strict TypeScript,
e2e ESLint and repository boundaries/hygiene/file-cap/secrets checks passed.
`pnpm --config.verify-deps-before-run=false gate` stopped in the unchanged contract
exporter with `spawnSync cargo EPERM`; recursive typecheck/lint/test also stopped
with `spawn EPERM`. The relevant gate/exporter files match HEAD. This is not a
green full gate. The attempted browser command stopped with `unknown command
'test'`; `import.meta.resolve('@playwright/test')` reports `ERR_MODULE_NOT_FOUND`.
The root manifest therefore adds only the requested script, leaving dependencies
and `pnpm-lock.yaml` unchanged for the Director's installation.

## WP15 merged Cutaway reconciliation (2026-10-31)

The initial Director run recorded 66 passes and 96 failures; the first WP15
rerun reached 160/162, leaving only the two Map Room journeys at 1280×800.
No browser ran in the builder sandbox. The compact-height follow-up still
requires the Director's desktop lane rerun at both viewports.

| Failure | Cause and change |
| --- | --- |
| 89 field audits | The Steward prompt's fidelity border is intentionally strong. One named selector exception resolves that token; ordinary fields still require thin ink borders. Pure policy tests exercise acceptance and rejection on every side in paper and stock. No kit CSS changed. |
| Demo provenance, both sizes | The marks still render as shared Stamps. Assertions now use `data-stamp="simulated"` and `data-stamp="off-air"`, including the clipping check, in every one of the 36 states. |
| Lot policy warning, both sizes | The failure snapshot contains the desk's own warning paragraph as well as template-card copy. The locator now requires the exact warning paragraph inside `Writ desk contents`, rather than a direct child of `.cc-desk`. No Lot UI changed. |
| Map Room journeys, 1280×800 | The first compact fix left the size-contained field at 0×0. A wrapper minimum did not give its flex descendants a definite height. The rendered wrapper now has an active-view hook and a definite compact height. Table and Rehearse receive non-shrinking query-container heights derived from board geometry and the space-28 radius; Spyglass fills a bounded scroll area and retains its source-sized previews. All overrides are restricted to heights up to 50rem. The original 44px target and selection assertions remain. Browser confirmation is pending. |
| Isolated Beacons overlay, both sizes | The only reported errors are desktop-only token names absent from the renderer's deliberately embedded base sheet. Only this test opts into the base-sheet inventory; it still checks every shipped token, font, ink, surface, canvas and overflow rule. Desktop and other callers retain the full inventory. No overlay product CSS or bundle changed. |

Validation: desktop typecheck/lint and 1,019 tests in 103 files pass, including
the rendered active-view hook and compact sample-board geometry regressions. UI
typecheck/lint and 441 tests in 30 files pass. The real Playwright-declaration e2e
typecheck, e2e ESLint, six in-process style-policy tests and `node scripts/check.mjs`
pass. The combined harness retains exactly the two Director-identified main
failures: nine routes versus eight expected, and the native/harness overlay CSP
disagreement. Those tests and the harness policy are unchanged. No installs, git
writes, live calls or browser runs were performed.
