# Desktop and overlay browser lane

Status at delivery: **not yet run**. `@playwright/test` is not resolvable in the
shared install. No browser test result or screenshot is claimed. This lane is
not part of `pnpm gate` or CI yet.

The Director must install **`@playwright/test@1.55.1`** as an exact root
devDependency in the main checkout and update its lockfile there. The config
also enforces that exact runtime version. Version 1.55.1 predates this dispatch
by more than two weeks ([release](https://github.com/microsoft/playwright/releases/tag/v1.55.1)).
This builder changed no dependencies or lockfile, and installed nothing.
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
dev server on 127.0.0.1:5173, with a strict port and no reuse of an existing server.
`main.tsx` receives no native launch and therefore uses its fixture source.
No core, Twitch viewer, credential or paid call is involved.

## Coverage and evidence

`inventory.ts` reads the actual `chambers` declaration in the UI shell, walks the
`canonicalHash` AST for literals and ID templates, and runs that function in an
isolated VM to deduplicate aliases into canonical routes. It currently finds
seven routes. Unknown template syntax fails rather than silently losing a route.
Empty ID, route, token and rendered-element inventories fail loudly. CSS custom
property names come from declarations in `packages/tokens/src/generated.css`
(currently 122 unique names), with no maintained token list.

Every route runs in paper and stock, with the Steward resting and open: currently
28 desktop cases per project. The Steward is already mounted in the current
shell; “open” focuses its real input via the rampart button and selects Overview's
Talkback tab where present. It submits no request. Routes wait for fixture and
lazy content, and assert that navigation stayed on the intended canonical hash.

Style checks compare against an empty browser document. They check resolved root
tokens, visible surfaces' font/colour/effective background, default serif leakage
through visible HTML elements, the default-white canvas, and document overflow.
Intentional brand serif stacks are permitted; browser-default serif is rejected.
Transparent child surfaces inherit their effective background from ancestors.
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
same style/overflow/error policy to the canvas and rendered layer.

**Known source-level finding, not an executed browser result:** the current
overlay HTML loads no tokens, has a transparent canvas by design, and its text
layers set no font. The strict style audit will report those omissions. No test
CSS is injected and no app styles are changed here. The Director should review
that result against OBS transparency requirements before wiring the lane into CI.

Screenshots are taken in `afterEach`, including after failed assertions, at
`e2e/screenshots/<project>/<route-and-state-slug>.png`. They use stable names,
full-page capture, disabled animations and hidden carets. Both screenshots and
`e2e/test-results/` (including failure traces) are ignored. They are created only
by real runs. This is a style smoke lane, not a pixel-diff baseline suite.

## Checks without Playwright

```powershell
node --test --test-isolation=none e2e/harness.test.ts
pnpm --config.verify-deps-before-run=false exec tsc -p e2e/tsconfig.offline.json
pnpm --config.verify-deps-before-run=false exec eslint e2e --max-warnings 0
```

The Node tests exercise live source discovery, synthetic route additions,
negative/empty inventories, loopback URL policy, and the real contract-parser
and static/SSE server. They require no browser or Playwright runtime.
`--test-isolation=none` runs them in-process because this headless Windows
environment can deny the default test runner's child-process spawn.
The offline TypeScript config uses a **compile-only local API subset shim**;
it checks this lane's strict TS but cannot certify compatibility with Playwright.
After installation, check against the real declarations instead:

```powershell
pnpm --config.verify-deps-before-run=false exec tsc -p e2e/tsconfig.json
```

The directory is deliberately outside `pnpm-workspace.yaml`. CI can run headless
once Chrome, Node 24+, pnpm and the exact dependency are provisioned, with port
5173 available. It is **not yet proven reliable in CI**: system Chrome can drift,
browser assertions have not run, and the overlay policy finding needs review.
Run it for real and retain evidence before adding it to the blocking gate.

Delivery validation: the six in-process harness tests, offline strict TypeScript,
e2e ESLint and repository boundaries/hygiene/file-cap/secrets checks passed.
`pnpm --config.verify-deps-before-run=false gate` stopped in the unchanged contract
exporter with `spawnSync cargo EPERM`; recursive typecheck/lint/test also stopped
with `spawn EPERM`. The relevant gate/exporter files match HEAD. This is not a
green full gate. The attempted browser command stopped with `unknown command
'test'`; `import.meta.resolve('@playwright/test')` reports `ERR_MODULE_NOT_FOUND`.
The root manifest therefore adds only the requested script, leaving dependencies
and `pnpm-lock.yaml` unchanged for the Director's installation.
