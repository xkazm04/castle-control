# Steward adapters

`@castle-control/ui/steward` exports the shared `StewardPort`, proposal queue,
`SimulatedSteward`, `LiveSteward`, and `createSteward` factory.

The delegate approved `@castle-control/contract` as a workspace dependency of
`@castle-control/ui` for AI-8; the lockfile change is limited to that importer.

`createSteward()` returns `SimulatedSteward`. Supplying a transport alone does
not enable live mode. A future caller must explicitly forward its existing
`CC_LIVE_*` opt-in as `live: true` and provide a `StewardTransport`. The factory
reads no environment variables and opens no connection. The desktop shell
continues to construct `SimulatedSteward`; this delivery does not wire it live.

```ts
const offline = createSteward();
const optedIn = createSteward({ live: true, transport, queue: proposalQueue });
```

The injected transport mirrors the declared contract: `ask` is `steward.ask`,
`seal` is `steward.writ.seal`, and `tear` is `steward.writ.tear`. Each accepts
the generated parameter type and returns untrusted JSON text. The adapter
parses ask/tear parameters and results through the existing contract parsers.
There is no network client, model call, credential handling, or executable
configuration in this adapter or its fixtures. The transport's seal member is
reserved for a separate human hold path and is never invoked by this port.

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
authorization and guardrails. A later delivery owns the human hold integration.

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
