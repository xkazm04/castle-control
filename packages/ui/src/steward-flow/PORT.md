# WP2: The Deck Steward

The action table is declared in `apps/desktop/src/shell/steward-keys.tsx`;
`steward-flows.ts` resolves it into guarded room operations.
Its resolved `ActionKey` entries feed both `ActionRow` and the mounted
`createKeymap` / `dispatchShortcut` scope. Overflow uses measured chip widths,
the available row width, gaps and reserved space for `more`; hidden keys remain
in that shortcut scope. ResizeObserver and font readiness repeat measurement.

The declared row heights are 48 px and 56 px. Chat is positioned above the bar,
outside layout flow. `data-chat-open` deliberately replaces `data-expanded`:
the latter triggers the previous shared CSS that shrinks room headers.
No new tokens are required; the co-located styles use existing theme, space,
type, border and radius tokens. Keep composition was not changed.

Conversation keeps the existing flow runtime and proposal queue. Draft chips
leave a ready flow in its existing chamber Preview and focus the row seal.
Withdraw removes only the pending draft. The row hold uses the existing 1000 ms
SealButton and the same room seal authority. Changing a pending draft remounts
the row control and cancels an unfinished hold. The existing guarded confirm
hold remains available inside the conversation for compatibility with the
room's existing flow journeys. One hold resolves one current draft.

Bubbles have UTC times and simulated/live provenance, a typing interval before
chip/text replies, a closed-panel peek lasting 7000 ms, and an unread count.
Escape consumes a popover, then conversation; the shell's existing Back route
handles the next Escape. The existing room's local modal retains its own Escape.

## Room-private controls bound to flows

| Room | Keys | Existing flow |
| --- | --- | --- |
| Lot Chamber | R, G, H | lots-cast (reveal setup and sound) |
| Lot Chamber | T, A, S, D, F | lots-setup (tools, winners, entry pool, cap, ceremony) |
| Lot Chamber | I | lots-prove (writ information) |
| Gatehouse | D, F, S | gatehouse-votebar (look and Herald count/filter) |
| Beacons | F | visuals-tune (decay) |
| Map Room | T, Y | studio-duel (reseed and rename) |

Gatehouse fixture verdict keys Q/W/E/R and bridge key T only propose through
`proposeCommand`; the existing authority still owns their seal. These keys are
disabled in core mode, where that fixture command door is unavailable. The
core registry also makes its unavailable rules flow disabled. Beacon Q/W/E
reuse the room's existing selector. Duel Enter/Backspace/W/E reuse its existing
stage operations and refuse those operations while a duel draft is showing.
Prototype-only operations without a corresponding product handler or flow
were not invented.

Map Room R opens the mounted full-bracket drawer through `bracketDrawer`.
The stage registers and releases its opener on mount/unmount; no duel event
is sent. Enter and undo reach the same shell table as the action row.

## Verification

All commands use the existing installed dependencies; no install was performed.

- `pnpm --config.verify-deps-before-run=false --filter @castle-control/ui typecheck`,
  `lint`, `test`: 144 source files; 49 test files, 549 tests passed.
- The corresponding desktop commands: 359 source files; 127 test files,
  1157 tests passed. One earlier full run timed out on the existing 900-cast
  corpus; subsequent full runs passed without changing that test.
- The corresponding tokens commands: 12 source files; 4 test files,
  20 tests passed.
- `node scripts/check.mjs`: boundaries, hygiene, type floor, file cap and secrets
  passed. `git diff --check` passed.
- `pnpm --config.verify-deps-before-run=false exec tsc -p e2e/tsconfig.json --noEmit`
  passed. The new assertions cover 1280x720 heights, overlay geometry, overflow,
  keyboard dispatch, Escape order, draft-to-Preview, hold, peek and timestamps.
- Playwright with `CC_E2E_PORT=5176`, config `e2e/playwright.config.ts`, file
  `e2e/ui.spec.ts`, project `chrome-1280x800`, grep `Steward deck|overflow keys`
  stopped at `Error: spawn EPERM`. No browser assertions or fit measurements ran.
- The desktop dev command started Vite on `http://127.0.0.1:5175/`; the normal
  two ports were occupied. Computer use reported the browser host and native
  pipe unavailable. The winner was inspected as source and supplied screenshot;
  opening it from disk and visual comparison in a browser remain unverified.

No files outside WP2's write set, git writes, installs or live actions were used.
The brief does not supply an external result.json destination.

## Director review 1

The Director measured the Gatehouse at 1280x720 outside the builder sandbox:
48 px action row plus 56 px Steward bar, one row each, working overflow and
conversation, and no page errors. The review found the seal escaping the row
because the shared skin applied a 66 px minimum height and grid display.
The row-scoped key style now overrides that skin: 40 px border-box height,
one flex line, no rose pseudo-element, and visible gold progress. Successful
seal feedback lives above the keyed control's remount and shows a wax stamp
for 1100 ms. Failed seals do not show that receipt.

Escape on the talk input peels the store's top layer without refocusing the
input or clearing its value. With no remaining layer it falls through to the
existing editable-field shortcut rule. Unit and e2e regressions cover this;
e2e also checks the seal's bounds within the 48 px row and successful wax.

## WP6 polish

`steward-keys.tsx` owns the room action table and `keyFor(room, action)`.
`RoomKeyBadge` uses that lookup and the chamber `KeyBadge`; rooms name actions,
never letters. Gatehouse's unchanged entries also have action names for its
owner to consume. `steward-flows.ts` resolves the same table for the action row
and shortcut scope. A test changes cast from W to Z in the source table and
checks the row, control badge, old-key refusal and new-key flow dispatch.

