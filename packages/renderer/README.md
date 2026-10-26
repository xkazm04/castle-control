# Renderer core

`@castle-control/renderer` is a private TypeScript package with no runtime
dependencies for the future OBS overlay and Extension hosts. Its only workspace
dev dependency is the contract, imported with `import type` for cast and tier
types. It performs no network requests, script evaluation, DOM creation,
or clock/timer reads. The host supplies playback time explicitly.

Design bindings use local structural types that mirror the merged `cc-types`
`design.rs` contract, without importing `@castle-control/contract`. Hosts must
parse incoming design data at their contract boundary. There is no overlay
server, Extension host, asset loader or package interpreter here yet.

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

`evaluateBinding(binding, intensity)` linearly maps the clamped intensity 0..1
between `output_range.at_zero` and `output_range.at_one`. The `property` tag is
`opacity`, `scale`, `x` or `y`; descending and constant ranges work. Nonfinite
inputs and endpoints throw. Opacity endpoints must be in 0..1 and scale
endpoints must be nonnegative. Interpolation preserves these domains, including
extreme finite coordinates without intermediate overflow.

`applyLayerBindings(baseProperties, bindings, intensity)` returns a fresh
`LayerProperties`, retaining unbound properties and dimensions. Bindings apply
in array order, so the last binding to a repeated property wins. No input is
mutated, and nonfinite intensity throws even for an empty binding list.

`bindLayerBindings(root, baseProperties, bindings)` snapshots the configuration
and returns an update function with the same boolean/cache behavior as
`bindIntensity`. It writes six numeric custom properties: `--x`, `--y`,
`--width`, `--height`, `--scale`, `--opacity`. Host CSS supplies units for logical
pixels (for example `calc(var(--x) * 1px)`). Keep those properties under this
binder's ownership. Recreate the binder for a configuration change. No DOM
creation or markup replacement occurs, identical clamped intensity writes
nothing, and failed writes do not advance the cache.

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

## Draw scenes (WP 2.3, part 2)

`urnDraw`, `wheelDraw`, `deckDraw` and `ballotBoxDraw` accept only the winners
and label from a verified `LotsVerifiedCast` (or `CastResult.cast`) as their
outcome input, plus presentation options. `buildDrawScene(shape, cast, options)`
is the generic equivalent. Parsing and proof verification remain the host's
responsibility. Neither the full roll nor randomness is accepted here.

```ts
import type { CastResult } from '@castle-control/contract';
import { urnDraw, createDrawPlayback } from '@castle-control/renderer';

function prepareDraw(result: CastResult, reduced_motion: boolean) {
  const scene = urnDraw(result.cast, {
    content: 'prize', disclaimer: true, reduced_motion,
  });
  return { scene, playback: createDrawPlayback(scene) };
}
```

The returned scene is immutable data: original vector paths on a 320x240 logical
view box, semantic ink tokens, fixed artwork motion, persistent text layers,
and ordered winner reveal events. The host draws paths using the shared palette,
applies motion to the artwork only, and renders the text layers as foreground
text throughout playback. It feeds relative milliseconds to
`playback.advanceTo(time_ms)` and displays `revealed_winners` in array order.
`next_at_ms` supports event-driven updates; no caption queue limit can discard
winners. Independent cursors can seek backward and replay the same scene.

Ordinary motion is a 1200 ms flourish (urn tilt, decorative wheel rotation,
deck flip or ballot-box descent), using `cubic-bezier(.2,.8,.2,1)`. Winners then
appear in their supplied order every 900 ms. Motion never determines a winner
or a wheel landing segment. With `reduced_motion: true`, motion is absent and
all winners appear together at time zero, with no timer or transition needed.

Every scene carries the exact cast label, `drand-quicknet` or
`streamer-controlled`. Setting `disclaimer: true` adds a persistent footer layer
with `Twitch does not sponsor this promotion` and the same cast label. A prize
scene with a missing or false disclaimer throws before construction. The
canonical text cannot be replaced by a caller. The host must preserve these
layers; this scene description alone does not connect to OBS or approve a prize
draw's official rules, which remain enforced by the draw policy.

