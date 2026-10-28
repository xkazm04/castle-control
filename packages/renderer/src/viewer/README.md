# WP 4.1 viewer logic, owner ruling item 5

This is renderer-local logic, with no new wire identifiers or dependencies.
It does not create an Extension shell, authenticate viewers, host a service,
submit an Extension or grant privileges. The host owns those boundaries.

## Reconciliation before implementation

- `e37bfeb61719c71e4626fe61961f8de3619ad01b` already provides the draw data
  template, four draw shapes and cast-only playback. `draw/template.test.ts`
  and `draw/scenes.test.ts` prove template counts, immutable ordered winners,
  disclaimers and reduced motion. They are retained without modification.
- `b7f4e6e33a6157d3f9473a00192eac1eb877e5d9` already provides war-table,
  choice-board, viewer-card and contribution-meter data and scene builders,
  strict local-image validation, and static-safety tests. These remain intact.
- Config-segment reading, host allowlisting, local control reducers and their
  shared money guard were absent at base `edd0a59` and are added here.

## API and enforcement

`readConfigSegment(segment, schema_parser)` uses the existing public contract
JSON door, limiting input to 5,120 UTF-8 bytes before decoding. Pass an existing
template parser such as `parseChoiceBoard`; the result is `{ ok: true, data }`
or `{ ok: false }`, including on schema/parser exceptions. The caller retains
its last valid scene after a failed read. This helper neither invents a design
envelope nor accepts decoded data without the supplied schema check.

`allowedImageUrl(value, allowed_host)` returns an absolute HTTPS URL only on
the exact host; relative URLs, credentials, alternate ports, subdomains,
lookalike suffixes and invalid host settings are refused. `allowed_host` comes
from the reviewed shell, never streamer-authored data. The shell's CSP must
enforce that host during actual image loads, including redirects. Existing
template `image_path` checks continue to require local relative asset paths;
the shell maps those paths to its reviewed image host.

`allowsViewerContent` reuses `parseViewerCard`: Twitch identity, streamer
approval and a displayed username are required. This checks data only. The
host authenticates identity/approval, displays the username as literal text,
and removes content when approval is revoked.

`createViewerControls` validates and freezes choices. `reduceViewerControls`
only selects a vote option, tile or side, or resets local selections. It does
not count votes, mint entries/tickets, select winners or mutate game outcomes.
Every action passes the closed `parseFreeAction` schema; unknown fields are
refused even if zero or undefined. `isFreeViewerAction` exposes this same
guard. The authenticated host owns moderation, cadence and authoritative
submissions. No reducer accepts Bits or another contribution/payment input.

## Acceptance evidence

- `config.test.ts`: exactly 5,120 bytes accepted and 5,121 refused with ASCII
  and multibyte labels; malformed JSON, schema errors and callback exceptions
  cannot escape; oversized input never invokes the schema parser.
- `policy.test.ts`: exact-host image allowlisting, off-list/unsafe URL refusal,
  required identity, approval and displayed name.
- `controls.test.ts`: deterministic immutable selections/reset, invalid actions,
  configuration validation and a compile-time exhaustive action table proving
  Bits/payment fields are refused for every action, including reset.
- Existing static-safety and overlay provenance tests remain unchanged.

Validation uses the existing installation; no install runs over the shared
node_modules junction. Run `pnpm --config.verify-deps-before-run=false --filter
@castle-control/renderer typecheck`, then the corresponding `lint` and `test`.
The external result file records the final outcomes. Full workspace/Cargo,
browser and live integration checks are outside this renderer-only delivery.

Final validation, 2026-10-28: renderer typecheck and lint passed (39 TS files;
lint also checked 607 source files and scanned 757 files for secrets). Renderer
tests passed 91 cases in 17 files; the final narrowed viewer/draw/template/static
and overlay run passed 49 cases in 11 files. `git diff --check` passed. Overlay
entry, implementation, bindings, build configuration and served bundle are
unchanged from HEAD; the existing bundle remains 54,683 bytes with no growth.
