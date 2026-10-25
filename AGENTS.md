# Castle Control builder instructions

Read [docs/PLAN.md](docs/PLAN.md) and the assigned work package in
[the implementation plan](docs/plan/03-implementation-plan.md) before coding.
Read the registry subjects named by the brief. One forked thread and worktree
owns one work package; review bounces resume that thread. Builders use
`gpt-6.1-sol` with reasoning effort `high`. The Director reviews and merges.

## Repo law

- Commit only files you touched: never `git add -A`, never stash, never `--no-verify`.
- No credentials in code, config, logs, fixtures or test output. Twitch tokens and API keys live in the OS keychain and are referenced by label only.
- A spawned Codex CLI runs in an explicit sandbox (`-s read-only` for design work) with the user's own sign-in. Never use `--dangerously-bypass-approvals-and-sandbox`. Never read, copy or inject credentials, and never read `~/.codex/auth.json`.
- Real chat never becomes a fixture: test data is generated and labelled simulated.
- Every value that crosses a boundary is parsed by its schema in one place.
- Contract rule: identifiers in docs/plan/03 'Contract identifiers' are law, and a new identifier lands in cc-types first, in its own delivery.

## Builder sandbox

Build threads run no git write: no add, commit, mv, rm, checkout, restore or stash.
Moves are done with the filesystem. Leave the finished change uncommitted in the
assigned worktree and write the external `result.json` specified by the brief;
App Master commits it. Never modify the main checkout or another worktree. Never
follow, remove or install over a `node_modules` junction. The brief's sandbox
exception takes precedence over general commit instructions.

## Done gate and conventions

Run `pnpm install --frozen-lockfile`, then **`pnpm gate`**, the same command as
Windows CI. New pnpm members must define `typecheck`, `lint` and `test`; use the
shared `scripts/package-gate.mjs` runner with a `src/` tree and `tsconfig.json`.
Every gate reports its file inventory and refuses an empty inventory. Rust
members join via `crates/*` without editing the root members list. The gate
explicitly disables Cargo offline mode so approved downloads can use the cache.

Preserve strict TypeScript flags, import boundaries, cycle checks, no `any`,
no `as unknown as`, no raw `keydown` listeners, no swallowed catches, the
400-line code-file cap and secrets scanning. Prototype code is reference only:
extract its unchanged design tokens and layouts, never copy its product code.
Use shared components, co-located styles, virtualised lists and one keymap.
Keep plain terms in identifiers, snake_case fields, RFC 3339 UTC timestamps,
string Twitch IDs/seeds/rounds, and omit absent keys. Schema/codegen belongs to
`cc-types` and `packages/contract`; WP 0.1 skeletons define no identifiers.

Copied Shadowrunr OS code must name its source path and commit (`7e4b6f8`) in a
header and retain notices. No cross-repo dependency or Overlord-specific logic.
Update the owned doc surface and provide evidence for every acceptance criterion.
Do not touch another package's paths. Return questions for ambiguity or a scope
change rather than guessing. No pushes or new services from build threads.

## Safety and live tests

- Live tests run only on the owner's test channel. Armed actions only ever target the owner's own test accounts.
- No armed action reaches a real viewer until the M1 exit is met and the owner signs off in writing.
- An Extension build reaches only allowlisted accounts until the owner approves submission.
- Chat reaches downstream modules only after its moderation verdict. Shadow is the default; the deterministic action gate enforces safety. Bans require human approval by default.
- Money affects visuals only; Steward changes require a seal. Local processing is the default and cloud use is opt-in.
- Credentials, Twitch policy decisions, live spikes, release and submission owner steps are prepared as asks, never fabricated.
