# Beacons detail room (AI-6)

## AI-9 room polish

Open `#/chamber/visuals` in fixture mode. The Director's Lit Keep stills at
1440x900 and 1280x800 guide the two-column composition. The shell supplies the
display header; the gold-framed stage has token padding at every breakpoint.
Its large artwork and read-only kindling curve use the existing preview model.
Cards have display headings, a Now line and an active range derived from each
visual's current total. Miniature duplicate artwork is removed. Test fire stays
in a native details disclosure; all four controls retain their existing handlers.

The optional `seal_slot` is supplied by the shell under the right column, after
the offerings timeline. It is the original shared queue and hold control, not
another proposal store. The Steward bar remains at the bottom of the app.
DOM/CSS tests prove token padding, captioned figures and tier changes after a
local burst. Existing keyboard and accounting tests remain the behavior proof.

`room.tsx` default-exports `VisualsRoom({ snapshot }: { snapshot: Snapshot })`.
`Snapshot` comes from `../../model.ts`. The module can be imported with React
`lazy`; it imports neither the app entry nor the view. It defines no breadcrumb,
seal control, or Steward input. The shell owns those and supplies the seal slot.

Fixture mode shows an illustrated altar, camera frame and border with ranges
from the unchanged `beacons-model.ts`. Selection, gifts, subscriptions and clock
advancement change a local preview only. End test fire creates a fresh preview.
There is no OBS delivery. The 60 fictional offerings are copied as data from
`prototype/ai-first/data/sample.js` into `beacons-fixture.ts`; they are separate
from the existing 600-event model fixture. The timeline's native range exposes
every offering to keyboard users. It does not feed accounting.

`ProposalLayers` subscribes to the shared `proposalQueue` and reads pending
`visuals` proposals. Dashed layers say `DRAFT · NOT ON AIR`, show struck amendment
values and never change the preview model or proposal state. Tests inject a
separate queue into `VisualsWork`. The fixture view has no network or execution adapter.

## Mounted in wave 2b

The shell lazily mounts `VisualsRoom` at `#/chamber/visuals`, passing `snapshot`.
Fixture mode keeps the existing local preview. Breadcrumb, Back/Esc,
seal slot and Steward remain owned by the shell. The room-wide provenance strip
is removed; draft layers still say `DRAFT ? NOT ON AIR`.

## WP 3.1 core connection

Core launches use `coreBeaconsConnection(snapshot)`, following the existing
per-client WeakMap convention. Launch credentials stay in memory outside read
snapshots. The cached `createCoreBeaconsPort(launch, transport?)` survives shell
snapshot updates and room navigation. A missing connection renders an honest
unconfigured state; it never substitutes the fixture preview.

The port exposes `load`, `upsert`, `setCurve` and `simulate`, using only the four
registered methods: `beacons.visual.list`, `beacons.visual.upsert`,
`beacons.curve.set` and `beacons.simulate`. Generated parameter/result validators
load through `@castle-control/contract/beacons` on the first call, independently
of the eager contract registry. Existing generated files are unchanged. Reads
replace the list, including empty lists; writes publish core-confirmed values.
Snapshot errors carry validated codes/timing, with upstream prose and details
removed. Mutations never retry automatically; busy requests block duplicates.

The connected room renders a virtualised visual list, configuration and curve
forms, and synthetic burst controls. Saving a new visual starts a visible
0-to-50-unit curve that can be edited after saving. Simulation fractions come
only from the core, are labelled simulated, start from an empty state per call,
and never become live contribution totals. No local accounting, fictional feed,
live intensity or OBS delivery is substituted. `beacons.source.url` is absent
from `cc-core`'s offline registration and is deliberately not called (WP 3.2).
The shell continues to own the seal slot; this delivery does not connect Steward
execution or arm live output.

`beacons-core.test.ts` proves list/upsert/curve/simulation round trips, malformed
and mismatched replies, safe typed errors, request validation, production HTTP,
lazy validators, connection persistence and the core shell route. Fixture tests
keep their existing accounting and keyboard behavior.

## Evidence

WP 3.1 verification, 2026-10-27:

- Red first: `beacons-core.test.ts` failed because the port did not yet exist.
  After implementation, desktop `test` passes all 194 tests in 22 files;
  the final narrowed Beacons/visuals/shell run passes 41 tests in five files.
- Desktop and contract package `typecheck` and `lint` pass. Contract `test`
  passes 124 tests in 11 files plus the standalone generator tests, including
  strict eager/lazy equivalence. Tooling lint, boundaries, hygiene, file cap and
  secrets pass (530 code files / 660 scanned files).
- Direct Cargo exports of `cc-types/export-contract` and
  `cc-core/export-registry` pass. Passing their output to the supported
  `check.mjs --schema` and `parity.mjs --schema ... --registry ...` modes proves
  current-source drift/parity (16 artifacts, 45 declared / 29 registered methods,
  16 event kinds). Only three new generated files are added; every previous
  generated artifact and the verifier-web bundle remain unchanged.
- Desktop `build` passes at **382,338 / 393,216** first-load bytes; the budget
  is unchanged and Beacons validators are a separate dynamic chunk.
- Direct `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets
  -- -D warnings` and `cargo test --workspace` all pass, with downloads enabled
  and `CARGO_BUILD_JOBS=6`. Live/owner-only tests retain their ignored status.
- Full `pnpm gate` passes the 14 tooling tests and workspace inventories, then
  stops in the unchanged exporter with `spawnSync cargo EPERM`. Recursive
  `-r typecheck` and `-r lint` fail in pnpm's subprocess launcher with `spawn
  EPERM`. Base `docs/PLAN.md` records the same failures; `gate.mjs`, `run.mjs`,
  `check.mjs`, `parity.mjs` and `exportSchema()` are unchanged. These are failures,
  not a green full gate; App Master must rerun on its verification host.
- No install was run because `node_modules` is a junction. No live or browser
  fidelity claim is made by these component/transport tests.

`room.test.tsx` covers fixture/core rendering, draft status, amendment history,
queue isolation and unchanged model accounting. `keyboard.test.tsx` covers every
offering via the native range change path and every native selection/test-fire
button activation path. These are component tests, not browser Tab automation.
`src/beacons.test.tsx` covers the mounted room and reused model, including its
600-event fixture. The Director compares mounted screenshots after integration.

Original AI-6 verification before mounting on 2026-10-26: the two rooms plus the existing Beacons suite passed
22 tests across five files. Direct desktop TypeScript, changed-file ESLint and
the boundary/hygiene/file-cap/secret checks passed. The existing desktop build
passed at 386,922 / 393,216 first-load bytes; these new modules remain unmounted.
A separate Vite library build preserved and bundled both room exports. Full
`pnpm gate` stopped at the unchanged contract exporter's `spawnSync cargo EPERM`;
recursive pnpm typecheck/lint also hit process-spawn `EPERM`. A temporary browser
preview could not start because updating Vite's dependency cache was denied. The
preview files were removed; no dependencies or shared shell files were edited.
