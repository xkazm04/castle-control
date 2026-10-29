# Core Gatehouse connection (WP 1.7 desktop half)

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
