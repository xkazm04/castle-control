# Steward adapters

`@castle-control/ui/steward` exports the shared `StewardPort`, proposal queue,
`SimulatedSteward`, `LiveSteward`, and `createSteward` factory.

The delegate approved `@castle-control/contract` as a workspace dependency of
`@castle-control/ui` for AI-8; the lockfile change is limited to that importer.

`createSteward()` returns `SimulatedSteward`. Supplying a transport alone does
not enable live mode. A caller must explicitly forward its existing
`CC_LIVE_*` opt-in as `live: true` and provide a `StewardTransport`. The factory
reads no environment variables and opens no connection. Without an injected
transport it stays simulated, even when live mode is requested. The desktop
shell supplies the live transport only for a reachable core launch with
`steward: 'live'`; fixtures, disconnected launches and omitted opt-ins stay
visibly simulated. Capabilities stay outside the serializable read snapshot.

```ts
const offline = createSteward();
const optedIn = createSteward({ live: true, transport, queue: proposalQueue });
```

The injected transport mirrors the declared contract: `ask` is `steward.ask`,
`seal` is `steward.writ.seal`, and `tear` is `steward.writ.tear`. Each accepts
the generated parameter type and returns untrusted JSON text. The adapter
parses ask/seal/tear parameters and results through the generated standalone
`@castle-control/contract/steward` validators. `contract.ts` infers their types
and decodes JSON through the existing `@castle-control/contract/door`; it
does not import the general RPC registry or define a schema.
There is no network client, model call, credential handling, or executable
configuration in this adapter or its fixtures. The transport's seal member is
used only by the separate human hold path, never by asking or amending.

Ask needs a supported chamber in its context, or an explicit selection of an
open writ owned by this adapter. Lots maps to lottery, Gatehouse to moderator,
and Beacons to visuals. Map Room has no typed Writ mutation yet and is refused.
Each proposed Writ becomes a fresh revision 1 draft using the server's Writ ID.
The complete typed `before` and `after` snapshots are displayed as stable JSON
fields; absent `before` is labelled "New configuration". No seal hash is
invented. Beacons drafts need a human hold to seal and proclaim; the other
supported drafts need a human hold to seal. Receiving a proposed mutation or
arming acknowledgement never grants authority to execute it.

Amend calls ask with the existing Writ ID. The shared queue preserves its
identity, increments its revision when values change, and strikes previous
configuration values. Tear sends the existing ID and requires a matching torn
Writ before marking the same queue entry torn. Unknown, simulated, or terminal
queue selections are refused, as are wrong-chamber, mismatched, stale, errored,
or malformed replies.
If any queue state changes while a request is pending, its result is discarded.
Failure returns a plain "No authorization was given" reply and leaves queue,
selection, and focus untouched. There are no automatic retries or rollbacks of
transport effects; an injected production transport still needs the core's
authorization and guardrails.

The desktop bar, Overview and room slot share the same per-connection adapter.
`createSealAuthority({ queue, live?, local })` is the seal/tear routing door:
`owner(proposal)` reports `live` when the adapter owns its ID, otherwise `local`.
`seal(proposal)` and `tear(proposal)` resolve `{ ok, reply }`. Stale or terminal
proposals are refused. Live operations go only through the adapter; a failed or
uncertain core confirmation never falls back to the local sealer or queue tear.
Local seals use the injected existing room sealer (including its lottery and
moderation guardrails); local tears use the queue's existing lifecycle.

The desktop's `shellSealAuthority(connection)` memoizes that authority alongside
the adapter. Overview's hold and Inspector tear, the fixture slot and the live
slot use it. The shell retains the established connection during interrupted
reads; the adapter checks reachability before every call. A seal response must
match the draft and confirm sealed status before the local queue changes; an
uncertain seal is never automatically retried. Live-owned writs never project
into sample Program, and notices use the core adapter's reply. Fixture holds
retain their simulated Program projection and exact notice. Sealed/proclaimed
states remain terminal; this adds no undo, RPC, contract identifier or OBS action.
The Map Room remains unsupported until its Writ contract exists.

`authority.test.ts` covers delayed core confirmation, failed seal/tear without
local fallback, injected local sealing, and stale/terminal refusal. Desktop
`shell/authority.test.tsx` checks Inspector routing, shared authority identity
and disconnected ownership; `overview/program.test.tsx` checks live visuals
isolation from sample Program and the unchanged fixture notice. All transports
and data in these tests are synthetic.

`fixtures/recorded.ts` contains synthetic recorded-format Writs for all five
supported mutations and a scripted in-memory transport. No real chat or service
response was recorded. Its seal method deliberately refuses authorization.
`live.test.ts` exercises each mutation, amendment history, tearing, malformed and
failed replies, offline factory defaults, and global fetch/WebSocket tripwires.

