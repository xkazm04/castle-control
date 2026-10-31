# Lot Chamber C · Herald, 2026-10-30

## L1 streamer journey, 2026-10-31

In Vite fixture mode open `#/chamber/lottery`. **Next draw setup** now edits
name, content, pool/keyword, winners, cooldown, raider cap, equal/concave activity
weights, the free path and prize guardrails. Generated facts are disclosed:
every third message is !join, the others !question; every second entry follows,
every fifth has redeemed, and activity units range from 0 to 4. Pool changes
rebuild this simulated pool. Free !join admits its senders across restrictions
and forces equal weights. Concave weights mirror the Rust integer formula with
max_units=4. A virtualised weight table publishes the newcomer comparison.
Pool selection also updates subscriber/points policy flags. No paid event,
real chat, model or external service is called.

**Preview this draw** drafts the existing proposal; editing setup discards that
preview. The shared seal slot remains the sole proposal hold. A completed hold
freezes entries and disables setup. **Start simulated draw** then creates one
fixed-seed rehearsal result from the frozen entries, respecting weights,
distinct winners and cohort caps. Repeated starts preserve it. **Read current
simulated writ** shows the roll digest, setup and winners with **Not a cc-verify
proof**. The saved simulated proof and its independent recomputation remain
separate and unchanged. A new roll clears the current result/expanded writ;
empty, invalid and impossible-cap setups provide feedback.

**On stream** uses kit FieldGroups and native keyboard controls for size S/M/L,
five anchors, gules/azure/or/key colours, six kept art styles and reveal timing
(100–10000 ms, default 1500). Style list and art URLs are read-only imports from
`demo/model.ts`. Position, size, colour and art update in the session preview;
timing drives the simulated winner reveal and respects reduced motion. Missing
preview art falls back to a token-colour SVG. Display values are session-only:
LotsDraw has no size/anchor/colour/art_style/reveal_ms fields for upsert. No wire
identifier or fixture transport was added; core mode retains its validated path.

The Rust `/lots/{draw_id}` page has a viewport-sized transparent canvas and a
bounded scrolling plate. Its single parser accepts display-only scale=0.5–2
(default 1) and five anchors (default br). Missing, invalid or repeated known
parameters fall back independently; unknown keys are ignored. Recorded scenes
carry an explicit SIMULATED stamp. Only accepted core seals/casts appear, and
the origin stays read-only. It cannot serve desktop `/art` images, so it uses
default heraldic token colours without broken image requests. Browser fit at
1920x1080 and 1280x720 needs the Director's check; HTML tests do not prove layout.

### Evidence and remaining handoff

`e2e/journey-lots.spec.ts` was written first, reusing the unchanged network and
style audits. It configures the draw and guardrails, edits every urn parameter,
previews, holds Space to seal, casts, reads the writ and asserts an OBS link and
both broadcast sizes. Expected red on base: missing setup/preview/parameters,
cast result and current writ. After fixes its final **Open draw in OBS** link
assertion is still expected red: Vite fixtures have no accepted-core transport
or overlay origin. No mock hides that gap. The brief reserves browser execution
for the Director; the spec has only been typechecked/linted here.

New Vitest assertions were red before fixes for setup, pool/weights, empty
feedback, current cast/writ, stale expansion, subscriber-pool policy alignment
and incorrect equal-weight claims under concave weights. They now pass alongside
the unchanged original Lots/core/structure tests. The two new Rust page tests
were red for query attributes and the uppercase simulated stamp. They now pass
on actual loopback responses, covering seal-before-cast, accepted winners,
query defaults/injection/duplicates and 404/405 write refusal. Final commands,
counts and gate outcomes are recorded in the external result.json.

App Master decisions remain: a fixture-to-core handoff; a separate contract
delivery for persistent display fields; and ownership validation for query URLs.
The excluded `overlay/mod.rs::owns_source` currently treats the entire lots
suffix as a DrawId, so `obs.source.create` rejects query-bearing URLs. Bare
accepted-draw URLs still work; query URLs can be opened manually in an OBS
browser source. No excluded path was changed to bypass ownership validation.

## Earlier port notes

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
  The Lot frame removes the shell's inner rule, top margin and top padding above
  the seal slot heading, matching `lottery-c-paper.png`; only the card's own
  padding remains above it. The slot's bottom spacing is unchanged.
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
