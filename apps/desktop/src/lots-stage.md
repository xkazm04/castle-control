# Fixture Lot Chamber stage

From this worktree, run:

```text
pnpm --config.verify-deps-before-run=false --filter @castle-control/desktop dev --port 5173 --strictPort
```

Open `http://127.0.0.1:5173/#/lottery/stage`. Browser preview defaults to fixture
mode. `#/lottery` remains the reference layout. Core mode never renders the stage.
No install is needed; the worktree's dependency junction must remain untouched.

## Operator walkthrough

- The roll occupies the shared StageFrame graphic slot. Three figures report
  entries, intake state and cooldown exclusions; two actions seal/pause the
  local fixture roll. Tickets and the shared virtualised dot field use the
  existing generated entries. Sealing observes the existing prize guardrails.
- Tab to any entry and press Enter. Routes `1.1` through `1.6` and `writ` show
  a single focus view, with breadcrumb and Back. Escape returns to the stage;
  focus returns to the originating link. Keys 1–4 and `/` retain their existing
  shell behavior, including the typing guard. Key 1 opens the reference route.
- Existing saved-draw, lookup, setup, fairness, shape and writ content is shared
  with the reference page through pure panel factories. State survives focus
  transitions. The new 1.6 Past draws view exposes the one existing saved fixture
  proof; it does not invent a live draw history.
- Restyle offers wax-seal urn, azure wheel and gilded deck. Each is local typed
  style data: shape, ink and paper treatment. Selecting a preset changes the
  stage artifact, keeping the entry pool and policy unchanged.
- Custom design accepts a prompt and always returns the same canned lantern urn
  after 450 ms. The view explicitly says **Fixture: no LLM call**. Current and
  proposed looks appear side by side. Seal applies the proposal locally and
  returns; Tear up discards it. Leaving cancels pending work. Nothing persists
  after reloading the page. No prompt is sent or evaluated.

## Scope and validation

StageFrame contains no chamber copy or behavior. Tuple slots allow at most three
figures and two primary actions. The stage-only input styles reproduce the
prototype's paper fill, ink bottom rule, square lower corners, select chevrons
and focus treatment using existing tokens and a 13 px floor. Reference styles
are unchanged. Copy and design types stay local to the desktop package.

No core, contract, renderer, token, dependency, live-service or other-chamber
change is included. No product code is copied from the prototype.

Validation on 2026-10-26:

- Direct desktop/UI `exec tsc --project tsconfig.json --noEmit` and
  `exec eslint src --max-warnings 0` pass, using pnpm's
  `--config.verify-deps-before-run=false --filter <package>` flags.
- All desktop tests: 87 pass in nine files. All UI tests: 74 pass in four files.
  New cases cover every focus link, isolated views, Back hashes, Escape and
  shared shortcuts, all three presets, asynchronous custom preview/seal/tear,
  cancellation, fixture/core separation, StageFrame slots and CSS tokens.
  These are server-rendered/component-handler tests, not mounted-browser tests.
- The token test was observed red for an undeclared spacing token, then green
  after expressing the spacing through existing tokens.
- Desktop build passes its unchanged budget. Hash parsing is deliberately
  separate from the lazy design/copy modules to keep the eager bundle small.
- `node scripts/check.mjs` passes boundaries, hygiene, file cap and secrets.
- `pnpm --config.verify-deps-before-run=false gate` fails in the unchanged
  contract exporter with `spawnSync cargo EPERM`, after 14 passing tooling tests
  and workspace inventories. Rust and recursive checks are not reached.
- Recursive `-r typecheck` and `-r lint` fail with `spawn EPERM` before package
  execution. These are not passing full-workspace gates. Read-only diff shows
  no changes to scripts, contract, manifests or lockfile; the same errors are
  documented in the base's existing `lots.md` evidence.
- Chrome screenshot and mounted-keyboard validation remain unverified:
  automatic approval review rejected access with “Computer Use was not approved
  to use Google Chrome.” No alternative browser access was attempted.

App Master must run the full gate in its verification environment and review
the two-layer layout in the browser. The builder leaves the change uncommitted.
