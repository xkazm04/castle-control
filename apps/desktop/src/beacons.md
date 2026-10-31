# AI-6: Beacons room mounted

Open `#/chamber/visuals` in fixture mode. The shell lazily mounts
`rooms/visuals/room.tsx`; `#/chamber/studio` mounts the Map Room. Core mode now
uses the Beacons core port described in `rooms/visuals/README.md`, with a
virtualised configuration list, saved curves and core-computed simulations.
It exposes core simulation history without a fixture feed, alongside appearance
controls. Size and anchor travel in the copied browser-source URL; colour and
burst timing remain local session previews. The Map Room keeps its unconfigured
core state.

The old Beacons panel page, curve editor, artwork/feed implementation, stylesheet
and page-only copy were removed. The beacons-model and beacons-fixture
remain shared sources. The room presents altar, frame and border intensity ranges,
60 illustrative offerings and local test fire. Its selection and contribution
controls change the local preview only; nothing reaches OBS.

`beacons.test.tsx` exercises the real selection and test-fire handlers, preview
intensity, curve/reset/decay semantics, unique generated model events, mounted
fixture/core separation and the no-network boundary. The visual room tests also
cover draft amendments, accounting isolation, all offerings and native keyboard
control paths. The room now renders the model's 600-event fixture and local test
fires through the shared windowed feed. Core mode starts with an empty history
and adds one simulated row for each successful core test burst. Both feeds label
every row simulated; neither is live contribution accounting. See the room README
for source units, timestamp semantics and the live-intake follow-up.

The shared seal slot uses the kit ProposalCard. Proposal layers retain
`DRAFT ? NOT ON AIR`; room-wide provenance strips are removed because the
rampart and Steward own surface-level labels. This does not enable live output.

## Wave 2b verification

- Targeted desktop tests: 62 pass in 10 files (beacons, lots, moderation,
  moderation-gate, shell/room, overview/program, visuals room/keyboard and studio
  room/keyboard). ProposalCard: 2 pass, including busy and revision-keyed holds.
- Direct `tsc --noEmit` for desktop and UI: pass. ESLint on both src trees: pass.
- `node scripts/check.mjs`: pass; boundaries/hygiene/file cap walk 472 files,
  secrets walk 595 files. No imports of the retired page remain.
- Production Vite build: pass. First-load checker: 382,098 / 393,216 bytes.
- Recursive `-r typecheck` and `-r lint`: fail before package checks with
  `spawn EPERM`. Full `pnpm gate`: 14 tooling tests pass, then the unchanged
  contract exporter fails with `spawnSync cargo EPERM`, before Rust/product
  gates. Base HEAD docs/PLAN.md records these same failures, and a diff against
  HEAD for the exporter/check and gate/run scripts is empty. No full-workspace
  pass is claimed; App Master must rerun the full gate in its verification host.
- Install skipped as required by the node_modules junction exception.
  No live output or browser fidelity claim is made; Director re-shoots the two
  mounted routes at 1440x900 and 1280x800 against the read-only references.