Map Room R opens the existing bracket drawer through the stage's registered
opener. Unmount releases it. Enter and Backspace now fall through the stage's
local arrow/cancel handler to the shell table, avoiding a second binding.
The bracket trigger, More and the existing duel operations carry badges.

Lot section padding, roll figures and cast-button spacing are tighter. Type
remains at least 13 px in the shell and 15 px on the ceremony stage. The Lot
journey opens cast/proof content through the actual drawer trigger; the shared
cast helper locates the Cast section, and Steward chips fall back to More flows.
Coverage for setup compliance, seal, cast, demo, winners and writ is retained.
Four viewport tests check fit and clearance below the tools trigger at 1280x720,
1366x768, 1600x900 and 1920x1080.

WP6 verification (installed dependencies only; no git writes, installs or live actions):

- `pnpm --config.verify-deps-before-run=false --filter @castle-control/ui typecheck`,
  `lint`, `test`: typecheck and lint exit 0; 51 files / 561 tests pass.
- The matching desktop typecheck and lint commands exit 0. The full test command
  reports 130 files passed, 1 failed; 1179 tests passed, 1 failed. The failure is the untouched `navigation.test.tsx` Gatehouse
  case, `Missing rendered control` in `moderator/component-probe.tsx:56`.
  Repeating that navigation suite with all WP6 tracked files temporarily replaced
  by their HEAD bytes reproduces the same failure (15 pass / 1 fail); all WP6
  file bytes were restored afterward. No excluded file was edited.
- Focused desktop command `pnpm --config.verify-deps-before-run=false --filter
  @castle-control/desktop exec vitest run src/shell/steward-keys.test.tsx
  src/rooms/studio/duel-chamber.test.tsx src/rooms/lottery/chamber.test.tsx
  src/rooms/lottery/stage.test.tsx src/rooms/lottery/sound.test.ts
  src/rooms/visuals/deck.test.tsx --pool=threads`: 6 files / 43 tests passed.
- `node scripts/check.mjs`: boundaries, hygiene, type floor and secrets pass;
  only the known `shell/room.test.tsx: 410 lines exceeds 400` fails.
- `pnpm --config.verify-deps-before-run=false exec tsc -p e2e/tsconfig.json --noEmit`:
  exit 0. `git diff --check`: exit 0.
- `pnpm --config.verify-deps-before-run=false --filter @castle-control/desktop dev`:
  Vite ready at `http://127.0.0.1:5174/` (5173 already occupied).
- With `CC_E2E_PORT=5177`, `pnpm --config.verify-deps-before-run=false exec playwright
  test -c e2e/playwright.config.ts e2e/journey-lots.spec.ts --project=chrome-1280x800
  --grep-invert CORE` stops with `Error: spawn EPERM`. No e2e assertions ran.
  Computer use also reports native pipe and browser host unavailable. Opening the
  winner from disk, visual comparison, fit measurements and the migrated browser
  journeys remain unverified. The winner was reviewed as source.

The brief provides no external result.json destination.

## Director review 1: Lot fit correction

Read the integrated `lot-1280.png` supplied by the Director. The cause of the
split sound label was the legacy 80/88 px toggle widths in `lottery/stage.css`;
the last-child selector beat the chamber's width override. Those widths are
removed. The chamber now gives the two toggles equal grid tiles with unbroken
labels, followed by fixed-size information and fullscreen controls. Theatre
keeps its full-width control row and 15 px toggle labels.

The fixture's setup, cast and demo buttons share one row with the chamber text
face and normal tracking. The roll legend is one unbroken row. The proof card
has one short summary; the full proof/illustration explanation is retained in
the reachable drawer. Core audience provenance remains visible in Program.
Pending proposal review keeps its own button outside the three primary actions.
No text size was reduced below the floor.

The four viewport regressions now wait for fonts, require exact equality of
`.shell-room-content.scrollHeight` and `clientHeight`, and check label wrapping,
control overflow, shared row positions, all three cast buttons and clearance
under the drawer trigger. Unit coverage checks that shortening the summary
retains the full proof explanation and simulated label in the opened drawer.

Verification:

- `pnpm --config.verify-deps-before-run=false --filter @castle-control/desktop
  exec vitest run src/rooms/lottery --pool=threads`: 15 files / 122 tests passed.
- Full desktop `test`: 130 files / 1180 tests passed; the same pre-existing
  Gatehouse navigation case fails at `moderator/component-probe.tsx:56` with
  `Missing rendered control`. The original write-set exclusions remain intact.
- Desktop typecheck and lint, plus `pnpm --config.verify-deps-before-run=false
  exec tsc -p e2e/tsconfig.json --noEmit`: exit 0.
- `node scripts/check.mjs`: only the existing local
  `shell/room.test.tsx: 410 lines exceeds 400` failure; the Director reports its
  fix on the Gatehouse branch. No excluded file was edited.
- `CC_E2E_PORT=5177` with the existing Playwright config, `journey-lots.spec.ts`,
  project `chrome-1280x800`, grep `controls fit`: `Error: spawn EPERM`.
  A direct Playwright measurement against the running local Vite server also
  fails at `browserType.launch: spawn EPERM`, before either viewport is opened.
  Computer use reports native pipe/browser host unavailable. Therefore no new
  1280x720 or 1366x768 pixel dimensions are claimed; Director remeasurement is
  still required. Vite started on local port 5174.
