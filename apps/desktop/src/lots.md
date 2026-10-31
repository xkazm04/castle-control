# AI-5: offline Lot Chamber room

## lots-B rehearsal delta, 2026-10-31

Reconciled against L1 (`a6f305f`): setup, Start simulated draw, FixtureCast and
simulateCast already existed. This delivery extracts the desktop's cc-verify v1
bytes into `lots-cast.ts` (`sealOf`, `commitmentOf`, `castWinners`, `verifyWrit`).
The saved corpus vector still pins ordered winners simulated_01, simulated_00;
it is a secondary reference, not the result of the editable roll.

A completed proposal hold retains the original canonical JSON bytes/digest and
also stores a frozen v1 LotsProofRoll and its v1 seal. The actual generated
contract name is LotsProofRoll (the card calls it LotsRoll). It contains this
roll's eligible handles/weights, winner count, whole-second simulated session
time, six-second margin and streamer_commit commitment. The fixture clock is
explicitly fixed at 2026-10-31T12:00:00Z and its seed is 32 bytes of 01; this is
reproducible simulated data, not live time or entropy. Tests can inject a clock.
Asynchronous hashing checks for concurrent proposal/setup changes before any
seal; a failed or stale hash never authorizes a cast.

After sealing, **Cast the lots · rehearsal** and the preserved **Start simulated
draw** action invoke the same v1 cast. No Draft a new roll appears until a cast
is accepted. The cast, winners, roll and writ are frozen, concurrent starts are
single-flight, and a second start explains that the cast is fixed. Accepted
winners alone feed the urn. The current ticket lists them and exposes
**Recompute this cast**, which recomputes its seal, commitment and ordered
winners; its raw v1 writ is available under the existing current-writ action.
The current SIMULATED region, existing setup names and the required **Not a
cc-verify proof** disclaimer remain; the disclaimer now specifies a live draw.
The reference vector and original JSON digest have separate recompute actions.

The v1 proof protocol has no cohort field. Like cc-lots, the fixture checks caps
separately and refuses an over-cap v1 outcome without rerolling, relabelling it
as accepted or changing sealed eligibility. The older simulateCast now serves
only as a feasibility preflight. Only the existing `raiders excluded` proposal
amendment changes eligibility during sealing. Draft cap/prize copy comes from
the selected draw, including a changed or missing raider cap.

`reveal.ts` mirrors `packages/renderer/src/draw/scenes.ts` buildDrawScene:
1200 ms flourish, then one winner every 900 ms; reduced motion reveals all at
once. The session-owned playback cursor resumes the same cast across room
remounts and cleans up browser timers/listeners. Urn props are normalized once
from entry count: columns=min(20,ceil(sqrt(count))), SVG limit=columns*16 and
radius=min(5,52/sqrt(count)). Revealed SVG dots receive one order badge and ring;
windowed rows mark winners and retain an ordered revealed-winner list even
when the corresponding entry is outside the scroll window. Existing appearance
parameters and their labels remain; their reveal_ms controls preview/ticket
animation, while the urn uses the documented canonical cadence.

Acceptance evidence lives in `lots-cast.test.ts`, the added cases in
`lots.test.tsx`, the updated async `rooms/lottery/journey.test.tsx`, and the
fixture-only rehearsal journey added to `e2e/ui.spec.ts`. The extraction test
was red for the absent module before implementation. Vitest checks vector and
tamper parity, 87-entry determinism, frozen v1/session results, caps/amendments,
the selected draw's draft fields, exact reveal times, SVG/windowed winner marks,
and cast/recompute/new-roll rendering. The frozen `e2e/journey-lots.spec.ts`
belongs to another delivery and is untouched. No renderer/verifier dependency,
contract, RPC, store, core room, OBS or live-channel path changes.

Run desktop test/typecheck/lint, the touched ui.spec.ts Playwright lane and
`pnpm --config.verify-deps-before-run=false gate` without installing over the
worktree's node_modules junction. Exact command outcomes are recorded in the
external result.json; an attempted Playwright run stopped at spawn EPERM before
browser assertions, so no browser pass or screenshot fidelity is claimed.

Validation: full desktop test passed (505 tests in 51 files before the additional
cap-refusal regression); desktop and e2e TypeScript checks and ESLint passed.
Production build passed with all 122 tokens and 364,599/393,216 initial JS+CSS
bytes. Full `pnpm gate` passed its 24 tooling proofs and workspace inventories,
then failed at the unchanged contract exporter with `spawnSync cargo EPERM`.
Read-only diff confirms exporter, gate, Playwright config and the other builder's
journey spec are identical to HEAD; HEAD's docs/PLAN.md records the same exporter
failure. No full-workspace pass is claimed. The merge gate must run the browser
and remaining full gate checks where child-process spawning is permitted.

## Earlier implementation notes

