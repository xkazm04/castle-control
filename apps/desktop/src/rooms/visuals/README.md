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
separate queue into `VisualsWork`. No network, model or execution adapter exists.
Core mode returns an unconfigured state without fixture controls.

## Mounted in wave 2b

The shell lazily mounts `VisualsRoom` at `#/chamber/visuals` in fixture mode,
passing `snapshot`. Live mode keeps the shell's empty state. Breadcrumb, Back/Esc,
seal slot and Steward remain owned by the shell. The room-wide provenance strip
is removed; draft layers still say `DRAFT ? NOT ON AIR`.

## Evidence

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
