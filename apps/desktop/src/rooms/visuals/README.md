# Beacons detail room (AI-6)

Hero geometry correction: altar bounds (90,31)–(270,237), camera-frame/border/fallback (20,30)–(340,210); viewBoxes add six units per edge and supply matching aspect ratios.
Hero flames now retain full height (blaze still controls opacity); thumbnails keep their original viewport and scaling. `artwork.test.tsx` proves relative-path/cubic bounds and margins at zero, fixture and full blaze without a browser.

## Aspect-sized, top-aligned artwork hero, 2026-10-28

The Director's DOM probe located the upper band inside the SVG viewport, not
in a minimum-height wrapper. Removing the minimum height in `25385be` did not
close that band. The hero now uses `align-content: start` instead of vertical
centering. Its SVG keeps `width: 100%` and `height: auto`, adds the explicit
`360 / 240` aspect ratio, and replaces the six-`space-56` height cap with a
nine-`space-56` width cap. At that ratio the maximum artwork height is unchanged,
but a narrower column reduces both dimensions together rather than leaving a
tall, letterboxed viewport. Hero-only `preserveAspectRatio="xMidYMin meet"`
anchors any remaining fit space below the artwork, close under the caption.

The entire `0 0 360 240` viewBox, altar/frame/default paths, intensity transforms,
labels and controls stay intact: no crop or cover scaling can cut off a design.
These are source-based expectations. No browser or screenshot measurement was
attempted; the Director checks the result at 1440x900 and 1280x800 after merge.

Verification for this slice: desktop typecheck and lint pass (93 TS/TSX files).
Lint also checks boundaries, hygiene and the file cap across 592 code files,
and secrets across 740 files. Narrowed Vitest over `src/rooms/visuals` and
`src/rooms/lottery` passes 32 tests in six files. No install, git write, Rust
gate, full workspace suite or live test was run. App Master owns the commit.

## Polish (line 4), 2026-10-28

Open `#/chamber/visuals` in fixture mode (the browser preview defaults to
fixture mode). Compare at **1440x900** and **1280x800**. The A/1 composition
keeps the illustrated altar, kindling curve and test fire on the left, with
altar/frame/border cards, the 60-offering timeline, contribution feed and the
shell's existing seal/design slot on the right. Each column scrolls vertically;
open the native Test fire disclosure and scroll down both columns to inspect
the lower controls. The shared header and Steward remain owned by the shell.

Spacing changes below use the existing `packages/tokens` CSS variables. Values
are CSS declarations, not measurements from rendered screenshots. Zero margins
let the column's 24 px gap own section spacing rather than adding margins to it.

| Area | Before | After |
| --- | --- | --- |
| Both column insets | 16 px vertical / 20 px horizontal | 24 px on every side (`space-24`) |
| Direct column sections | Mixed section/browser margins; no layout gap | 24 px gap; direct-child block margins 0; sections do not flex-shrink |
| Card-to-card gap | 10 px | 16 px (`space-16`) |
| Card padding | 12 px vertical / 14 px horizontal | 16 px on every side |
| Card text and ranges | Description 4 px vertical margin; Now line 4 px top / 8 px bottom | Both margins 0; 8 px grid gap between selector, description, Now and ranges |
| Range cells | 4 px gap / 5 px padding | 8 px gap / 8 px padding |
| Room buttons | 8 px vertical / 10 px horizontal padding; no minimum height | 6 px vertical / 12 px horizontal; 32 px minimum (`button-h`); card selectors retain 0 padding |
| Kindling curve outer spacing | 16 px vertical margin | 0 margin; 24 px column gap |
| Curve, timeline and test-fire contents | Browser heading/paragraph margins; no common gap | 0 child margins and 12 px grid gap |
| Curve label gap | 4 px, no wrapping | 8 px, wrapping |
| Test-fire divider inset | 10 px top | 16 px top |
| Expanded test-fire content after summary | Browser heading margin | 16 px top margin |
| Test-fire trailing note | Browser paragraph margins | 12 px top / 0 bottom margin |
| Timeline outer spacing | 16 px top margin | 0 margin; 24 px column gap |
| Timeline time labels | No gap, no wrapping | 8 px gap, wrapping |
| Offering inspection label | 12 px top margin; 6 px label/control gap | 0 top margin; 8 px label/control gap |
| Offering range input | Browser margins and content sizing | 0 margin, border-box width 100%, minimum width 0 |
| Contribution feed | 16 px vertical margins; browser heading/paragraph margins | 0 margins; 12 px internal gap and 24 px column gap |
| Existing seal/design slot | 20 px additional top margin | 0 additional margin; 24 px column gap |
| Connected-mode forms | 20 px vertical margins; 10 px gap | 0 margins; 12 px gap; headings/paragraph margins 0 |
| Connected-mode nested burst form | Browser flow, no grid gap | 12 px grid gap |
| Connected-mode fieldsets | Browser padding | 12 px on every side |
| Connected-mode visual/source-copy rows | 8 px vertical / 0 horizontal padding | 12 px on every side |

