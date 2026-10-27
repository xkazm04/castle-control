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

The port exposes `load`, `upsert`, `setCurve`, `simulate` and `sourceUrl`, using the five
registered methods: `beacons.visual.list`, `beacons.visual.upsert`,
`beacons.curve.set`, `beacons.simulate` and `beacons.source.url`. Generated parameter/result validators
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
live intensity or OBS delivery is substituted. Source URL availability follows
the actual core registration described below.
The shell continues to own the seal slot; this delivery does not connect Steward
execution or arm live output.

`beacons-core.test.ts` proves list/upsert/curve/simulation round trips, malformed
and mismatched replies, safe typed errors, request validation, production HTTP,
lazy validators, connection persistence and the core shell route. Fixture tests
keep their existing accounting and keyboard behavior.

## WP 3.3 contribution feed

At base `60eb569`, the room only rendered the separate 60-offering timeline;
the 600-event model fixture had no feed UI. `event-feed.tsx` now reuses the
shared `WindowedRows` primitive, as the Gatehouse does. Its token-sized rows
show the source, amount, visual ID, UTC time and an explicit simulated label.
The named scroll table is a native Tab stop with the shared focus treatment;
browser scrolling uses the existing primitive, with no second keymap.

Fixture mode reads `preview.events`: the existing 600 generated gift/subscription
events plus local test fires. Every visible row says `simulated · Local preview`.
Those historical rows and fixed-clock times are illustrative and never reconstruct
the preview's starting totals. The 60-offering timeline stays separate and does
not feed accounting. End test fire resets the model and its local feed together.

Core mode starts empty. After a schema-validated, matching `beacons.simulate`
reply, the port records one row for the acknowledged burst, newest calls first.
A 50-gift burst is one row with amount 50, not 50 claimed Twitch contributions.
Rows say `simulated · Core simulation`; their time is local reply receipt time,
not a Twitch event time. The UI-only history survives refresh, selection and
room navigation on the cached port, and disappears with a new connection.
Malformed, mismatched, failed and unacknowledged calls add no rows. History
never changes saved configurations or becomes live intensity or accounting.
The existing `PreviewEvent` shape is reused as an in-memory projection only;
the core adapter imports its type without loading fixture data at runtime.

The source labels cover all existing `ContributionSource` values: cheer/Bits
use in Bits, subscriptions/gifts/resubs in counts, Hype Train level, channel
points, charity/goal minor currency units and power-up counts. No identities,
ledger persistence, external connection, new identifier or contract changes
are introduced.

Live intake is a follow-up: `beacons.contribution` and its typed payload already
exist in the contract, but this Beacons connection has no live subscription or
authoritative contribution-history read. There is no missing identifier to
invent here. A future delivery must wire the existing event source and settle
resync/history semantics within its own scope; any new read identifier must
land in `cc-types` first. This feed does not subscribe to live events or claim
OBS delivery, and core mode never substitutes fixture rows.

`event-feed.test.tsx` pushes 600 new test-fire events and checks bounded markup
windows at the start, middle and end, including the first/last IDs, positional
ARIA metadata and per-row simulated labels. It covers every source label and
the honest empty state. `beacons-core.test.ts` retains 600 validated core bursts
with unique IDs and checks frozen history, failures, refresh and fresh-port
isolation. `keyboard.test.tsx` checks the shared primitive, its accessible name
and native Tab stop in the same component-test style as the other controls.
These are component/markup window tests, not browser Tab or fidelity automation.

Verification, 2026-10-27:

- Red first: the new feed suite could not import `event-feed.jsx`, and the
  600-core-burst test failed because snapshot `events` was absent.
- Final narrowed run: **67 tests pass in 7 files**, using
  `pnpm --config.verify-deps-before-run=false exec vitest run --pool=threads`
  from `apps/desktop`, with `src/rooms/visuals/event-feed.test.tsx`,
  `src/beacons-core.test.ts`, `src/beacons.test.tsx`,
  `src/rooms/visuals/keyboard.test.tsx`, `src/rooms/visuals/room.test.tsx`,
  `src/rooms/visuals/source-copy.test.tsx` and `src/shell/room.test.tsx`.
  The 600-row windows render fewer than 20 rows at each tested scroll position.
