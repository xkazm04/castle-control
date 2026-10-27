# Chamber room composition (AI-9)

Fixture routes: `#/chamber/lottery`, `#/chamber/moderator`,
`#/chamber/visuals`, `#/chamber/studio`. The drill remains
`#/chamber/moderator/drill`. Re-shoot each at 1440x900 and 1280x800.

The shell's room frame owns the display title, plain-function breadcrumb,
italic chamber subtitle, locator and Back/Esc. It uses the kit's chamber table;
the room-specific header is composed locally without changing packages/ui.
Each room receives an optional React `seal_slot`, rendered beneath its rightmost
work column. This reuses the original queue, ProposalCard and hold-to-seal path;
there is no full-height proposal column. Moving the slot into StewardBar would
need a separate shared-kit delivery and is not part of this change.

Desktop columns scroll within the framed room while the existing Steward bar
stays at the bottom. Narrow layouts stack without losing their token insets.
The Lot Chamber keeps its writ, amendment inking, templates, urn, guardrails and
proof controls. Its protocol explanation is secondary in a details disclosure;
the writ's fairness box and guardrails remain visible. The Gatehouse retains
its held-message stage, virtual chat replay, rules, delay gauge and gate log.
Rules display their actual simulated mode; no rule is armed by this layout.

The Director supplied read-only Lit Keep stills from
`C:/Users/kazda/.personas/standup/2026-10-27/ref-keep/`; both desktop sizes for
all rooms were inspected as images. The Director re-shoots the mounted app.
Component assertions cover the header, stage token padding, active states and
right-column seal placement. Existing room, navigation and keyboard tests cover
the unchanged actions. Room illustrations remain lazy; the first-load budget
is checked by the existing desktop build command.

## Verification, 2026-10-27

The new header and stage-padding assertions failed on the original layout before
the implementation. Final narrowed Vitest run: 68 tests passed in 10 files
(`shell/room`, both Beacons and studio room/keyboard suites, `lots`, `moderation`,
`moderation-gate`, `beacons`, `navigation`). Direct desktop TypeScript and ESLint
over the rooms and room frame passed. Repository boundary, hygiene, file-cap
and secrets checks passed, walking 473 code files and 597 secret-scan files.
The desktop production build passed at 381,433 / 393,216 first-load bytes.

Full `pnpm gate` was attempted once. It stopped in the unchanged contract
exporter at `spawnSync cargo EPERM`, before Rust and package checks. Recursive
typecheck and lint were attempted separately and also stopped at process spawn
`EPERM`, before running checks. The gate and exporter have no diff against
base `45e8e76`; the same environment errors are recorded in the existing
`docs/PLAN.md`. The full gate is not claimed green. App Master must run its
merge verification in its approved environment; the Director judges the re-shoot.
