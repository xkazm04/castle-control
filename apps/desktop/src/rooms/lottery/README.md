# Lot Chamber C · Herald, 2026-10-30

Reconciled against `a9aec46`: the shared heraldic kit existed, but the lottery
room still used the earlier writ-left / urn-right layout. This port follows
`prototype/polish-2026-10-30/lottery/variant-c.html` between its ROOM BODY comments,
the C section of that folder's README, and both `_shots/lottery-c-*` pictures.
The shell product code, prototype controls, kit and tokens are unchanged.

## Structure

The `cc-hall` is stage-left at 1.2fr and desk-right at minmax(23rem,1fr), with
an independent desk scrollbar. Room-local grid sizes use existing token calcs.
At the prototype's 900px breakpoint it stacks with a 32rem stage; the 1360px
breakpoint narrows the tally. Breakpoints are equivalent rem expressions;
media queries cannot consume token variables. The wrap/stage/urn chain retains
min-height:0. Desk children keep their intrinsic height rather than shrinking.

`print.tsx` adapts StageFrame, HeroReadout (viewport/overprint), MedalList/Medal,
Ribbon and NumberedDiscs. StageFrame supplies its crop marks; room CSS owns its
grid. `urn.tsx` retains every circle, cohort and generated position, uses C's
viewBox and vessel fill, and keeps WindowedRows above 320 entries. The legend
counts the rendered entries by cohort. Medals read winner count, fixture
cooldown exclusions and the selected draw's raider cap. Proposed winner values
remain struck/re-inked; they never change the draw merely by being displayed.

The desk orders SectionHeading/banner and stamp; selectable template blazons
when no proposal is pending; the current writ ticket; the guardrail ribbon and
verbatim notices; the supplied seal slot; raised lookup card; saved proof ticket;
then fairness discs and all simulation/protocol limitations. HeraldicCard's
native buttons keep port.select + draftRoll, expose aria-pressed, and pair a
ShieldCharge with CardCopy's name, policy reasons and a verdict StatusChip.

`writ.tsx` prints fields on the ticket with its stub and perforation, proposal
stamp, original s/ins re-ink, revision, fairness copy and sealed wax/hash.
The saved proof has dated winners as handle tickets and its original local
recompute. A frozen roll retains its separate byte disclosure and SHA-256
recompute. All new/changed room copy lives in `lots-copy.ts`; session, models,
fixtures, authority and transport behavior are unchanged.

## Forced differences

- App Master's ruling keeps the supplied seal_slot unchanged and sole owner of
  the proposal hold, tear and design controls. It is wrapped in a raised seal
  HeraldicCard at C's seal-card position. No hold or tear is added to the writ.
  The full shared ProposalCard repeats its fields and keeps its existing
  spacing/frame and normal-sized SealButton, confirmed by the Director on review;
  no compact/large change to that shared slot is requested tonight. The core's
  existing direct roll SealButton can use size=large, and does. It is separate
  from the shared Steward proposal authorization.
- The lookup uses room-local field grouping with appearance:none and rule-thin
  ink borders, instead of FieldGroup's rule-medium. The binding field audit
  takes precedence. Its hint/result and all other C dimensions remain.
- Kit components use their published names/semantic wrappers: cc-card/copy/side,
  cc-hero-readout, cc-section-heading with data-text ghosts, cc-stamp with tone,
  and cc-numbered-discs. The room does not redefine their defaults.
- Medal detail accepts plain strings, so the proposal's struck and inked winner
  figures use its ReactNode value slot instead of a struck figure in detail.
  The writ keeps the exact original s/ins markup and re-ink animation.
- Core mode preserves its real draw selector/editor, source provenance and API
  actions in raised cards, rather than substituting fixture blazons/proposals.
  It has no cohort/cooldown-exclusion data: frozen entries stay windowed, the
  exclusion medal says Unknown, and no generated legend or pool is fabricated.
  It displays real frozen/result tickets and download, not the saved simulated
  fixture proof. Shared C stage/desk, ribbon, cards, lookup and discs still apply.
- Dynamic sealed/history states and the frozen-byte recompute remain available
  beyond the static prototype's empty/amended states. The saved fixture proof
  stays independent of the current roll; simulated and safety wording is kept.

## Verification

`structure.test.tsx` explicitly cites C's stage-left reversal and checks order
in empty/drafted states, stage-only entry marks, all four crop marks, medals,
cohort counts, aria-pressed, named charges, per-template reasons, lookup hint,
and exactly one actual shared proposal hold/progress control. `lots.test.tsx`
retains every existing policy, draft, seal, lookup, cooldown, frozen-hash and
10,000-entry assertion; updates the removed writ class and gules re-ink selector;
and checks the connected room's C order, viewport hero and large direct seal.

Three new C checks failed before the port; the single-hold regression already
passed. Focused lottery tests passed after the change (19 tests). The first
full desktop run exposed three obsolete assertions in `shell/room.test.tsx`.
The Director authorized that file, test-only, on review. Those checks now assert
the stage/desk order and exactly one seal slot before lookup/proof/fairness;
each selectable fixture's aria-pressed state and gules kit border/overprint;
and the structured Ribbon's status, guardrail label, word and preview note.
Other chambers retain their original checks. No compatibility markup, obsolete
CSS or product shell change was added. All 18 shell room tests pass after the
update. Final desktop/UI checks and commands are recorded in external result.json.
No install, git write, build, e2e, network or live operation is run. The Director
owns screenshot comparison at 1440x900 and 1280x800, build, budgets and full gate;
server-rendered assertions do not establish visual fidelity or mounted behavior.
