# ADR 0002: Overlay host CSP for WP 3.2

Date: 2026-10-27

Status: Implemented for WP 3.2; browser enforcement/timing and live OBS verification pending

Decision authority: App Master decision under the plan's WP 3.2 acceptance; owner may overrule

## Context and constraint

The context below records the host before WP 3.2. The implementation and actual
verification limits are recorded at the end of this ADR.

[WP 3.2](../plan/03-implementation-plan.md#wp-32--design-packages-renderer-and-obs-delivery)
requires a CSS-first renderer, image layers, and package changes reaching OBS
within 1 s without a manual refresh. Curve changes must also reach the running
visual within that budget. The overlay loads no remote resource. Packages are
data-only by default; scripted packages run only on the overlay's own origin,
which has no route to `/rpc`. A package update that widens declared privileges
waits for the streamer's consent.

The current host binds IPv4 loopback and serves a static spike page plus an empty
`/beacons/{visual_id}` placeholder. It has no bundle, asset or push route
([crates/cc-obs/src/overlay.rs:19](../../crates/cc-obs/src/overlay.rs#L19),
[crates/cc-obs/src/overlay.rs:25](../../crates/cc-obs/src/overlay.rs#L25)). Its
middleware requires the exact Host `localhost:<bound port>`
([crates/cc-obs/src/overlay.rs:79](../../crates/cc-obs/src/overlay.rs#L79)).
The response CSP is currently:

```text
default-src 'none'; script-src 'none'; connect-src 'none'; img-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'
```

That header forbids the renderer bundle, push connections and images. The same
middleware sets `X-Content-Type-Options: nosniff` and `Cache-Control: no-store`;
its comment explains that OBS injects nonce-less style
([crates/cc-obs/src/overlay.rs:90](../../crates/cc-obs/src/overlay.rs#L90),
[crates/cc-obs/src/overlay.rs:101](../../crates/cc-obs/src/overlay.rs#L101)).

Origin separation already exists: the overlay has its own listener/router, while
the control router registers `/rpc` and `/events` separately
([crates/cc-obs/src/overlay.rs:19](../../crates/cc-obs/src/overlay.rs#L19),
[crates/cc-core/src/server.rs:80](../../crates/cc-core/src/server.rs#L80)).
`NativeServices` owns the overlay and starts it with `overlay_port`, but does not
yet hand it package or curve updates
([crates/cc-core/src/integration.rs:30](../../crates/cc-core/src/integration.rs#L30),
[crates/cc-core/src/integration.rs:89](../../crates/cc-core/src/integration.rs#L89),
[crates/cc-core/src/integration.rs:107](../../crates/cc-core/src/integration.rs#L107)).
This decision preserves that separation rather than assuming an existing push
channel or a shared RPC origin.

The current Beacons URL handler already returns the owned overlay's
`/beacons/{visual_id}` path
([crates/cc-core/src/beacons/mod.rs:94](../../crates/cc-core/src/beacons/mod.rs#L94)),
but `NativeServices::create_source` accepts only the exact root overlay URL
([crates/cc-core/src/integration.rs:204](../../crates/cc-core/src/integration.rs#L204)).
The queued host integration must reconcile source creation with validated
per-visual paths and package hashes on that same owned origin; accepting any
syntactically valid loopback URL would weaken the boundary.

## Decision

Widen only the overlay host policy needed for WP 3.2. For a bound overlay port
`<port>`, the intended header is this single string, substituting the actual port:

```text
default-src 'none'; script-src 'self'; connect-src http://localhost:<port>/push/beacons; img-src 'self' data:; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'
```

- `script-src 'self'` permits the locally served overlay bundle. Do not add inline
  script permission, `unsafe-eval`, a remote host or a remote renderer CDN. Serve
  only the host bundle and explicitly consented package script entry points as
  scripts. CSP's same-origin permission does not itself distinguish them; the
  asset router and privilege check must do so. Data-only packages do not execute
  package scripts. Scripted packages use local external script files, never eval,
  `new Function` or inline handlers.
- Choose `img-src 'self' data:`. Leonardo art is imported and served as a local
  package asset, never fetched from Leonardo by the overlay. `data:` permits
  host-produced embedded raster images without object-URL allocation and
  revocation; `blob:` is unnecessary. This does not expand `LocalAssetPath` to
  accept data URLs or remote URLs. Ordinary package images still resolve under
  their verified package root, including symlink confinement.
- Choose server-sent events (SSE), using `EventSource`, for one-way visual
  updates. The overlay has no command traffic to send, so a bidirectional
  WebSocket is unnecessary. Permit only the absolute HTTP URL of the same-origin
  `/push/beacons` endpoint in `connect-src`, with the actual bound port; do not
  permit all of `'self'`, a port wildcard, another host or a WebSocket scheme.
  `/push/beacons` is a proposed private read-only transport path, not an RPC
  method. Serve it directly, with no redirects or proxy facility.
- Keep `style-src 'unsafe-inline'` for OBS's nonce-less injected style and the
  renderer's inline styles. Keep `default-src 'none'`, `frame-ancestors 'none'`,
  `base-uri 'none'`, `form-action 'none'`, `nosniff`, `no-store` and the exact Host
  check. No additional resource class is authorized by this ADR.

Keep the overlay on a separate loopback listener, port and router from the
control service. Its router exposes only local rendering assets and read-only
push state: no `/rpc`, no control `/events`, no forwarding route, and no control
session capability in HTML, scripts, URLs or push data. Do not add overlay CORS
permission to the control service. The current control middleware requires its
session capability and checks Origin; the Origin allowlist names only the two
desktop origins
([crates/cc-core/src/server.rs:57](../../crates/cc-core/src/server.rs#L57),
[crates/cc-core/src/auth.rs:51](../../crates/cc-core/src/auth.rs#L51)). Preserve
those checks as defense in depth; CORS alone is not origin isolation.

### CSP ownership and NativeServices handoff

Keep CSP construction and the response security headers in `secure` in
`crates/cc-obs/src/overlay.rs`, where they live today
([crates/cc-obs/src/overlay.rs:79](../../crates/cc-obs/src/overlay.rs#L79)). The
future host builder substitutes the listener's actual port into the connection
source. Apply the policy to overlay pages and retain the Host and response-header
protection across the asset and push routes.

In the implementation, `NativeServices` in
`crates/cc-core/src/integration.rs` owns the in-process handoff to the overlay
push state. After a package is validated, its content hash and local assets are
verified, and any privilege expansion is consented, hand its accepted snapshot
to that state. After a successful curve mutation, hand over the accepted curve
and recomputed intensity for the visual. Feed subsequent intensity changes into
the same bounded channel. No overlay HTTP call to `/rpc` is involved.

The SSE host sends the latest accepted render snapshot on connection and
reconnection, then updates without reloading the page. Bound/coalesce pending
updates by visual and retain the latest state so a slow consumer or reconnect
does not leave stale art or intensity. The renderer updates its existing scene;
unchanged intensity causes no per-frame DOM rebuild. This handoff uses the merged
`BeaconsRenderSnapshot` contract and the separately registered private SSE event.

Reuse the plan's [Beacons contract rows](../plan/03-implementation-plan.md#contract-identifiers):
`beacons.source.url` returns `LoopbackSourceUrl` from the isolated overlay host;
loopback URL syntax alone does not prove isolation. Use `BeaconsIntensity` for
intensity and the `BeaconsEventPayload` bindings where applicable. The shared
`StreamEvent` remains an invalidation envelope, not an assumed package payload.
This ADR defines no new wire schema or RPC identifier. Any additional push
snapshot contract must land in `cc-types` in its own delivery before consumers
implement it. Preserve package-hash cache busting for source creation; live edits
use push updates rather than repeated OBS source refreshes.

## Alternatives that lost

- **Polling with meta refresh.** It misses the 1 s delivery target, and a page
  reload makes OBS flicker instead of updating the existing scene.
- **Refreshing the browser source through obs-websocket for every change.** It is
  too slow and produces a visible reload; keep obs-websocket for source setup.
- **A remote CDN for the renderer.** It breaks WP 3.2's no-remote-resource rule.
- **`unsafe-eval` for scripted packages.** It breaks the static no-eval proof and
  is unnecessary for local external scripts with declared privileges.
- **Sharing the `/rpc` origin.** It gives package code a route to the control
  plane and violates the required isolation, even if RPC still needs a token.

## Consequences

The overlay can run its own renderer, display local art and receive changes
without a reload while retaining a narrow resource policy. The host builder owns
the SSE lifecycle, bounded state, local asset confinement, privilege consent and
header enforcement. Scripts are opt-in; widening package privileges waits for
the streamer's consent before the new package becomes active. The CSP does not
replace schema validation, asset checks or that consent boundary. This is an
overlay-host decision, not permission to execute package scripts in the Twitch
Extension shell. The native implementation now serves a local bundle, verified
assets and accepted snapshots on the separate overlay listener.

## Verification

The overlay-host verification requirements are:

- Assert the exact CSP header string above for a known bound port, not a subset
  of its directives. Assert `nosniff`, `no-store` and refusal of an incorrect Host.
- Prove `/rpc` is unavailable on the overlay port and a request to the control
  service with the overlay Origin is refused, including a test with an otherwise
  valid simulated control capability to exercise the Origin check.
- Prove a remote URL in a package is rejected at the asset/schema boundary and
  blocked by the browser CSP without a remote fetch. Prove local bundle/images
  and same-origin SSE work; inline/eval scripts and other connections do not.
- Prove data-only defaults, no execution before consent, consent before an
  update widens privileges, and confinement of scripted packages to the overlay.
- Measure accepted package and curve changes through to rendered OBS output
  within 1 s without manual refresh. The overlay-host builder owns that timing
  measurement, including reconnect/latest-state behavior; this ADR claims no
  measured latency or completed implementation test.

## WP 3.2 implementation and evidence (2026-10-27)

`cc-obs::overlay::secure` constructs the exact port-specific header above and
applies it, nosniff and no-store even to errors and wrong-Host refusals.
`cc-core::overlay::RenderHost` supplies only read-only page/bundle/asset/SSE
routes to the owned listener. The control router and its CORS rules are unchanged.
`NativeServices` receives verified package imports and accepted intensity values;
Beacons commits configuration before publishing it. Rejected/oversized config
never commits, simulation never publishes, and a visual naming an unverified
design emits nothing. With the current configuration-only Beacons registration,
curve mutations recompute the empty contribution total. The native intensity
handoff accepts subsequent computed values; this adds no live contribution sink.

Packages use the documented v1 digest in `crates/cc-core/README.md`. The importer
captures bounded asset bytes after canonical filesystem confinement (including
symlinks/junctions), checks the digest and checks privilege consent before any
snapshot or script route becomes active. A later file edit cannot alter served
verified bytes. Only declared raster assets and consented local `.js` entry
points are served. The renderer is packaged as static output in `apps/overlay`
without another pnpm member or a lockfile change. A source fingerprint test
requires rebuilding that output when its inputs change.

| Requirement | Evidence |
| --- | --- |
| Exact CSP/security headers, wrong Host, no control routes | `simulated_overlay_csp_matches_adr_exactly`, `simulated_overlay_origin`, `local_bundle_assets_sse_contract_and_origin_isolation` |
| Valid simulated capability still refused from overlay Origin | `local_bundle_assets_sse_contract_and_origin_isolation` |
| Local bundle, immutable images, SSE event name and typed payload | `local_bundle_assets_sse_contract_and_origin_isolation` |
| Remote asset syntax/hash tampering refused; junction confinement | `schema_rejects_remote_assets_and_hash_verifier_rejects_tampering`, `asset_symlink_escape_is_refused` |
| Data-only default, unverified state withheld, consent and widening, coalescing/reconnect | `accepted_state_only_consent_widening_and_latest_on_reconnect` |
| Configuration acceptance, simulation isolation, bounded inventory | `rejected_visual_never_commits_and_simulation_never_changes_live_snapshot`, `render_inventory_is_bounded_and_unknown_intensity_is_rejected` |
| Scene retained with unchanged intensity; invalid push ignored | Renderer `overlay.test.ts` |
| Bundle source fingerprint and static no-eval proof | Renderer `overlay-build.test.ts` and `static-safety.test.ts` |
| Real browser CSP enforcement, scripts after consent, reconnect, n/p50/p95/max render timing | `native_handoff_to_browser_render_delivery_budget_and_csp` exists and compiles; execution failed before page load because Chrome's Windows IPC/crash server received access denied in the builder sandbox |

No browser timing sample or live OBS latency was measured in this delivery.
The explicit probe and manual OBS procedure are in `crates/cc-core/README.md`.
The Director must run that probe and record its actual results; the 1 s OBS
acceptance remains pending. Existing live OBS twins and cleanup tests are
preserved; the static spike plate is unchanged.

Builder checks, completed 2026-10-28: the Rust workspace test run and workspace
Clippy (`--all-targets -- -D warnings`) passed, as did Rust format, the desktop
production build (382338/393216 first-load bytes), renderer typecheck/lint and
all 83 renderer tests. After strengthening the simulated curve fixture and
computed-opacity probe, the eight focused core tests, three focused renderer
tests, core Clippy and browser-probe compilation passed again. Boundary,
hygiene, 400-line cap and secret scans pass. No manifest/lockfile or contract
file changed. `pnpm gate` passed its 14 tooling tests, workspace inventory and
Cargo fetch, then failed at the unchanged contract exporter with `spawnSync
cargo EPERM`. Recursive pnpm typecheck/lint/test each failed with `spawn EPERM`.
These restrictions are already recorded in base `docs/PLAN.md`; no full pnpm
gate pass is claimed. The Director must rerun it in its verifier.
