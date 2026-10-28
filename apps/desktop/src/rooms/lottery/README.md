# Lot Chamber room

## Proof and fairness under the writ, 2026-10-28

The Director's DOM probe found unused space in the left column while the proof
and fairness sections sat below the urn, off-screen in the right column.
Removing the stage minimum height in `25385be` did not close that band. The
workbench now contains the writ stage, guardrails and notices, saved proof with
both existing recompute paths, then the visible fairness steps. Moving these
sections into the left column uses its spare space and removes their height
from the right column before lookup and sealing. Their existing `space-20` top
margins, divider rules and `space-12` insets still separate the sections, so no
CSS change is needed. The urn figure, cooldown/pool line, lookup and supplied
seal slot remain in the details column. All handlers, labels and marks remain.

`structure.test.tsx` failed on the base because proof was absent from the
workbench. It now checks writ-before-guardrails-before-proof-before-fairness,
the steps list in that column, urn and seal slot exclusively in details, and
the unchanged eligible-lot count. Desktop typecheck and lint pass (93 TS/TSX
files); the narrowed two-room Vitest run passes 32 tests in six files. No install,
git write, Rust gate, full workspace suite or live test was run. No browser was
launched or pixels measured. The Director renders 1440x900 and 1280x800 after
merge; source-order tests do not prove fold positions. App Master commits.

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
- Below the writ and guardrails, the saved simulated proof is an explicit dated record
  with its recorded winners visible before opening proof details. Its existing
  local recompute action is retained. The current frozen-entry recompute and
  byte details also sit in this proof region after a roll is sealed.
- The four fairness steps follow the proof region in the workbench and are
  visible without opening a disclosure. Fixture limitations remain explicit.
  Entry lookup follows the urn in details, with the seal/design slot mounted last.

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

Earlier A/1 evidence (before the column move): `structure.test.tsx` first failed on the missing proof/fairness
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
