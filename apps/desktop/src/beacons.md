# WP 3.3 offline Beacons preview

The fixture-only Beacons route is lazy-loaded beside the Gatehouse route.
Three generated visual cards lead into a kindling curve, test-fire preview,
virtualised contribution history and a clearly unserved source URL placeholder.
Core mode keeps the previous empty state; the preview never imports a transport.

`beacons-model.ts` owns isolated local state. Curve points stay ordered with
integer totals in the preview's 0–100 weighted-sub domain and intensity 0–1.
Only subscriptions and gifts are combined, so incompatible contribution units
are never summed. Gift weights affect future test fires. A bomb inserts exactly
50 generated gift events. The initial totals and historical feed are illustrative
snapshots, not reconstructed accounting. The simulated clock advances 60 seconds
only on click; exponential decay acts on totals before interpolation.

The fixture and model use `parseMethodParams`/`parseMethodResult` with the public
`beaconsVisualList`, `beaconsCurveSet`, `beaconsSimulate` and `beaconsSourceUrl`
handles. This preserves schema validation without retaining the generic method
registry. No private contract imports or duplicate schema parsers are used.

SVG chart handles use pointer capture. Numeric fields provide keyboard access
to every point. The illustrative visual artwork stays fixed while its `--blaze`
custom property changes. SVG paint references are unique across cards and the
selected preview. This is not the shared design-package renderer; no OBS or
Extension delivery, asset loading, RPC or network path is implemented.
Copied URLs contain `fixture-not-live` and are explicitly labelled not served.
Clipboard unavailability and denial produce visible status instead of success.

The page extracts the prototype's three-card hero and numbered two-column
layout, using shared paper/stock tokens, components and co-located CSS. The feed
uses the kit's WindowedRows. Tests use server markup and actual component
handlers with a minimal pointer protocol, following the existing test pattern.
Screenshot fidelity and mounted-browser pointer/clipboard behavior remain
unverified: automatic approval review rejected Google Chrome access. No browser
fidelity or performance claim is made. Offline scope does not deliver to OBS.

## Verification on base c86462b, 2026-10-26

- Desktop production build passed the unchanged `src/check-build.ts` cap:
  **382,201 / 393,216 uncompressed bytes**, across two eager JS/CSS assets.
  Beacons and Gatehouse have deferred JS/CSS chunks. No budget/configuration
  change, dependency addition, install or lockfile change was made.
- Narrowed tests cover a 600-event bounded initial/end window; actual point
  edit/drag handlers changing `--blaze` while preserving the artwork; exactly
  50 gift events; local weighting; clock-driven decay; invalid points; visual
  selection/reset isolation; unique paint references; clipboard failure;
  fixture/core separation; and all four keyboard chamber shortcuts.
- Full `pnpm --config.verify-deps-before-run=false gate` passed all 14 tooling
  tests and workspace inventories, then failed in the unchanged contract
  exporter with `spawnSync cargo EPERM`, before Rust checks or recursive suites.
- Recursive `pnpm --config.verify-deps-before-run=false -r typecheck` and
  `-r lint` each failed to launch their package subprocesses with `spawn EPERM`.
  These failures are not green gates. App Master must run the full gate in
  its verification environment and review screenshots at 1440×900/1280×800.

Changes are confined to `apps/desktop`; package, contract, crate, prototype,
plan, lockfile and first-load checker files remain untouched. The external
result file records the final desktop-only checks and narrowed test counts.
