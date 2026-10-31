# WP7 shell specimens

The kit renders paper and stock fixtures. `theme.tsx` owns the fixture Rampart;
`shell-controls.tsx` shows every room title, shared keycaps, both seal variants,
the Breadcrumb and Steward; `scene-controls.tsx` shows the strip with Keep and
one current room, empty Preview/Program, and draft/sealed simulated pictures.
The specimen screen is deferred to keep initial assets within the kit budget.

## Public additions

- `ChamberStrip.current?: ModuleId | 'keep'` identifies the open page independently
  of `selected`. `on_keep?: () => void` adds the leading Keep tile. Room selection,
  opening, pressed state and lamp descriptions retain their existing semantics.
- `PreviewMonitor({ children: ReactNode })` shares Program's frame and empty-state
  treatment with an or lamp and a `draft` stamp. Program stays explicitly simulated.
- `RoomTitle({ chamber, detail?, stamp?, back_label, on_back })` uses the existing
  chamber table; the crumb and Back control delegate navigation to the owner.
  `chamber` is `ModuleId`, `detail`/`back_label` are strings, and `stamp` is ReactNode.
- `Kbd` accepts native kbd props and merges its optional class with `cc-kbd`.
- `entranceStyle(index)` accepts a nonnegative safe integer and returns an
  `EntranceStyle` containing `--cc-entrance-index`. CSS owns the .35s start,
  .14s step, print roller and registration slip. Reduced motion disables animation.

## Fidelity selector map

| Winner | Port |
| --- | --- |
| `#rampart` | `.cc-rampart` |
| `#rampart .mark`, `.meter`, `.meter small`, `.sep`, `.right` | `.cc-brand` / `.cc-wordmark`, `.cc-figure`, `.cc-figure small`, `.cc-separator`, `.cc-spacer` followed by controls |
| `#connStamps`, `#airStamp .stamp`, `.rbtn` | `.cc-link-group`, `.cc-rampart .cc-stamp`, `.cc-rampart .cc-button` |
| `#strip`, `#strip button`, `#strip button::before`, `#strip b`, `#strip span.st`, `.keep` | `.cc-chamber-strip`, `.cc-chamber-tile`, `.cc-chamber-tile::before`, `.cc-chamber-tile-title`, `.cc-chamber-state`, `.cc-keep-tile` |
| `#col`, `.monlab`, `.lamp`, `.mon`, `.mon .empty` | `.cc-monitor-column`, `.cc-monitor-label`, `.cc-monitor-lamp`, `.cc-monitor-picture`, `.cc-monitor-empty` |
| `.draftframe`, `.draftframe .stamp` | `.cc-draft-frame`, `.cc-draft-frame > .cc-stamp` |
| `.reveal`, `.reveal .title`, `.ticket` | `.cc-monitor-reveal`, `.cc-monitor-reveal-title`, `.cc-monitor-ticket` |
| `.colnote`, `.fair`, `.fair b` | `.cc-colnote`, `.cc-fair`, `.cc-fair b` |
| `#seal`, `#seal .fill`, `#seal .lbl`, `#seal .lbl small` | `.cc-seal-button`, `.cc-seal-button progress`, `.cc-seal-button > span`, `.cc-seal-instruction` |
| `#rtitle`, `#rtitle .crumb`, `#rtitle h1`, `#rtitle .fn`, `#back` | `.cc-room-title-card`, `.cc-room-crumb`, `.cc-room-title-card h1`, `.cc-room-function`, `.cc-room-back` |
| `.panel`, `.topline`, `.panel h3`, `.panel h3 em` | `.cc-panel`, `.cc-panel::before`, `.cc-panel-heading h2`, `.cc-panel-gloss` |
| `.p-in` / `.print-in`, `.slip` | `.cc-print-in`, `.cc-slip` |
| `#steward`, `.who`, `.talk`, `#say`, `.chip`, `.chip.tell` | `.cc-steward-bar`, `.cc-steward-identity`, `.cc-steward-controls`, `.cc-steward-message p`, `.cc-steward-bar button`, `.cc-steward-bar button[type="submit"]` |
| Strip, landing and Back `kbd` chrome | `.cc-kbd` |

