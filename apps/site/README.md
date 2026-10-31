# Castle Control landing: Cutaway Keep (WP5a)

A typed, framework-free Vite workspace member using the shared drawing, tokens
and stamp table. From the repository root:

```powershell
pnpm --filter @castle-control/site dev
pnpm --filter @castle-control/site typecheck
pnpm --filter @castle-control/site lint
pnpm --filter @castle-control/site test
pnpm --filter @castle-control/site build
node apps/site/check.mjs
pnpm exec playwright test -c e2e/site.config.ts
```

`build` produces a self-contained `dist/` with relative assets and checks its
180 KiB uncompressed first-load budget, offline posture and honesty labels.
`pnpm gate` builds/checks the site after recursive tests. The checker also accepts
an optional dist directory: `node apps/site/check.mjs <dist-directory>`.
Vite preserves workspace links, avoiding the Windows network-drive probe.

The page uses system fonts and local assets, with no app bridge, analytics,
storage or live-audience connection. Outbound links point to this repository;
the app CTAs open releases. The single poster footer matches the winner, while
project notices, release/signing status, Extension availability, Docs and Source
are visible at `#steward`. The stock-theme control lives in the topbar.
WP5b fills the remaining broadside content and toys.

O2 replaces the stacked mobile layout with the winner's 1440×900 stage, scaled
at every width. O3 replaces the no-build static folder with a workspace package.
The existing hashes and `/features` suffix remain. Intro handover is 2700 ms;
Skip/native activation, origin focus, hover, keys and reduced motion are tested.

## Checks (2026-10-31 review correction)

- Package typecheck and lint: pass; 22 TypeScript files counted.
- Package test: 7 files, 42 tests passed, including footer composition, separate
  1/4 keycaps, topbar controls and visible Steward notices.
- Package build: 37 modules; 72,690 / 184,320 bytes (70.99 KiB); built check passes.
- `node scripts/check.mjs`: boundaries, hygiene, type floor, cap and secrets pass.
- `node scripts/prove-gates.mjs`: 56 expected failures verified. New proof:
  `Site check: built JS exceeds byte budget: exit 1; [site built] walked 2 files;
  Error: Site first-load bytes 184717 exceed 180 KiB budget (184320 bytes)`.
- Native browser lane: `spawn EPERM` in this builder environment; the added spec
  checks the footer's single-row bounds and the reachable study notices.
