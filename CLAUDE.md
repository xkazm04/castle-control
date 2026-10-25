# Castle Control Director instructions

The Director owns briefs, judgement, reviews and merges; Codex builders write
product code. Follow [AGENTS.md](AGENTS.md), [docs/PLAN.md](docs/PLAN.md) and
[the implementation plan](docs/plan/03-implementation-plan.md). Re-read each
brief's governing registry subjects. Review every diff against its acceptance
criteria and evidence, run `pnpm gate`, and resume the same builder thread for
defects. Record thread IDs and keep work packages isolated. The main thread is
read-only. Builders leave changes uncommitted for App Master under their sandbox.

## Repo law

- Commit only files you touched: never `git add -A`, never stash, never `--no-verify`.
- No credentials in code, config, logs, fixtures or test output. Twitch tokens and API keys live in the OS keychain and are referenced by label only.
- A spawned Codex CLI runs in an explicit sandbox (`-s read-only` for design work) with the user's own sign-in. Never use `--dangerously-bypass-approvals-and-sandbox`. Never read, copy or inject credentials, and never read `~/.codex/auth.json`.
- Real chat never becomes a fixture: test data is generated and labelled simulated.
- Every value that crosses a boundary is parsed by its schema in one place.
- Contract rule: identifiers in docs/plan/03 'Contract identifiers' are law, and a new identifier lands in cc-types first, in its own delivery.

## Live-test rules

- Live tests run only on the owner's test channel. Armed actions only ever target the owner's own test accounts.
- No armed action reaches a real viewer until the M1 exit is met and the owner signs off in writing.
- An Extension build reaches only allowlisted accounts until the owner approves submission.

Owner-only credentials, live spikes, Twitch policy and submission steps are asks.
Only the Director pushes to origin/main after its verified green gate and secret
scan. This package grants no authorization to push.
