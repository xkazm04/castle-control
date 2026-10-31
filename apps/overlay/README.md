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

## Browser-source sizing and display URL grammar (lane L5)

Add the copied URL as an OBS Browser Source at **1920x1080** or **1280x720**.
Keep the page background transparent. The HTML declares transparency, full
viewport dimensions and hidden overflow before its module loads. The renderer
fits the complete layer envelope into the viewport, including negative positions,
layer scales and the extrema of intensity bindings. It keeps that envelope stable
as intensity changes, and fits again on viewport resize or package replacement.
Text wraps and clips inside its declared layer box. No scrollbars are needed.

The display-only grammar on `/beacons/{visual_id}` is:

| Query key | Accepted value | Default |
| --- | --- | --- |
| `scale` | An unsigned decimal number in **[0.5, 2]**, inclusive (`0.5`, `.5`, `1`, `1.25`, `2.0`) | `1` |
| `anchor` | Exactly `tl`, `tr`, `bl`, `br`, or `center` (case sensitive) | `center` |

Use `?scale=0.5&anchor=br` on a URL with no query, or append
`&scale=0.5&anchor=br` after the existing `?package_hash=<hash>`. URL decoding
follows `URLSearchParams`. A missing, empty, repeated or invalid key falls back
independently to its default. Scale rejects signs, whitespace, exponents, hex,
NaN and Infinity. Unrelated keys do not affect the renderer. `package_hash`
retains its existing identity/cache role; display options never change it.
This is also the grammar for lane L1's `/lots/{draw_id}` implementation.

Scale multiplies logical pixels, capped by the scale needed to keep the entire
envelope inside the viewport: `min(scale, viewport_width / envelope_width,
viewport_height / envelope_height)`. It never stretches the aspect ratio or
forces an oversized visual outside the frame. The anchor places that envelope
at the chosen corner or centre. Default scale does not enlarge small artwork.
The SIMULATED badge stays outside the transformed art's layer list. For corner
anchors it uses the diagonally opposite viewport corner (`br` puts it top-left);
for `center` it uses bottom-right. This avoids covering corner-anchored artwork
smaller than half the viewport; full-frame artwork can still reach the badge.

`parseOverlayDisplay` in the entry is the sole value parser. No RPC method,
event or contract field is added, and `beacons.source.url` is unchanged.
`obs.source.create` also accepts these two presentation keys on the owned
Beacons URL; it forwards them verbatim while requiring the current verified
package hash. Unknown keys, foreign origins and stale hashes remain refused.
All page, module, asset and push responses retain `Cache-Control: no-store`;
package changes still arrive over the existing snapshot stream with no refresh.

## Stream lifecycle and asset failures

An open push stream ends when its accepted design becomes unverified. On any
stream error the renderer clears its layers, bindings, diagnostics and SIMULATED
badge, so a disconnected source cannot freeze old art on air. A fresh stream
waits silently until a verified package is available; its next accepted snapshot
rebuilds the scene, even if it has the same hash as the cleared package.

CONNECTING streams keep EventSource's native reconnect. CLOSED streams (including
HTTP 404/503 refusals) get one retry timer: 2, 4, 8, 16, then at most 30 seconds
between attempts. Opening a stream resets that delay. Disposal cancels retries
and ignores callbacks from disposed or superseded streams. No wire event or
contract field was added. Decorative image layers use an empty alternative and
hide on load failure, leaving transparent space rather than a broken-image glyph.

## Verification

```powershell
pnpm --config.verify-deps-before-run=false exec playwright test -c e2e/playwright.config.ts e2e/journey-obs.spec.ts --project chrome-1440x900
pnpm --config.verify-deps-before-run=false --filter @castle-control/renderer exec vitest run --pool=threads --cache=false
cargo test -p cc-core --test overlay_host --test obs_native --locked
cargo test -p cc-obs --test protocol --test overlay --locked
```

