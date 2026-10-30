# Desktop and overlay browser lane

The Director's first run on main `71fd803` reported 58 failures, including
default serif leakage and the overlay's missing token styles. This polish
delivery addresses those sources and scopes the OBS transparency policy below.
It has not rerun Chrome or claimed new screenshots. This lane is not part of
`pnpm gate` or CI yet.

Main now declares **`@playwright/test@1.64.1`** as an exact root devDependency;
the config enforces that exact runtime version. This polish delivery changes no
dependencies or lockfile and installs nothing.
Never install packages or browsers through a worktree's `node_modules` junction.

With that dependency and system Google Chrome already available, run from the
repo root:

```powershell
pnpm --config.verify-deps-before-run=false e2e
```

The expanded command is `playwright test -c e2e/playwright.config.ts`.
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
eight routes, including `#/demo`. Unknown template syntax fails rather than silently losing a route.
Empty ID, route, token and rendered-element inventories fail loudly. CSS custom
property names come from declarations in `packages/tokens/src/generated.css`
(currently 122 unique names), with no maintained token list.

Every route runs in paper and stock, with the Steward resting and open: currently
32 desktop cases per project. The Steward is already mounted in the current
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

```powershell
node --test --test-isolation=none e2e/harness.test.ts e2e/styles.test.ts
pnpm --config.verify-deps-before-run=false exec tsc -p e2e/tsconfig.offline.json
pnpm --config.verify-deps-before-run=false exec eslint e2e --max-warnings 0
```

The Node tests exercise live source discovery, synthetic route additions,
negative/empty inventories, loopback URL policy, and the real contract-parser
and static/SSE server. Policy tests also keep desktop canvas checks strict and
reject missing/non-token overlay text styles under the transparency exception.
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
