# Renderer core

`@castle-control/renderer` is a private, dependency-free TypeScript package for
the future OBS overlay and Extension hosts. It has no runtime or workspace
dependencies. It performs no network requests, script evaluation, DOM creation,
or clock/timer reads. The host supplies playback time explicitly.

This delivery intentionally defines **no design-package or layer types**. Those
are contract identifiers and must land in `cc-types`, with generated validators
in `packages/contract`, in a separate delivery before renderer integration.
There is no overlay server, Extension host, or package interpreter here yet.

## Provenance and adaptation

Pure portions were read from Shadowrunr OS commit `7e4b6f8`, under Apache-2.0:

| Source in `packages/stage-kit/src/` | Kept here |
| --- | --- |
| `timing.ts` | Word onsets, punctuation pauses, reveal count, caption opacity |
| `sceneModel.ts` | Caption slots, queue bounds, initial reducer state |
| `scene.ts` | Bounded caption scheduling, lookup, immutable reduction and fold |
| `playback.ts` | Incremental cursor, backward rebuild, next wake time, canvas fit |
| `visuals.test.ts`, `scene.test.ts` | Corresponding pure tests with simulated text |

Every adapted file carries its own source/commit header. The repository NOTICE
already credits Shadowrunr OS. Show scenes, boards, lore, ballots, art, vocabulary,
and its contract dependencies were excluded.

Local timing fields use snake_case with `_ms`. They are relative playback
offsets, not transport timestamps. Missing captions and next wake times are
`undefined`; absent state fields are omitted. These local types are not wire
schemas. Hosts must parse incoming transport data at their schema boundary.

## Host API

`Timeline(events, initial, reducer, timeOf)` accepts a pure reducer, a fresh-state
factory, and an onset accessor. Supply immutable event values in nondecreasing
order with finite millisecond offsets; equal-time events keep input order. The
array and onset values are snapshotted at construction. `advanceTo(time_ms)`
applies only newly reached events, or rebuilds after a backward seek. Infinities
can seek before the first or after the last event; NaN is rejected.
`next_at_ms` lets hosts schedule the next wake without a per-frame rebuild.

The caption reducer (`initialScene`, `reduce`, `foldEvents`) consumes local
`Caption` values. `enqueueCaption` preserves the showing caption and at most
three waiting slots. Each waiter starts after the previous reveal plus a
two-second hold. `captionAt` returns the latest started slot; hosts apply
`captionOpacity` to fade it after its hold. Direct queue/fold calls require
chronologically ordered input, as in the pinned source.

`bindIntensity(root, properties?)` returns an update function. It writes plain
numbers to CSS custom properties (default `--intensity`) with `style.setProperty`.
Finite inputs are clamped to 0..1; nonfinite inputs throw before writing.
The first update writes even at zero. Repeating the effective intensity returns
`false` and performs **zero DOM writes**. A changed intensity returns `true` after
writing the selected properties; markup and child elements are never touched.
Create one binder per root/property set and keep those properties under its
ownership. Separate binders retain independent state. Property names are
validated and snapshotted when binding.

## Verification

The package uses the shared `scripts/package-gate.mjs` runner for typecheck,
lint and Vitest. The CSSOM write test uses a simulated root with spies, needing
no DOM dependency. It checks both repeated-update write counts and that markup
and children are untouched. Ported tests cover timing, queue bounds, folds,
forward/backward playback and canvas fitting.

The Director must run the workspace install after merge to register this new
member in `pnpm-lock.yaml`. This delivery does not install or change the lockfile.
The package sets `types: []` because it uses no ambient Node globals; imported
test/tool declarations still resolve from the existing root install. This avoids
requiring a package-local Node types link before the Director installs it.

Validation in the builder worktree, 2026-10-26:

| Check | Evidence |
| --- | --- |
| Package typecheck | `node ../../scripts/package-gate.mjs typecheck`: pass, 10 files |
| Package lint | `node ../../scripts/package-gate.mjs lint`: pass, including boundaries, hygiene, file cap and secrets |
| Package tests | `node ../../scripts/package-gate.mjs test`: 4 files, 22 passing tests |
| Unchanged-intensity proof | Without the cache, the repeated-update assertion failed (`true` instead of `false`); with it, all four binder tests pass |
| Workspace discovery | `node scripts/workspaces.mjs`: pass, 6 manifests and 80 TypeScript files |
| Full gate | `pnpm --config.verify-deps-before-run=false gate`: 14 tooling tests and workspace discovery pass, then the contract exporter fails with `spawnSync cargo EPERM` |
| Recursive typecheck/lint | Both stop with `spawn EPERM` before package checks can complete |

The exporter and gate scripts are unchanged from HEAD. HEAD's `docs/PLAN.md`
already records these same exporter and recursive-process failures. Full gate
success remains for the Director to establish; it is not claimed here. NOTICE
and `pnpm-lock.yaml` are unchanged, and all source changes are confined to this
package.