L1 update, 2026-10-31: fixtures now include editable setup, generated pool/weight
previews, session-only urn appearance and a fixed-seed SIMULATED cast after
sealing. The current writ is explicitly not a cc-verify proof; the saved fixture
proof stays separate. See [the room README](rooms/lottery/README.md) for the
current journey, evidence and unresolved fixture-to-OBS handoff. The historical
implementation notes below describe the earlier cut.

Open `#/chamber/lottery` in the desktop browser preview. This replaces the
stacked panels with the Lit Keep's nested writ-and-urn room. `shell/room.tsx`
keeps its existing props contract, loads the room lazily and mounts the same
proposal seal slot for every chamber. Core mode never loads simulated controls.

The room reads the shared proposal queue. Pending drafts take priority over
selected historical writs; with none pending the writ templates remain available. Its writ labels every open draft as
Proposal, shows all struck values in gules, and re-inks amendments beside them.
Every eligible fixture lot appears as a mark in the urn. Pools above 320 entries
use token-sized, virtualised rows; the 10,000-entry test visits both endpoints.
The room also exposes handle lookup, cooldown provenance, past local seals,
the existing saved simulated writ and its offline recomputation, and all four
fairness steps. The existing model, fixture vector, copy and guardrail function
remain the source of domain behavior. No RPC, network, model or public beacon
call was added. Saved proof recomputation never claims to verify the editable
87-entry roll.

## Sealing and guardrails

The room's template buttons draft proposals only. A completed kit SealButton
hold calls `sealRoomProposal`, also used by the Overview hold, which lazily invokes the lottery session. That
session applies the existing giveaway policy check before sealing. Paid entry,
paid weight, missing prize rules/disclaimer and the prize-value threshold keep
their original behavior. A prize amendment is checked as a prize. A proposal
keeps its original draw policy even when another template is selected.

Sealing copies and freezes the eligible entries. The displayed canonical bytes
are UTF-8 JSON with field order `handle`, `weight` for each entry in pool order.
Web Crypto SHA-256 hashes those exact bytes offline; `queue.seal(id, hash)` stores
the hash and the writ stamps a wax seal. The published JSON and its hash can be
recomputed independently. This illustrative entry-list seal is explicitly
separate from the existing cc-verify v1 public-writ encoding. No round or cast
is fabricated. Hash failure, a concurrent amendment or a torn draft leaves the
proposal unsealed. The hold control remounts on revision changes, cancelling an
unfinished hold. New local roll drafts remain explicit proposals.

## Core mode

Core launches mount `rooms/lottery/core.tsx` with `createCoreLotsPort`. Connection
capabilities stay in memory, outside snapshots. Fixture/browser preview keeps
the original room, `createLotsPreview`, ProposalQueue and `sealRoomProposal`.
Core mode renders no simulated templates, design controls or fixture proofs.
No `steward.*` call is added.

The port reuses `validateCoreLaunch` unchanged and the seven existing Lots
contracts. Production uses `invokeMethod`; fake-network results use the same
generated validators, imported from `@castle-control/contract/lots`. The generator
compiles this subpath independently from the legacy synchronous registry so its
validator functions stay in the lazy core-room chunk. The original generated
schema, types and registry remain unchanged. RPC errors become visible code/retry notices; upstream
prose is withheld to protect capabilities. Errors never substitute fixtures.
Lookup requires a Twitch user ID. Seal supplies only draw ID, `drand_quicknet`
and a six-second margin; cast supplies only run ID; writ retrieval only writ ID.
The client submits no entries, winners or seed. Frozen entries, winners and the
downloadable proof come from core responses, with virtualised lists.

The shared hold control initiates sealing after a fresh service policy check.
Sending the seal request locks edits, selection, refresh and resealing, even if
the response is lost. Published data is frozen. Uncertain seals need core
reconciliation; the contract has no resume-by-draw method. Intake pause is
explicitly unavailable. Schema validation makes no cryptographic claim: check
the downloaded proof with an independent verifier.

### Core prerequisite validation, 2026-10-27

- Desktop typecheck and lint pass (78 source files), as do contract typecheck
  and lint (18 files) and tooling ESLint (15 files). Boundary/hygiene/file-cap
  checks walk 509 files; secrets scanning walks 636.
- All desktop tests pass: 176 tests in 20 files. The exact requested narrowed
  Lots command passes 27 tests. All contract tests pass: 124 tests in 11 files.
  Core tests use a fake RPC transport and assert no fetch or WebSocket calls.
- Generator tests cover ten deterministic artifacts, independent lazy validator
  function objects, all seven Lots methods and the unchanged 1,000-writ corpus.
  Drift passes with the committed schema input. All original seven generated
  files have no Git diff, including contract.schema.json and types.ts.
- Full `pnpm --config.verify-deps-before-run=false gate` fails at the unchanged
  Rust schema-export spawn with `spawnSync cargo EPERM`, before Rust/product
  checks. Its preceding 14 tooling tests pass. Full Rust registry parity hits
  the same sandbox error; generator parity unit tests pass. The Director reruns
  full drift/parity and the merge gate outside this sandbox, as instructed.
