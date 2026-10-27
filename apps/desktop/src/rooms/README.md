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

## AI-9b room polish, 2026-10-27

Compared Athena's AI-9 stills with the Lit Keep reference stills at both
1440x900 and 1280x800. Gatehouse now has a dominant held-message/ban-review
stage and one right column of cards for sample replay, rules, moat, drill and
gate log. Each card describes its current simulated state with a `Now:` line.
The portcullis title appears once. Review and tool columns scroll independently;
the review region is keyboard focusable, with a persistent scroll cue and a
reserved, coloured scrollbar so a ban's original text remains reachable below
the frame. No message text is truncated in the review stage.

Lot Chamber shows the urn title once and giveaway guardrails as a status line.
Policy reasons, prize disclaimers, official rules, writ fairness and recompute
remain available. `lots-model.ts` exposes the current preview and one saved
simulated proof bundle, not a collection of past writs. A past-writs ledger is
therefore omitted, including the former in-memory proposal-history list; no
historical data is invented. Writ templates and the saved proof stay in place.

Map Room has one war-table title. It retains readable tile labels instead of
shrinking them below the type floor. At 1280x800, overflow is explicitly
scrollable: the focusable board region has a sticky scroll cue, reserved
scrollbar and keyboard access to every row. The Director should re-shoot the
three fixture routes above at both target sizes and check scrolling through
ban review, the sixth map row and the right-column seal slot. The Steward bar,
Beacons and overview are untouched. Models, lazy imports and hold semantics
are reused without changes.

Verification: the two new room-polish assertions failed before implementation
(duplicate urn title and missing scroll affordance). Final targeted command:
`node node_modules/vitest/vitest.mjs run --pool=threads apps/desktop/src/shell/room.test.tsx apps/desktop/src/rooms/studio/room.test.tsx apps/desktop/src/rooms/studio/keyboard.test.tsx apps/desktop/src/lots.test.tsx apps/desktop/src/moderation.test.tsx apps/desktop/src/moderation-gate.test.tsx apps/desktop/src/navigation.test.tsx`
passed 55 tests in 7 files, including unique titles, right-column cards,
keyboard Enter/Esc, all 54 native tile controls and continuous held-Space sealing.
Direct desktop TypeScript and ESLint over the assigned room/frame code passed.
`node scripts/check.mjs` passed all four checks (492 code files, 617 secret-scan
files before this README update). The desktop build passed at unchanged
381,433 / 393,216 first-load bytes.

The full `node scripts/gate.mjs` attempt passed 14 tooling tests and workspace
inventory, then stopped in the unchanged contract exporter at
`spawnSync cargo EPERM`. Recursive pnpm typecheck and lint also stopped at
`spawn EPERM` before checks ran. These gate/exporter paths have no diff against
base `a936778`; this environment failure is already recorded above. The full
gate is not green here; App Master must run merge verification in its approved
environment. No install ran over the shared node_modules junction.