The connected-mode source-copy action remains in its existing visual row; fixture
mode does not invent a browser-source URL or add a copy action. Shared column,
button and form spacing covers that existing connected-mode UI as well.
Typography retains the 13 px label floor. Zero-minimum grid tracks/children,
wrapping labels/buttons and border-box range sizing keep wide content from
forcing the columns wider; the 900 px stacking breakpoint is unchanged.

**Screenshots unavailable:** headless Chrome could not launch in this builder's
sandbox: its Crashpad/Mojo process/IPC setup returned `Access is denied (0x5)`.
No screenshots were captured and there are no claimed paths under `shots/`.
Browser fidelity and horizontal-overflow verification at both target sizes
remain for the operator/Director; DOM/CSS assertions are not rendered proof.

The new `room.test.tsx` test fails on the base CSS and guards even token insets,
the section/card rhythm, removal of the extra seal-slot margin and unchanged
workbench/card/timeline/feed region order. Existing behavior tests cover the
unchanged selection, tier changes, local test fire, source copy and virtual feed.

Verification for this delivery:

- Desktop `typecheck` and `lint` pass via
  `pnpm --config.verify-deps-before-run=false --filter @castle-control/desktop`.
  Both inventory 91 TS/TSX files. Lint also passes boundaries, hygiene and
  the file cap over 590 code files, and secrets over 737 files.
- From `apps/desktop`, `pnpm --config.verify-deps-before-run=false exec vitest
  run --pool=threads --cache=false src/rooms/visuals` passes **31 tests in five
  files** (room, keyboard, kindling curve, event feed and source copy). The new
  spacing test was red on the base CSS before the change and is now green.
- Desktop production `build` passes, including the unchanged first-load cap:
  **382,467 / 393,216 bytes** across three entry JS/CSS assets, equal to this
  worktree's baseline. Room CSS remains lazy-loaded.
- `git diff --check` passes. No install, git write, dependency change, Rust gate,
  full workspace test or live test was run. App Master owns the commit and
  merge verification; the browser inspection above remains outstanding.

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

## WP 3.3 desktop curve editor

Core mode mounts `EditableKindlingCurve` through `core.tsx`, the connected
branch of `room.tsx`. Each labelled control point is a Tab stop. Dragging
previews the draft curve and releasing saves it. Arrow keys move the focused
point by one contribution unit horizontally or one percentage point vertically;
Shift uses ten units or ten percentage points. Enter commits and Escape cancels
without bubbling to shell navigation. Labelled numeric and decay controls share
the same draft, with explicit Save and Cancel actions.

The editor keeps contribution totals as uint32 integers in strictly increasing
order, intensity finite in 0..1, and exponential half-life a positive uint32.
Descending intensities and single-point curves remain valid. The generated
`beacons.curve.set` contract door validates the outgoing request and incoming
Visual. `setCurve` returns that validated, matching Visual only after the core
acknowledges it. Draft previews and pending saves never replace the port's
confirmed curve. A rejected, malformed, mismatched or failed reply rolls back
to the last confirmed curve with a safe inline alert. No automatic retry occurs.
Fixture mode retains its read-only illustrative curve and local test fire.

**OBS acceptance and the 1 s package-to-OBS latency are DEFERRED to the WP 3.2
overlay host lane.** `crates/cc-obs/src/overlay.rs` serves `/beacons/{visual_id}`
as a static placeholder under a script-free CSP; no curve-to-overlay channel
exists. This desktop delivery neither changes that host nor claims OBS proof.

`kindling-curve.test.tsx` drives the rendered native point handlers and the real
core adapter through a synthetic transport. It covers pointer capture/drag,
keyboard fine/coarse moves and commit/cancel, acknowledgement timing, rollback,
ordering, range bounds and pointer cancellation. Node provides `Event` but no
`KeyboardEvent`, `PointerEvent`, DOM renderer or testing-library installation.
Event-backed test projections document their casts and exercise native
cancellation; they do not claim browser focus, Tab traversal or layout proof.
No dependencies are installed and no product types are loosened.

Verification after the Director's resume, 2026-10-27:

- `pnpm --config.verify-deps-before-run=false --filter @castle-control/desktop
  typecheck` and `lint` pass. Both inventory 91 TS/TSX files; lint also passes
  boundaries, hygiene and file cap across 540 code files and secrets across
  670 files.
- From `apps/desktop`, `pnpm --config.verify-deps-before-run=false exec vitest
  run --pool=threads src/rooms/visuals/kindling-curve.test.tsx` passes all
  **10 tests**. The full desktop `test` script passes **230 tests in 25 files**.
- The desktop `build` script passes, including its unchanged first-load budget
  check: **382,338 / 393,216 bytes**, three entry JS/CSS assets. The curve code
  stays in the lazy visuals route and no budget is raised.
- `git diff --check` passes. No install, git write or out-of-scope edit was run.
  These are the requested desktop checks; no full Rust/workspace gate, browser
  fidelity, live test or OBS acceptance is claimed by this split delivery.

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