The journey overrides its own viewports to 1920x1080 and 1280x720, using only
the real static overlay bundle and generated contract-parsed snapshots from
`e2e/overlay-server.ts`. Its synthetic `simulated: false` case tests badge hiding;
it connects to no live OBS or Twitch. The Director runs Chrome and the
owner-attended OBS check; the test does not claim a real OBS timing measurement.
On base, the expected-red browser assertions are oversized-layer containment,
document overflow, scale widths, anchor positions and invalid-query centering. Existing transparent
background, package-push and SIMULATED behaviour are regression assertions.

Builder evidence (2026-10-31): the focused red run had four failures (missing
display parser, missing resize/fitting in two cases, and missing pre-paint
overflow rules); six existing overlay cases passed. Native CreateInput with
display options also failed before the URL-ownership change. Final renderer
verification passes all 98 tests in 17 files, including the bundle fingerprint,
static no-eval/remote-resource checks and provenance regressions. Renderer
typecheck/lint, e2e typecheck/lint, ten offline e2e harness/style tests, six
focused native host/CreateInput tests and ten cc-obs protocol/host tests pass.
The Vite config disables copying the desktop public tree into this isolated
output. Workspace Clippy, Rust formatting and the desktop bundle budget pass.
`cargo test --workspace --locked` also passes, including all doc-tests; explicit
owner-only live tests and the browser probe remain ignored.
The Chrome journey could not launch (`spawn EPERM`), so its browser red/green
remains unobserved. The root gate stops at the unchanged contract exporter
(`spawnSync cargo EPERM`), and recursive pnpm checks stop at lifecycle
`spawn EPERM`, also recorded in base `docs/PLAN.md`; no full pnpm pass is claimed.

### Stabilize renderer chain (obs-03, obs-06, obs-07, obs-08)

Rechecked all four premises at `ff5ca52`; none was already fixed. Failing-first
evidence from this worktree on 2026-10-31:

| Item | Before the fix | After the fix |
| --- | --- | --- |
| obs-03 | `cargo test -p cc-core --test overlay_clear --locked` timed out waiting for stream EOF; two renderer error-state cases retained one child | Native EOF/reconnect test passes; both CONNECTING/CLOSED cases clear layers and badge, and the same package rebuilds |
| obs-06 | Retry test created no second EventSource; cancellation test found no timer | Retries follow 2/4/8/16/30/30 seconds, reset on open, render on recovery, and cancel on disposal; CONNECTING keeps native retry |
| obs-07 | `overlay.test.ts` found no badge `data-anchor` | Parsed anchor reaches the badge; CSS uses the opposite corner; synthetic live snapshots still hide it |
| obs-08 | Image alternative was absent; a dispatched image error left `hidden=false` | Empty alternative and hidden failed image; replacement package creates a fresh visible image |

Renderer cases ran with `pnpm --config.verify-deps-before-run=false --filter
@castle-control/renderer exec vitest run src/overlay.test.ts
src/overlay-chain.test.ts --pool=threads --cache=false`. Final full renderer
verification passes 184 tests in 22 files, including the bundle fingerprint;
the bundle was rebuilt once with the command above. The required whole desktop
test command passes 594 tests in 62 files. Scoped renderer/e2e typecheck and lint,
import boundaries, hygiene, file cap and secret scan pass. Desktop and kit builds
pass their token and first-load budgets. `cargo fmt --all -- --check`,
`cargo clippy --workspace --all-targets -- -D warnings` and
`cargo test --workspace --locked` pass, including the whole cc-core suite,
`overlay_clear`, the four existing `overlay_host` tests and doc-tests. Existing
owner-only live tests remain ignored; no live Twitch/OBS validation is claimed.

The added browser box-intersection assertion covers all five anchors at both OBS
sizes, but its red/green result could not be observed: both the focused pre-fix
run and final `pnpm --config.verify-deps-before-run=false e2e journey-obs.spec.ts`
stop at `spawn EPERM` before running browser assertions. The root `pnpm gate`
stops at the unchanged contract exporter (`spawnSync cargo EPERM`); recursive
pnpm typecheck/lint/test stop at lifecycle `spawn EPERM`. These subprocess restrictions
are also documented at base HEAD in `docs/PLAN.md`; those launchers are unchanged.
Director validation is still required; no full gate or browser pass is claimed.