`OVERLORD_URN_TEMPLATE` is frozen data, not a renderer branch: id `overlord-urn`,
shape `urn`, and counts `{ s: 3, m: 7, l: 15, xl: 15 }`. The plan specifies three
counts across four tiers without a mapping; this delivery chooses Hearth 3,
Hall 7, Courtyard 15 and Tourney field 15. The choice is also recorded in
`src/draw/template.ts` and the delivery questions. Counts configure a draw before
sealing; they must never resize or alter a cast. All new artwork and template
data are original to this delivery; no Shadowrunr files were copied.

The type-only workspace dependency is declared in this package's manifest.
Its TypeScript paths mapping resolves the contract's public source entry in this
worktree without installing or modifying the `node_modules` junction. App Master
must synchronize the renderer importer in the root lockfile during integration;
that file is outside this delivery's allowed paths. There is no new external npm
package, runtime import, schema or wire identifier.

### Draw validation, 2026-10-26

- Red first: the narrowed `src/draw` Vitest run failed both new suites because
  the scene and template modules did not exist.
- The 20 new tests pass: each of four shapes is checked against 1000 generated
  simulated casts in both motion modes (8000 scenes), including prefix order,
  full reveal and backward replay. Other cases prove prize disclaimer refusal,
  persistent disclaimer/label layers, static reduced motion, distinct vector
  artwork, immutable snapshots, independent cursors and the four-tier template.
- Final package regression: `pnpm --config.verify-deps-before-run=false --filter
  @castle-control/renderer exec vitest run --pool=threads --cache=false` passed
  all 60 tests in seven files. Caching was disabled to avoid writes through the
  worktree's shared dependency junction.
- Renderer typecheck passed with 19 TypeScript files. Renderer lint passed,
  including repository boundaries/hygiene/file-cap (327 files) and secrets
  (428 files).
- The repository `pnpm --config.verify-deps-before-run=false gate` passed all
  14 tooling tests and workspace discovery, then failed at the unchanged
  contract exporter with `spawnSync cargo EPERM`. Recursive typecheck and lint
  also failed with `spawn EPERM`. `git diff -- scripts packages/contract` is
  empty, and HEAD's `docs/PLAN.md` already documents these same sandbox failures.
  Rust checks and later full-gate stages were not reached; no full gate pass is
  claimed. No install or live service was run.

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

### WP 3.2 binding validation, 2026-10-26

- Red first: `pnpm --config.verify-deps-before-run=false --filter
  @castle-control/renderer exec vitest run src/bindings.test.ts --pool=threads`
  failed all 18 new cases before the binding exports were implemented.
- Package `typecheck` and `lint` with the same pnpm flag/filter passed (12
  TypeScript files); lint also passed boundaries, hygiene, file cap (309 source
  files) and the existing secrets gate (408 files).
- Package `test` passed all 40 tests across five files. New cases cover all four
  properties, endpoints, descending/constant ranges, clamping, opacity/scale
  bounds, finite extremes, immutable application, nonfinite rejection, zero
  writes for unchanged effective intensity, snapshots, independent roots and
  retry after a failed CSS write.
- `pnpm --config.verify-deps-before-run=false gate` passed 14 tooling tests and
  workspace discovery, then failed at the unchanged contract exporter with
  `spawnSync cargo EPERM`. Recursive `-r typecheck` and `-r lint` also failed
  with `spawn EPERM`. These are the existing sandbox failures documented above
  and in HEAD's `docs/PLAN.md`; full-workspace success is not claimed.
- Gitleaks 8.30.1: `gitleaks git . --redact --no-banner --log-level debug`
  scanned 44 commits, explicitly skipped both requested historical simulated
  beacon fixture fingerprints from the root `.gitleaksignore`, and reported
  no remaining leaks (exit 0). That file has exactly the two narrow ignores;
  the repository's own secrets gate is unchanged.
