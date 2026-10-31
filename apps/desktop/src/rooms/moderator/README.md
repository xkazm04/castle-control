# Gatehouse shadow journey (lane L2, 2026-10-31)

## Stabilize findings 04, 06, 08 and 11 (2026-10-31)

Re-anchored at `d1df7eb`, including `83afe49`, `c7d7b75` and `39bf3b6`.
The four findings still reproduced: the initial focused run had 13 failing
assertions and 148 passing tests before product edits. No item was declined.

- **04:** settlement shares one verdict between chat and the inserted/updated
  gate-roll row. Existing ledger identity, kind, original text and provenance
  stay intact. Ban, Dismiss, Undo, release, removal and appeal tests cover the
  400 ms boundary and duplicate-row prevention. Shadow observations now say
  **No action was taken**, rather than claiming Twitch lacks Undo.
- **06:** explicit phase/confirmation and action labels replace raw display
  identifiers. Pattern refusal codes remain in `data-pattern-refusal`, with
  plain sentences for streamers. Ban/decision/arrival counts handle 0/1/2;
  loaded/unavailable counts and sanitized request errors use plain words.
- **08:** rules remain the first prerequisite. Consensus, chat and history
  then settle independently and publish each success immediately. The local
  snapshot records per-read `read_failures`; the room notice names failures
  and loaded reads without upstream prose. Busy lasts through the final read,
  refresh clears old failures, and a failed rules read starts no other reads.
- **11:** the real editor awaits its save callback. Failure is a bench-local
  alert with the sanitized core notice; success names the saved rule in plain
  text. The next edit clears either outcome. Counts remain the bench's sole
  polite status. Duplicate submits are blocked; fixture saves still need seals.

Final focused coverage passes **178 tests / 6 files**: lifecycle, gate, core,
bench, action names and journey assertions. Desktop typecheck and lint pass
over 175 source files; boundary/hygiene/file-cap inventories cover 797 files,
and the secrets scan covers 1,069. The whole desktop suite passes **614 tests / 62 files**;
the production build passes at **364,654 / 393,216 bytes**. The existing
contract exporter blocks `pnpm gate` with `spawnSync cargo EPERM`, after the
24 tooling tests, inventories and Cargo fetch pass. Recursive typecheck/lint
also stop at subprocess `spawn EPERM`; these are not green full-gate results.
Gate/export/package-runner scripts have no diff against HEAD. App Master must
verify those stages in its permitted environment. No install, git write, e2e,
live request, prohibited component edit or contract change was performed.

## Earlier shadow-journey evidence

The Rule bench has one polite status region for its pattern-hit counts. The
watching-rule editor's save/proposal notice stays visible as plain text. The
drill's capture comparison is outside the bench and retains its status role.
`action-names.test.tsx` renders the full fixture bench and its draft drill
preview; its regression first failed with two bench statuses instead of one.
After the fix, all 595 desktop tests in 62 files, desktop typecheck and lint
passed. `pnpm gate` passed the version checks, 24 tooling tests, workspace
inventory and Cargo fetch, then stopped at contract export with
`spawnSync cargo EPERM`. The Director owns browser e2e verification.

## Rule bench (gatehouse-B)

The existing watching-rule editor is now the **Rule bench** above Garrison
orders. Choose **New watching rule** to draft a name, pattern and action;
the mode is fixed to shadow. IDs are readable slugs with collision suffixes.
The existing **Watching rule name**, **Watching match pattern** and
**Propose watching rule** accessible names are unchanged. A fixture rule is
added or edited only through the existing proposal and seal. Core uses
**Save as watching**, sending the existing `gatehouse.rules.upsert` once.
After saving, further edits retain that rule ID rather than creating copies.

Counts update over the current loaded replay: total pattern hits and the
subset currently labelled Pass ("would newly act on"). Three sample hits,
**draft matches** row marks and a Draft matches filter expose those matches.
The session retains the draft through navigation. The fixture drill shows a
separate **Draft pattern preview**, without hashes or evaluator outcome states;
the original illustrative drill result remains separately labelled. Nothing
claims a new gate verdict. The care detector runs first in the real pipeline,
and the deterministic action gate runs before any action. This bench never arms.

