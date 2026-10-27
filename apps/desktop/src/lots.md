# AI-5: offline Lot Chamber room

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