Verification from the worktree root (dependency links must already exist):

```text
node scripts/check.mjs boundaries
pnpm --config.verify-deps-before-run=false --filter @castle-control/ui typecheck
pnpm --config.verify-deps-before-run=false --filter @castle-control/ui lint
pnpm --config.verify-deps-before-run=false --filter @castle-control/ui exec vitest run --pool=threads src/steward/
```

Do not install over a worktree's node_modules junction. The Director must
materialize an approved missing workspace dependency in the main checkout.

## AI-8 worktree evidence (2026-10-27)

- `pnpm install --lockfile-only` exited 0; only the UI importer gained the
  approved contract dependency. No dependency install/link operation was run.
- Boundary, hygiene, 400-line, and secrets gates passed (487 code files;
  611 secret-scan files). UI ESLint passed.
- Direct UI TypeScript checking reported only TS2307 for the unresolved
  `@castle-control/contract` imports in `live.ts` and the fixture transport.
- Narrowed `src/steward/` Vitest: 100 existing tests passed; the live suite
  could not load and the exported-singleton test failed because the contract
  package could not resolve. The new live assertions are not verified green.
- Recursive typecheck/lint stopped at `spawn EPERM`. The required `pnpm gate`
  passed 14 boundary fixtures and workspace inventories, then stopped at
  `spawnSync cargo EPERM` during contract checking; later stages did not run.

Delivery is partial pending the Director's approved dependency link and gate
rerun. No relative-import fallback, TypeScript alias, or module installation was
used to hide the resolution failure.

## Steward live recovery evidence (2026-10-28)

Recovered the 13 saved files from worktree `5102986b`, byte-checked before
adapting their imports. None of the nine modified paths changed between
`032d83a` and this delivery's base, `ade9202`; newer room changes are retained.

- Direct desktop Vitest: 29 files, 241 tests passed, including the copied
  client, lazy-view and shell hold/seal/tear integration tests.
- Direct UI Vitest: 18 files, 292 tests passed, including the copied live
  adapter and bar tests. Fixtures are synthetic; no live services were called.
- All six package suites run directly: 78 files, 780 tests passed. Contract
  generator, drift and parity fixture assertions also passed.
- Direct `tsc --noEmit` and ESLint passed across all six packages; tooling
  ESLint passed too. Boundary, hygiene,
  400-line and secret checks passed (600 code files, 749 secret-scan files).
- Desktop build and unchanged bundle gate passed: 382,560/393,216 bytes.
  Before the import adaptation it failed at 450,634 bytes. The first-load
  assets contain neither the live adapter nor its label or parser; those stay
  in lazy chunks. No cap, gate, contract or room source was changed.
- Required recursive pnpm typecheck, lint and test commands each failed before
  executing package checks with Windows `spawn EPERM`. Those gates need an
  App Master rerun; direct checks above do not claim a recursive gate pass.
- `pnpm --config.verify-deps-before-run=false gate` passed its 24 tooling
  tests and workspace inventories, then failed at `spawnSync cargo EPERM`
  in contract export. A separate live parity check hit the same spawn error.
  Rust format, Clippy and tests were not reached. No git writes were run;
  App Master commits the uncommitted delivery under the sandbox exception.

## shell-A verification (2026-10-31)

All nine scout premise anchors still hold at base `5d4f83e`, including after
`34b13d3`, `2d1cf4e`, `a6f305f` and the Map Room follow-up. Their room changes
do not close the Overview fixture-seal or Inspector local-tear paths. Existing
lottery/moderation sealer signatures are unchanged by this delivery.

- Red first: the authority unit suite failed on its missing module; the desktop
  acceptance additions failed on the missing authority exports. Green after
  routing: all 20 UI suites / 324 tests and 49 desktop suites / 381 tests pass.
  The existing program, surfaces, room, Steward and view tests remain green.
- UI and desktop package typecheck/lint pass. Boundary, hygiene, 400-line and
  secrets scans pass (750 code files / 1,020 secret-scan files).
- Desktop build passes at 364,480 / 393,216 initial bytes; kit build passes at
  261,338 / 262,144. The overlay build passes with its output redirected to the
  external run directory; no overlay source or tracked output was changed.
- `pnpm --config.verify-deps-before-run=false gate` passes 24 tooling tests and
  inventories, then fails at unchanged contract export: `spawnSync cargo EPERM`.
  Rust checks and later stages were not reached. Recursive typecheck and lint
  each fail at pnpm's `spawn EPERM`; individual package checks above pass.
  Gate scripts, contract sources/exporter, cc-types and lockfiles have zero diff
  against the base, consistent with the previously recorded sandbox failures.
  App Master must rerun the full gate outside this subprocess restriction.
- No install, git write, credential access, live service or OBS action was run.
