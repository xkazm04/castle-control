# Shared Keep drawing — WP3a and WP3b

Framework-free SVG data extracted from `.port/winner/keep-art.js`, following
`.port/DESIGN.md` D1/D6/D10. No workspace runtime dependencies. This delivery
contains the shell and all six room interiors. `keepArt()` includes them by
default; `keepArt(roomNodes)` replaces the interiors and `keepArt([])` draws
only the shell. `keepRoomsArt()` returns the room plates in winner order:
Herald, Gatehouse, Lots, Studio (Map Room), Beacons, Steward.

The root entry exports data, paint serialization, geometry and shell builders.
Only the `/dom` entry accesses DOM APIs. It constructs an SVG off-tree with
namespace-aware element creation, then appends it once. A fake document tests
the element count, IDs, attributes, text and identical `paintStyle` output.
Consumers import the stylesheet through `@castle-control/keep-art/keep-art.css`;
CSS remains marked as a side effect. The root entry has no DOM access.
Relative source imports and re-exports use `.js` specifiers, matching the
repo's NodeNext configuration. The package exports map still targets the
TypeScript sources; consumers need no TypeScript-extension import override.

`Rect` uses `{ x, y, w, h }` and `Point` uses `{ x, y }`, all in castle/stage
coordinates. `keepViewBox` is the SVG tuple. Site camera constants start with
`site`; desktop camera constants start with `app`. App room cameras use
`appFrame ?? frame` and `cover`, which deliberately follows the winner's
width-only scale rule and 2.3 cap. Product IDs replace prototype room IDs.

Shell builders preserve the original order, including the separate shadow
gules group and empty or group. Overlay styling belongs to the consumer.
Paints are typed D10 roles; this shell uses `art-key`, `art-gules`, `art-azure`,
`art-or`, `art-stone`, `art-azure-text`, `art-room-1`, `art-room-2`, `art-room-3`,
`art-floor`, `art-wood`, `art-void`, `art-sun-1`, `art-sun-2`, `art-hatch`.
Room interiors additionally use `art-paper`, `art-gules-text`, `art-sheet`
and `art-table`. All paints belong to D10; no extra roles are introduced.

## Public room data and hooks

`artHooks` exports the exact SVG hook spellings below. `hexSeed` and
`hexPaints` provide the 45 colour indices and their role palette, in order:
`art-paper`, `art-azure`, `art-or`, `art-gules`. `lotHandles` contains the
winner's 12 invented sample handles. `heraldSample` contains its four sample
consensus pairs; the rounded percentages deliberately total 101.

| Hook | Contract |
| --- | --- |
| `lotWheel` | One rotating `g` ID; `style="transform-box:view-box"` |
| `data-tk` | 12 ticket rectangles, indices 0–11, inside the wheel |
| `altarFlame` | One `g` with this ID and class |
| `hexes` | One `g` with this ID and class |
| `hex`, `data-i`, `data-c` | 45 polygons; indices 0–44 and seed colour 0–3 |
| `flame`, `f2` | Four flame paths; two also carry `f2` |
| `ember` | Seven circles; original per-ember delay and `--dx` styles |
| `chatroll` | One group inside `clip-path="url(#rollClip)"` |

## Deliberate art-text changes

All remaining text uses `art-key`, the winner's family, weight and spacing,
and the original anchor point. HELD lettering changes from gules to key ink;
its border stays gules. The surrounding UI supplies the dropped SAMPLE label.

| Lettering | Winner size → port |
| --- | --- |
| Herald percentages (four) | 12 → 16 |
| THE HERALD · SAMPLE | 11 → 16 |
| Gate roll chat (24 lines) | 7 → ruled marks at the same y, width = sample length × 3 |
| Gate roll heading | 7.5 → dropped; cannot fit at 16 |
| HELD | 11 → 16 |
| Wheel ticket numbers (12) | 8.5 → removed; ticket rectangles remain |
| THE WRIT | 7 → dropped; cannot fit at 16 |
| SAND TABLE · 9 × 5 HEX | 9 → 16 |
| DRAFT | 11 → 16 |
| THE STEWARD’S STUDY | 10 → 16 |

Held roll marks retain `art-gules-text` and their original gules ticks.
The complete tree has **415 nodes**, including **266 room nodes** and nine
text nodes. Tests pin the count, hooks, deterministic independent trees,
16-unit text floor, source colour-literal ban and all definition references.

## Motion

The stylesheet keeps the winner's registration offsets. All motion durations,
delays and the stamp easing now reference the generated WP2 tokens without
fallbacks. The plate offsets `--rx` and `--ry` are local CSS properties;
per-ember `--dx` keeps its original `10px` fallback. The CSS test reads
`packages/tokens/src/generated.css` directly, without a package dependency,
and checks every variable reference against generated tokens or local art
inputs. Only `--dx` may carry a fallback.

Reduced motion disables plate and ambient animations and hides embers without
applying a global motion override to the host application.

Initial WP3b verification on 2026-10-31:

- WP3b uses the brief's equivalent direct commands from the repo root, because
  the member is not installed. No install or package-wrapper run is attempted:
  `npx --no-install tsc -p packages/keep-art/tsconfig.json --noEmit --typeRoots node_modules/.pnpm/@types+node@24.10.0/node_modules/@types`,
  `npx --no-install eslint packages/keep-art/src --max-warnings 0`, and
  `npx --no-install vitest run --root packages/keep-art --pool=threads`.
  All three pass; Vitest passes 29 tests across five files. Without the explicit
  existing `--typeRoots` path, the uninstalled member cannot resolve Node types.
- Root `node scripts/check.mjs` passes boundaries, hygiene, type-floor,
  file-cap and secrets. Every package file stays below 400 lines.
- A one-time Node VM comparison against the winner confirmed all 266 room
  nodes after the declared text changes: tags, IDs, attributes, paths and
  plate order match byte for byte; all colour literals map to the D10 roles.
  Room counts: Herald 16, Gatehouse 54, Lots 81, Studio 64, Beacons 31,
  Steward 20. WP3a separately verified the shell geometry.

Director motion follow-up on 2026-10-31, after WP2 and package installation:

- `pnpm --filter @castle-control/keep-art typecheck`: exit 0;
  `[pnpm typecheck] walked 23 files`.
- `pnpm --filter @castle-control/keep-art lint`: exit 0;
  `[pnpm lint] walked 23 files`; repository checks also pass.
- `pnpm --filter @castle-control/keep-art test`: exit 0;
  `Tests 30 passed (30)`, `Test Files 6 passed (6)`.

Director import follow-up on 2026-10-31:

- Converted 61 relative import/export specifiers across 19 source files to
  `.js` and removed `allowImportingTsExtensions`. The exports map still
  points at the `.ts` entry files.
- The same three filtered pnpm commands pass: typecheck and lint each report
  `walked 23 files`; tests report `Tests 30 passed (30)` and
  `Test Files 6 passed (6)`. Repository checks also pass through lint.
- Initial runs stopped before the checks because pnpm attempted a reinstall
  after the workspace structure changed. Successful runs used process-local
  `pnpm_config_verify_deps_before_run=warn`, preserving the warning while
  running installed tools without dependency changes.

Follow-up changes are uncommitted and confined to this package. No live data is used.