Core comparisons require a saved recording baseline; otherwise the button is
disabled with a reason and a link to the drill. **Drill against today's rules**
uses the existing `gatehouse.drill.diff`, the saved baseline/recording and
the current rules plus the draft (replaced by ID when editing). The existing
comparison view shows the result. The saved baseline is not mutated.

`moderation-pattern.ts` previews a conservative common regex subset, with the
Rust raw/lowercased/zero-width-stripped/apostrophe-normalized/destretched
variants and Unicode case-insensitivity. Dot and end anchoring are adapted to
Rust semantics. Lookaround, backreferences, flags, Unicode shorthand classes
and boundaries, class-set algebra, quantified groups and complex repetition
are refused as `unsupported_by_gate`; invalid/oversized patterns return
`invalid`. A refusal produces zero claimed hits, never an approximate answer.
Rust remains the regex authority. Shared `pattern_vectors.json` is exercised
by `rules_parity` (test-only) and `moderation-bench.test.ts` (Vitest).

Verification: the new bench tests cover slug collisions, current-verdict counts,
shadow-only upserts, the saved-baseline diff payload, disabled comparison,
fixture seals, route persistence, replay marks and a hash-free preview. The
new test in `e2e/journey-gatehouse.spec.ts` keeps the original journey and adds
new-rule typing → 166 hits → marked-only replay → drill preview, with guarded
networking and no requests after page load. Browser execution must be verified
by the Director: this builder's Playwright launch failed with `spawn EPERM`
before test execution.

Builder evidence: desktop package tests passed 52 files / 507 tests; after
adding the final draft-filter assertion, the narrowed bench/moderator/core/
shell suite passed 9 files / 63 tests. Desktop typecheck, desktop lint, the
e2e TypeScript project, `cargo test -p cc-gatehouse`, workspace Rust format
and workspace Clippy with warnings denied passed. Desktop production build
passed its first-load budget (364480 / 393216 bytes). The new unit suite first
failed on its missing implementation, then exposed the JS end-anchor
difference before going green. `pnpm gate` passed version checks, 24 tooling
tests, workspace inventory and Cargo fetch, then failed in the unchanged
contract check with `spawnSync cargo EPERM`. Gate scripts and contract files
have no diff against HEAD. The command never reached the remaining full gate
stages; this is not a full-gate pass.

Open `#/chamber/moderator` without a native core launch. In the Rule bench,
edit an existing Watching pattern rule's name/match, then **Propose watching
rule**. The existing seal slot shows its validated upsert payload; hold Space
on **Hold to seal** to apply it to this simulated session. Invalid/blank
patterns show an error. Nothing saves or arms on an edit or ordinary click.
The editor preserves the original action and cannot edit rails or armed rules.
The existing preview-only mode controls and their safety notice are retained.

The moat still proposes one of Off/2/4/6 seconds through the same seal and
400 ms fixture confirmation. Applied delay remains unchanged until confirmed.
**Play simulated chat** advances the generated bank once a second from 420 to
4,200 lines; Pause or leaving the room cancels its interval. The latest arrival
and verdict are visible above the historical, windowed feed. These are recorded
verdicts, not a re-evaluation of edited rules. Resolve a held message through
Propose Pass/Bar and a seal: the original stays visible and buttons disabled
until confirmation; the empty queue then announces Released/Removed and its
verdict. Undo/petition notices also appear at this review surface. Consensus
and the drill keep illustrative/simulated labels, gaps and pending-parity copy.

**Stream output preview**, below consensus, has separate kit fields for chat
and vote-bar size S/M/L, four corner anchors, the existing azure/gules/or/key
token colours, and all six read-only styles from `demo/model.ts`. Vote art
uses `art(style, 'votebar')`; chat uses the selected typography/treatment.
Show delay is clamped to 0–10000 ms; hide duration, measured after showing,
to 250–60000 ms. Invalid/nonfinite input preserves the last effective value.
Keyboard edits retain a temporary input buffer; blur shows the clamped value.
**Replay output timing** runs Waiting → Visible → Hidden independently for
each layer. Changing a setting restarts an active timing rehearsal. Leaving
the room cancels both timers. The persistent provenance captions never hide.

