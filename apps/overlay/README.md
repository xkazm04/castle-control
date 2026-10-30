# Static overlay output

`index.html` and `bundle.js` are served by the isolated native overlay listener,
not the control service. This directory is deliberately not a pnpm workspace:
it has no package manifest, dependencies, install step or generated lockfile.

Rebuild from the existing desktop Vite tool, in the worktree root:

```powershell
pnpm --config.verify-deps-before-run=false --filter @castle-control/desktop exec vite build --config ../../packages/renderer/vite-overlay.config.mjs --configLoader native
```

The renderer's bundle-fingerprint test checks the tracked output against its
renderer/config/contract inputs. Commit both source changes and rebuilt output.
Cargo embeds this output in the native host so a clean checkout can compile and
serve it without an npm install or a build-time subprocess.

The HTML has one external same-origin module and no inline script. The module
embeds the unchanged token sheet and renderer styles, so text uses the UI font
and token ink while the canvas stays transparent for OBS composition. No extra
stylesheet route or CSP permission is needed. The module
connects only to `/push/beacons?visual_id=<slug>` and consumes the approved lazy
contract parser. Asset URLs name the visual, verified package hash and a declared
local path. All pages, assets and push responses receive the host CSP/security
headers. The static owner-attended spike plate at `/` remains separate.

The corner SIMULATED badge marks a simulated burst or preview, driven by
`BeaconsRenderSnapshot.simulated`. It survives package rebuilds and hides when
the next accepted snapshot is live; rejected snapshots leave its state unchanged.