- Desktop production build passes: first load drops from 463,926 to 382,135
  uncompressed JS+CSS bytes against the unchanged 393,216-byte cap. The core
  Lots view and its validators occupy a separate 93,249-byte lazy JS chunk.
- No installs, new packages, git writes or live-channel tests were run. The
  worktree is left uncommitted for the App Master.

## Review and evidence

Run from the worktree, without installing over its node_modules junction:

- `pnpm --config.verify-deps-before-run=false --filter @castle-control/desktop exec vitest run --pool threads src/lots.test.tsx src/moderation.test.tsx src/moderation-gate.test.tsx src/shell/room.test.tsx`
- `pnpm --config.verify-deps-before-run=false gate`
- `pnpm --config.verify-deps-before-run=false --filter @castle-control/desktop build`

The room tests cover struck 3 -> 5 winners, independent frozen-list SHA-256,
immutable entries, policy rows and both rules/disclaimer orders, stale drafts,
no raiders, lookup, model isolation, fixed-writ recomputation and failures,
bounded urn marks, no network, and hold/keyboard behavior in the shared slot.

For the visual review, run a production build, then
`pnpm --config.verify-deps-before-run=false --filter @castle-control/desktop exec vite preview --host 127.0.0.1 --port 4178 --strictPort`.
Visit `http://127.0.0.1:4178/#/chamber/lottery` at 1440x900 and 1280x800, in paper
and stock. Choose Questions for the hall to create a draft; after the parallel
Steward wiring, say `draft a question draw`, then `make it 5 winners`. Inspect
against `prototype/ai-first/keep/index.html`. The shared 1-4 locator, Esc back to
the origin, Delete on the focused proposal, and held Space use the existing
keymap. Ordinary clicks and Enter cannot seal. The actual hold handlers are
exercised under React's server renderer without adding a DOM test dependency.

Browser screenshot review remains with the Director: no browser connector was
available, and native Chrome automation returned "Computer Use was not approved
to use Google Chrome". No screenshots were claimed. Vite dev also hit EPERM on
the junction's dependency cache; production preview serves built files without
touching that cache. No permission or cache workaround was attempted.

## AI-5 validation on 2026-10-26

- Desktop typecheck: PASS, 49 source files.
- Desktop lint: PASS, 49 source files; boundary/hygiene/file-cap inventory
  434 files, secret scan 555 files.
- Narrowed room/navigation/event tests: PASS, 43 tests in six files.
- Full desktop tests: PASS, 89 tests in ten files.
- Production desktop build: PASS, 98 transformed modules; first load
  387,118 / 393,216 uncompressed bytes. Both rooms and their session code
  remain lazy chunks.
- `git diff --check`: PASS.
- Full `pnpm gate`: FAIL before Rust/product checks at the unchanged contract
  exporter, `spawnSync cargo EPERM`. Its preceding 14 tooling tests passed.
  Recursive `-r typecheck` and `-r lint` independently stop at `spawn EPERM`.
  `git diff --exit-code -- packages/contract/scripts/codegen.mjs
  packages/contract/scripts/check.mjs scripts/gate.mjs` passed, and the base
  docs/PLAN.md already records the same exporter/subprocess errors. No gate or
  unrelated exporter was modified. No full-workspace pass is claimed.
- Frozen-lockfile install: SKIPPED by the brief's explicit junction exception.
- Visual comparison: UNVERIFIED; connector inventory empty, native Chrome
  automation not approved. Use the documented URLs/sizes for Director review.

## Wave 2b integration

The seal slot now renders the kit ProposalCard, with in-flight sealing disabled
and revision-keyed holds. Writ inking stays in the room's left column with
co-located styles. The empty/pending/amended/torn and older-selected-writ cases
are covered by lots.test.tsx. Overview tests prove shared seal dispatch, identical
guardrail refusal, weighted frozen-list SHA-256 and cancellation on amendment or
tear during hashing. Room-wide provenance strips were removed; the saved-proof
caveats and fairness labels remain.

## M2 native live draw

The connected page can create a one-winner no-prize `!join` question draw through
the existing `lots.draw.upsert` schema. It never creates entries locally.
Round labels use existing core status plus the accepted seal, distinguishing
unknown/opt-in-required, recorded simulated, streamer-controlled and pinned
live-trusted quicknet. The seal-announced state includes the target round before
Cast is offered. The fixture room remains simulated and independent.

Native live mode requires the data-directory `live-quicknet` file. Its separate
`/lots/{draw_id}` OBS result plate is fed by the typed sealed/cast handoff, not
Beacons or a fixture animation. See [the M2 owner runbook](../../../docs/guide/lots.md#m2-live-run)
for exact launch, capture and verifier steps. The owner run and visual review
remain pending; recorded regression tests do not establish a live exit.