Both transparent SVG canvases render in existing StageFrames, one with a
1920×1080 viewBox, one 1280×720. Passed chat only and illustrative consensus
shares are shown. Long sample chat is shortened with its full text in a title.
The canvas is transparent; the individual content plates use theme tokens.
No OBS browser source, overlay host, route, event, network or storage was added.
These preferences live in the existing per-ProposalQueue room session and
survive drill/room navigation, but reset on reload. No existing Gatehouse
payload has size/anchor/colour/art_style/show_ms/hide_ms output fields: those
and a future source URL/route and render-event contract are Director questions.

## Journey verification

`e2e/journey-gatehouse.spec.ts` was written before implementation. It uses the
unchanged network/style audits, edits and seals a shadow rule, seals a delay,
plays/pauses chat, resolves a hold, undoes a timeout, selects consensus, reads
the drill, and edits both output layers before inspecting both frames. Expected
red on base: Watching rule editor, playback/arrival feedback, review feedback,
and output fields/frames. Browser execution is reserved for the Director;
this builder did not run a browser or claim screenshots/visual acceptance.

The first four `journey.test.tsx` assertions failed on base (editor/playback,
resolve feedback, undo feedback, output parameters); the additional latest-row
assertion also failed before its fix. Output tests first failed on the absent
output model; rule tests caught the split upsert-validator import before it
was corrected. New tests cover seal-before-edit, malformed rules, bounded
playback/cancellation, per-session output isolation, finite clamping, timed
visibility/cancellation, all six art mappings, passed-only output, empty
output and provenance. Existing test files, including `moderation-gate.test.tsx`,
are unchanged. Desktop and e2e TypeScript pass. Desktop lint passes all shared
boundary/hygiene/400-line/secrets inventories. The final narrowed run and its
exact counts are recorded in the external result, along with Director asks.
No install ran over the node_modules junction; no git writes were attempted.

# Gatehouse C · Herald (WP 1.7 polish, 2026-10-30)

Reconciled against `a9aec46`: the shared heraldic kit existed, but no C room
port did. The binding design is `prototype/polish-2026-10-30/moderator/variant-c.html`
and the two `moderator-c-{paper,stock}.png` acceptance pictures. The older
delivery notes below are historical where they describe the A/1 layout.

The fixture and core rooms now share the C grid (`cc-keep`, 1.07:1:.97), with
three focusable independent regions. Their right insets retain the extra
`space-8` needed by the azure plate shadows. The center is data-fill: its plate
stays above the only scrolling replay feed. WindowedRows owns row roles,
spacers and `aria-rowcount`; line height remains `row-h` for 4,200-line intake.

| Prototype component | Port |
| --- | --- |
| cc-keep / cc-col | moderator-columns / room-column, three regions |
| cc-plate/band/body/actions | kit Plate, PlateBand, PlateBody, PlateActions; azure, offset space-8 |
| cc-plate-meta/quote/reason | ReviewMeta, moderator-plate-quote/reason |
| cc-big-button | kit InkButton big; pass, bar, shield; token overrides for small big actions |
| cc-heading | kit SectionHeading; plain 17/13/13 hierarchy |
| cc-card | kit HeraldicCard plain; bar tone for pending bans |
| cc-banners/banner/search | room-local moderator-banners/banner/search |
| cc-feed/feed-row/pennant/verdict | kit RuledFeed, WindowedRows, RuledRow, Pennant; VerdictMark/ VerdictChip |
| cc-print/crops | kit StageFrame print; illustrative SVG remains fixture-only |
| cc-chip-toggles/tiles/legend | room-local ConsensusSelection, ConsensusTiles, moderator-legend |
| cc-moat-figure/gauge/bridge/stops | kit HeroReadout (54, no ghost, label caption), room-local SVG and labels |
| cc-figures/note/rule-card/side/stamp | room-local counts/rule layout and kit StatusChip mode stamp |
| cc-roll-entry | room-local ruled moderator-roll-entry in windowed ledger |
| cc-drill | kit HeraldicCard and a native drill-route link |