## Tokens and preserved distinctions

Papers use `rampart-background`, `rampart-paper`, `strip-paper`, `strip-hover`,
`column-paper`, `monitor-paper`, `card`, `draft-wash`, `ticket-paper`,
`reveal-scrim`, `steward-paper`, `panel-paper`, `draft-paper` and `press-paper`.
Inks use `ink`, `ink-2`, `muted`, `gules`, `azure`, `or`, their text roles,
`press`, `press-2`, `rampart-muted`, `rampart-rule`, `rampart-offair`,
`rampart-shadow`, `stamp-paper` and `stamp-act-ground`.

Rampart stamp scopes retain fixed hue families: key becomes light press ink;
gules stays gules; azure stays azure; drafts stay or. Solid gules keeps the
contrast-corrected stamp ground. Stock Rampart remains dark. Seal lettering has
an aria-hidden dark copy clipped to the gold fill, driven by the existing hold
progress, so lettering remains readable across both stock and paper grounds.
Cancellation feedback remains visible in the hint line. Hold timing and event
handlers are unchanged. DraftFrame keeps its existing uppercase word for callers.

Restyled typography uses the TYPE-FLOOR `text-shell-*` roles for brand, meter,
meter-label, stamp, actions, shortcut, strip-word, state, navigation, title,
subtitle, panel-title, panel-title-large, aside, body, monitor-label, empty,
ticket, reveal-title, seal, hint, aside-small, steward-message, input, suggestion
and label. Geometry uses `space-*`, `rule-*`, `title-ghost`, `r-sm`, `nav-stripe`,
`nav-stripe-active`; motion uses `m-print`, `m-slip`, `ease-press` and local
`cc-entrance-start`, `cc-entrance-step`, `cc-stripe-motion` tokens.

## Validation, 2026-10-31

For pnpm commands set `pnpm_config_verify_deps_before_run=false`. Otherwise pnpm
11 attempts an implicit install; this package explicitly forbids installs.

| Command | Result |
| --- | --- |
| `pnpm --filter @castle-control/ui typecheck` | Exit 0; walked 89 files |
| `pnpm --filter @castle-control/ui lint` | Exit 0; walked 89 files; repository checks passed |
| `pnpm --filter @castle-control/ui test` | Exit 0; 29 files, 423 tests passed; unchanged token-only style gate included |
| `pnpm exec eslint packages/ui/kit --max-warnings 0` | Exit 0; no diagnostics |
| `node scripts/check.mjs` | Exit 0; boundaries, hygiene, type-floor, file-cap and secrets passed |
| `pnpm exec vite build kit --outDir dist` (from packages/ui) | Exit 0; 98 modules transformed |
| Initial HTML asset inventory plus `checkTokenDefinitions` | 298/298 tokens; 3 assets, 234199/262144 bytes |
| `pnpm --filter @castle-control/desktop test` | Exit 0; 76 test files and 753 tests passed on the final rerun |
| `pnpm gate` | Exit 1; 35 tooling tests passed, then contract export stopped at `spawnSync cargo EPERM` |

Build output was measured and removed before source-style validation because
the existing CSS test intentionally inventories every stylesheet in the kit.
No dependencies were installed or workspace links changed by this package. Desktop sources,
stamp sources and token sources were not edited. Browser verification remains
unavailable: the browser host failed and native Chrome access was not approved.

## WP4b state badges

The heraldic gallery renders fixed state badges with `Stamp`. Its ink controls
apply to the surrounding print primitives; state meanings keep their shared ink
from the stamp table. Armed and On air use gules, Watching uses azure, and
Sample/Simulated use key. StatusChip remains for generic and unknown statuses;
its stamp, tone, ink and print-style props and the old stylesheet are removed.
The production-source regression test walks the complete WP4b file inventory.

The kit Rampart also uses `Stamp`: known live output is `on-air`, sample or
simulated output is `off-air` with "On air · simulated", and known offline
output is `off-air` with "Offline". Provenance uses the sample/simulated kind.
The old air/sample classes and their rules are removed. Steward identity
typography targets its own name, state and mode classes, leaving nested stamp
ink and size to the shared stamp stylesheet.