- Desktop `typecheck`, `lint` and `build` pass via
  `pnpm --config.verify-deps-before-run=false --filter @castle-control/desktop`.
  Typecheck/lint inventory 89 TS/TSX files; boundary/hygiene/file-cap checks
  inventory 535 code files and secrets inventory 665 files. First load remains
  **382,338 / 393,216 bytes**, with no budget increase.
- `git diff --check` passes. No install or git write was run. Full workspace
  tests and Rust gates are left to App Master for this desktop-only change;
  no full-suite, live, browser fidelity or OBS test is claimed.

## Earlier evidence

WP 3.3 Copy browser-source URL verification, 2026-10-27:

- Red first: the generator test expected `p37`/`r37` in the lazy Beacons module
  and failed because they were absent. The port tests then failed with
  `sourceUrl is not a function`, and the room copy test failed on the missing
  copy module. After implementation, all 61 narrowed tests pass across
  `beacons-core.test.ts`, `rooms/visuals/source-copy.test.tsx`, the existing
  visuals room/keyboard tests, `beacons.test.tsx` and `shell/room.test.tsx`.
- All 214 desktop tests in 23 files pass, as do desktop `typecheck`, `lint`
  and `build`. First-load bytes remain **382,338 / 393,216**, with no budget
  change; the Beacons validator remains a separate dynamic chunk.
- The contract package's `typecheck`, `lint` and 124 tests in 11 files pass,
  together with its standalone generator tests. The generator now selects
  the already-declared `beacons.source.url` params/result for the lazy subpath.
  Tests prove lazy/eager equivalence, independent function objects, closed
  schemas and rejection of non-loopback URLs. Only the three generated Beacons
  files change; all other generated artifacts are unchanged. The verifier's
  source fingerprint is unchanged, so its HTML is not regenerated.
- All six JS/TS workspace test scripts pass individually: 723 tests across
  67 files, plus the standalone generator assertions. This includes the
  unchanged tokens, UI, renderer and verifier-web suites.
- Direct fresh Rust contract and registry exports, saved outside the worktree,
  pass `check.mjs --schema` and `parity.mjs --schema ... --registry ...`:
  16 artifacts, 45 declared / 30 registered methods, 16 event kinds.
- Direct `cargo fmt --all -- --check`, workspace Clippy with all targets and
  warnings denied, and `cargo test --workspace` pass with downloads enabled
  and `CARGO_BUILD_JOBS=6`. Owner-only live tests and fixture generators remain
  ignored; no live or owner step is claimed.
- Tooling ESLint, boundaries, hygiene, file cap and secrets pass (532 code
  files; final secret scan inventories 666 files after native build output).
- Full `pnpm --config.verify-deps-before-run=false gate` passes its 14 tooling
  tests and workspace inventories, then fails at the existing contract
  exporter's `spawnSync cargo EPERM`. Recursive `-r typecheck` and `-r lint`
  fail in pnpm's subprocess launcher with `spawn EPERM`. The export/spawn
  implementations are unchanged; base `docs/PLAN.md` and the historical WP 3.1
  evidence below record these same failures. A full green gate still requires
  App Master verification on its host; the individual passes are not a claim
  that the full gate passed here.

The connected visual list has one native, keyboard-reachable copy button per
visual, named with the visual's name for assistive technology. Its existing
token-sized virtualised rows reserve space for the extra action. The feedback
region stays outside those rows and uses `role="status"`, polite live updates
and atomic announcements, including clipboard denial or missing clipboard
support. Component tests drive native click handlers (the Enter/Space activation
path) and render the feedback; they do not claim browser Tab or visual fidelity
automation.

`sourceUrl(visual_id)` validates params and the result through the generated
lazy contract door, strips upstream prose/details from typed errors, and never
retries automatically. The copy controller also blocks duplicates until clipboard
completion. Only the exact validated loopback URL returned by core reaches
`navigator.clipboard.writeText`; no URL enters read snapshots or rendered
feedback. A failed refresh/copy never reuses a previous URL or fixture source.

At base `43c687f`, core registers `beacons.source.url` in every constructor.
Native core can return the isolated overlay URL; socket-free offline core
returns `unavailable` for a known visual, and an unknown visual returns
`not_found`. Both errors produce the labelled unavailable state with no URL
copied. URL plumbing alone does not supply Beacons rendering or live intensity;
the existing unavailable delivery notice stays visible. No fixture URL, new
identifier, credential, dependency install, live action or owner step is added.

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