The tools order is deliberately moat, garrison orders, drill, gate roll, then
the supplied shared seal slot. The prototype README's C Porting risks calls
out this emergency-control-first change. The shell, header, Steward, seal-slot
markup/styles and design actions are untouched. Paragraph resets explicitly
exclude the shared seal slot.

Forced differences:

- Kit wrappers replace prototype-specific names: WindowedRows owns the sole
  row; RuledRow provides presentational layout and cell slots. Its inner
  message span holds message/verdict/provenance attributes. Pennant owns its
  word, with the decorative icon positioned beside it, rather than a separate
  naked flag. Pass keeps a transparent flag.
- PlateBand receives a React CountLabel containing two lines, rather than
  literal HTML small/span children. StageFrame supplies its own crop elements.
- The static prototype's 420 full DOM rows become bounded virtual windows.
  Ledger entries also remain windowed, with fixed six-row-token height and
  scrollable originals/actions, so arbitrarily long messages remain accessible.
- Core has no held/ban-queue or applied moat settings read contract. Those two
  C plates explain unavailability without inventing counts, settings or action
  authority. Core history lacks message_text, so only fixture Decisions show
  original messages in the gate roll. Retained core chat still displays text
  and provenance. No new endpoint or contract is introduced.
- Core retains watching-rule editing, fixed safety-rail notices and explicit
  refresh/paging. It offers no arming control. Its chip selection still requires
  Refresh consensus; plots and tiles use only the returned core window, never
  the fixture illustration. These controls require more room than the picture.
- The drill remains a native anchor for routing (with the prototype's small
  big-button geometry). The sealed fixture shield's inverse action reads
  “Lower the drawbridge”; its applied state remains Bridge up / Shield Mode on.
- All has a decorative list icon, as the brief requires an icon on each banner;
  the source picture omits the All icon. The three verdict icons are unchanged.
- The prototype's 1360/900 desktop breakpoints are expressed as 85/56.25 rem:
  CSS media conditions cannot resolve custom properties. Room styles contain
  no raw pixel dimensions or colours, and field chrome remains inherited.
- The native-review-button test resolves the new InkButton leaf by its
  accessible name because the old bare text-only button is gone. Every native
  keyboard, disabled, proposal, seal and confirmation assertion is retained.

`structure.test.tsx` cites the order change and checks regions, plate count,
replay rowcount and trailing seal slot. `herald.test.tsx` exercises banner
press/count/filter/search behavior, verdict words/inks, Watching/Armed stamps,
consensus chip/tile selection, original ledger text and the core C structure.
Existing moderation, gate, governor, proposal, drill and core-read tests remain.
No Vite, Chrome, build, e2e, install, network or live operation is run here;
Director visual comparison and build/budget/full-gate checks remain required.

Review bounce resolved: the Director authorized test-only changes to the four
Gatehouse assertion groups in `shell/room.test.tsx`. They now check the SVG
rect gauge and applied moat state, the standard PlateBand above the original
held message, the hidden hint and fixed replay plate/banners, separate live
and rule-state readouts, and independent scroll regions with stable gutters.
The replay region contains the windowed feed below its fixed plate; only that
feed scrolls. Lottery C assertions from `c261d3d` remain unchanged, and no shell
product code or kit file changed. The shell test file remains under 400 lines.

The four obsolete assertions failed first, then all 18 shell tests passed.
Final bounce validation on the combined Lot/Gatehouse C tree: desktop
typecheck (115 files), desktop lint and the full desktop suite (317 tests in
35 files) pass. UI typecheck (70 files) and lint pass. Shared lint inventories
walked 698 code files and 879 files for secrets. The earlier 41 focused tests
and 305 UI tests also passed; UI tests were not rerun for this test-only bounce.
No install, git write, build or e2e ran. Director visual comparison,
build/budgets and full merge-gate checks remain reserved for review.

## Historical core Gatehouse connection (WP 1.7 desktop half)

