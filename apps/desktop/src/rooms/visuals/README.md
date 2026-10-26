# Beacons detail room (AI-6)

`room.tsx` default-exports `VisualsRoom({ snapshot }: { snapshot: Snapshot })`.
`Snapshot` comes from `../../model.ts`. The module can be imported with React
`lazy`; it imports neither the app entry nor the view. It contains no breadcrumb,
seal control, or Steward input. The shell owns those.

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
separate queue into `VisualsWork`. No network, model or execution adapter exists.
Core mode returns an unconfigured state without fixture controls.

## Mount in the follow-up

AI-6 deliberately leaves the shell and old Beacons page untouched. At base
`cabd3b3`, change these exact lines in `apps/desktop/src/shell/room.tsx` (AI-5 may
move them, so use the expressions as anchors after merging):

- Line 10: replace `const BeaconsPage = lazy(...)` with
  `const VisualsRoom = lazy(() => import('../rooms/visuals/room.jsx'));`.
- Line 24: replace `: fixture && chamber === 'visuals' ? <BeaconsPage />` with
  `: chamber === 'visuals' ? <VisualsRoom snapshot={snapshot} />`.

Dispatching core mode to the module is intentional: it owns its honest empty
state. The follow-up retires the old page only after both room deliveries merge.
Then open `#/chamber/visuals` in fixture mode. Until then the existing route still
shows BeaconsPage; the standalone module is exercised by the render tests.

## Evidence

`room.test.tsx` covers fixture/core rendering, draft status, amendment history,
queue isolation and unchanged model accounting. `keyboard.test.tsx` covers every
offering via the native range change path and every native selection/test-fire
button activation path. These are component tests, not browser Tab automation.
The existing `src/beacons.test.tsx` continues to cover the reused model and
600-event fixture. The Director compares mounted screenshots after integration.

Verification on 2026-10-26: the two rooms plus the existing Beacons suite passed
22 tests across five files. Direct desktop TypeScript, changed-file ESLint and
the boundary/hygiene/file-cap/secret checks passed. The existing desktop build
passed at 386,922 / 393,216 first-load bytes; these new modules remain unmounted.
A separate Vite library build preserved and bundled both room exports. Full
`pnpm gate` stopped at the unchanged contract exporter's `spawnSync cargo EPERM`;
recursive pnpm typecheck/lint also hit process-spawn `EPERM`. A temporary browser
preview could not start because updating Vite's dependency cache was denied. The
preview files were removed; no dependencies or shared shell files were edited.
