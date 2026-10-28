# Lot Chamber room

## Closer to A/1, 2026-10-28

Open `#/chamber/lottery` in browser fixture mode (no injected core launch).
For an amended writ, choose **Questions for the hall**, then tell the Steward
**make it 5 winners**. The old and new values appear together. The right-column
seal slot still owns hold-to-seal, Tear it up, Restyle and Custom design.

Compared with `prototype/ai-first/keep/index.html`, `lotInterior`, `writHTML`
and `urnHTML`, and section 3 of `docs/plan/04-ai-first-ui.md`:

Gaps closed:

- The writ and urn use A/1's 1.15:1 column proportion. The fixture workbench
  no longer adds a second frame and inset around the writ or a large minimum
  height beneath the empty templates. The core workbench retains its inset.
- The writ has the reference's 34-unit display title, 18-unit field values,
  20/22-unit paper inset and a rotated proposal stamp across its top edge.
  These dimensions derive from existing tokens. Struck values, re-inking,
  revision labels, wax and reduced-motion behavior remain.
- The urn no longer has an extra rectangular border and inset around its
  elliptical outline. Each eligible entry still has its own mark, with raider
  rings; pools over 320 entries retain the existing windowed representation.
- Below the urn, the saved simulated proof is now an explicit dated record
  with its recorded winners visible before opening proof details. Its existing
  local recompute action is retained. The current frozen-entry recompute and
  byte details also sit in this proof region after a roll is sealed.
- The four fairness steps follow the proof region and are visible without
  opening a disclosure. Fixture limitations remain explicit. Entry lookup
  follows these regions, with the supplied seal/design slot still mounted last.

Gaps left:

- The fixture has one independent saved proof, not A/1's multi-record past-writ
  history or drand-round list. Its label remains **Saved simulated proof
  bundle**; it is not presented as history from the current editable roll.
- The proposal fields and generated entry pool are unchanged. Missing A/1
  eligibility/public-round fields, cooldown-excluded marks, cast winner banners
  and new primary actions were not fabricated. No public round is fetched.
- The empty room retains its current Writ templates copy and buttons. Extra
  fixture/guardrail notices stay visible, so its text density differs from A/1.
- The shared shell, faint keep, header, Steward and right-hand seal/design
  components are outside this delivery. The core-connected room is not rebuilt
  as a simulated writ, and no live behavior is claimed.
- Visual fidelity, exact fold positions and overflow at 1440x900 and 1280x800
  remain unverified. Computer Use denied Chrome access with “Computer Use was
  not approved to use Google Chrome”. The comparison above is source-based;
  no screenshots were captured and no `shots/` artifacts are claimed.

Evidence: `structure.test.tsx` first failed on the missing proof/fairness
regions, then passed with the writ in the left column, the urn/proof/fairness
order in the right column, every eligible mark and the supplied seal slot.
Existing lots, moderation, moderation-gate, navigation and shell room tests
remain part of the narrowed verification run.

Validation for this delivery: desktop typecheck (93 files), desktop lint
(including boundaries, hygiene, file-cap and secrets checks) and production
build passed. First-load JS+CSS: 382,467/393,216 bytes. Final narrowed Vitest
run: 108 tests in 15 files passed (`lots`, `moderation`, `moderation-gate`,
`navigation`, `shell/room` and `src/rooms/`). Both new structure tests were
proven red before the layout change. No install, git write or live test ran.