Core launches enter the lazy moderator route and use `createCoreGatehousePort`.
`client.ts` keeps the launch capability, injected transport and cached port in a
per-client WeakMap, outside read snapshots. Fixture launches retain the existing
preview and proposal flow; the Steward slot is unchanged.

The port validates requests and replies through generated method contracts from
`@castle-control/contract/gatehouse`. That independently compiled subpath keeps
these validators out of the first-load bundle without changing the wire schema.
It sends only existing methods, including the chat/history reads added at
`5890925`. Errors expose validated
codes and retry timing, never upstream prose, and mutations are not retried.

The connected view reads rules, chat, history and consensus from core. Watching pattern rules
can be edited; arming, rail changes and live action grants are not offered.
Consensus filters fetch their actual core window and series. There is no preview
history or fixture fallback. Chat, history, rules and drill change lists are windowed.
Chat/history retain row provenance and explicit `unavailable_count`; Load more
walks opaque 100-entry page cursors, including empty pages. Refresh starts a new
walk and refreshes consensus; this is an explicit read view, not automatic tailing.

The drill reads `gatehouse.liveRun.get` on request. Each validated page contains
at most 100 ledger entries and replaces the previous page; opaque cursors are
followed even on empty/unavailable-only windows. The capture list is windowed.
A selected retained snapshot stays with the connection across pages. Replay
uses its stored recording/configuration; comparison uses that configuration
as baseline with today's rules as candidate. No caller hash crosses the wire.
Coverage gaps (including replay_gap, bridge gaps, erased/expired evidence and
unsupported context) cannot run or compare. Core still checks retention and
instrument identity at execution time. Results keep the capture hash alongside
each replay hash with explicit match/difference copy, without merging runs or
claiming that matching hashes prove matching decisions or the M1 live exit.

Manual source-labelled JSON import and recording names keep their existing
bank/judge/prompts and saved-baseline flow. Switching source or refreshing the
capture walk clears results so a different capture cannot inherit a result.
Manual/fixture replays have no capture authority and retain pending-parity copy.

The current read contract has no pending-ban queue lookup. That view
therefore explain their unavailability instead of inventing review records. The
typed ban/dismiss/undo/petition port methods are tested, but the UI does not act
on an unseen original message. No live tests or owner steps are claimed.

The room panel offers retained capture evidence and manual imports. All replay
output remains simulated, including replay of a capture whose provenance is live.
No live hash is calculated from current rules or fabricated evidence.

M1b desktop follow-up verification: the new capture tests first failed on the
absent live-read port, then passed. Focused gatehouse-core, moderation,
moderation-gate, client and moderator structure suites cover stored configuration
replay, capture-baseline comparison, matching/differing hashes, refused gaps,
100-entry paging with empty-window continuation, oversized/invalid replies,
windowed rows through the last entry, and stale-output clearing on expiry or
instrument conflict. Typecheck/lint and the production build are package-local;
no install, git write, live Twitch call or owner acceptance is performed.

M1a evidence: `gatehouse-core.test.ts` exercises all twelve methods, invalid values,
HTTP and transport failures, immutable snapshots, concurrent mutation suppression,
baseline persistence, rendered provenance/consensus/comparison data, bounded page
continuation and 4,200 core rows. `moderation.test.tsx` keeps fixture labels and
pending-parity copy. The older `shell/room.test.tsx:280` still expects only two
reads and mocks every non-rule read as consensus; this out-of-scope test needs
empty valid chat/history responses and a four-method expectation before the
full suite can pass. `packages/contract/scripts/test-codegen.mjs` checks the split,
positive and negative schema parity, independent function objects and determinism.

M1a verification: the desktop package runners pass typecheck (99 files) and
lint, including boundaries/hygiene/file-cap (615 files) and secrets (767 files).
The narrowed gatehouse-core, moderation, moderation-gate and client suites pass
52/52 tests. Adding the shell suite yields 69 passed / 1 failed at the old
two-method assertion described above. The desktop production build passes its
382,560/393,216-byte first-load budget. Recursive typecheck/lint encounter
`spawn EPERM`; `pnpm gate` passes 24 tooling tests and stops at the schema
exporter's `spawnSync cargo EPERM`. Director full-gate verification remains open.
No Rust, contract, node_modules, or git metadata was modified by M1a.

