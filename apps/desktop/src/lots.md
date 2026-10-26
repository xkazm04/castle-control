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
