# WP2: The Deck Steward

The action row is declared in `apps/desktop/src/shell/steward-flows.ts`.
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

Director review 1 assigns Map Room R (full bracket) to the Map Room package.
It stays unbound in WP2; the existing room control is retained.

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