Historical validation before M1a: desktop typecheck/lint, all 186 desktop tests,
contract typecheck/lint, all 124 contract tests plus generator assertions, and
all 17 verifier tests passed. The production desktop first-load check passed at
382,254/393,216 bytes. Snapshot-based contract drift passed; the ten pre-existing
generated artifacts are unchanged. The verifier was regenerated because adding
the public package export changes its fingerprint; only the stamp changed.

`pnpm gate` stopped at the native schema exporter (`spawnSync cargo EPERM`).
Native parity could not run for the same reason, and recursive workspace
typecheck/lint wrappers failed at subprocess creation (`spawn EPERM`). These
checks still require App Master verification; they are not claimed green.

## Closer to A/1, 2026-10-28

Open `#/chamber/moderator` in browser fixture mode (no injected core launch).
Tab between the three scroll regions and their native controls. The drill
still opens at `#/chamber/moderator/drill`; Back/Escape and the shared Steward
keyboard paths remain owned by the shell.

Compared with `prototype/ai-first/keep/index.html`, `gateInterior`, and section
3 of `docs/plan/04-ai-first-ui.md`:

Gaps closed:

- The fixture room now has A/1's three independent columns, in the reference's
  1.3:1:.95 proportions: holds/ban review/consensus, sample replay, then tools.
  The 420-line Pass/Hold/Bar replay no longer shares a narrow scrolling column
  with all the rules, moat, drill, ledger and seal controls.
- The tools column keeps rules before moat, drill and gate log. The existing
  seal slot, including its design focus entry points, remains at its end.
- The columns use the reference's 16/18-unit insets, derived from shared
  tokens. Unnecessary outer card borders and padding are removed from fixture
  tools and replay, restoring the reference's rule-separated composition.
- Rule names and match/action text now sit beside Watching/Armed proposal
  buttons, instead of stacking each button below the text. Tool headings use
  the existing readable label scale, with tighter current-state spacing.
- Held quotations use A/1's 26-unit scale while retaining the caption-sized
  portcullis title, the original message and review reason. Replay search and
  verdict controls align their labels and fields in the center column.
- All three columns remain keyboard-focusable and independently scrollable;
  the stable scrollbar affordances and held-queue scroll hint remain. Below
  the existing 900px breakpoint they stack in reading order.

Gaps left:

- The fixtures, message IDs/times, hold reasons and proposal labels are
  unchanged. A/1's login/profile summaries, advice capsules, running replay
  animation and additional aggregate counters are not invented here.
- The existing ban queue, consensus filters, safety/status notices and gate-log
  controls have more content than the prototype. They remain visible and
  scrollable rather than being discarded to imitate its shorter sample.
- The portcullis heading retains the existing caption-scale accessibility and
  regression contract. A/1's larger portcullis heading is not reproduced.
- The shared shell, keep background, header, Steward, seal slot and design
  focus are unchanged. The core-connected room retains two columns because
  its contract currently supplies no live chat/held-list read surface. New
  layout rules are scoped to fixture columns; core rule forms are unchanged.
- Visual fidelity, exact fold positions and three-column readability at
  1440x900 and 1280x800 remain unverified. Computer Use denied Chrome access
  with “Computer Use was not approved to use Google Chrome”. The comparison
  above is source-based; no screenshots were captured and no `shots/`
  artifacts are claimed.

Evidence: `structure.test.tsx` first failed on the absent center replay column,
then passed with holds/consensus, the windowed 420-line replay, ordered tools
and the trailing supplied seal slot. Existing lots, moderation,
moderation-gate, navigation and shell room tests remain in the narrowed run.

Validation for this delivery: desktop typecheck (93 files), desktop lint
(including boundaries, hygiene, file-cap and secrets checks) and production
build passed. First-load JS+CSS: 382,467/393,216 bytes. Final narrowed Vitest
run: 108 tests in 15 files passed (`lots`, `moderation`, `moderation-gate`,
`navigation`, `shell/room` and `src/rooms/`). Both new structure tests were
proven red before the layout change. No install, git write or live test ran.
