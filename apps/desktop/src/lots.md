# WP 2.3 part 1: offline Lot Chamber

The Lot Chamber is lazy-loaded only for the lottery route when the desktop
snapshot mode is `fixture`. Core mode retains its empty state. The page owns
no RPC registration, socket, Twitch/OBS adapter, drand request or renderer import.
No install, lockfile, contract, crate or Tauri change is included.

## Page and local behavior

The hero presents 87 generated eligible entries, numbered tickets, cohort dots,
an intake state and five generated cooldown exclusions. Pause/resume and seal
change only this page's store. Sealing freezes the setup, and starting requires
a seal plus an unblocked policy. Starting changes a simulated status only; it
does not manufacture a live cast, cryptographic seal or public round.

Panels 1.1 through 1.5 provide the three saved configuration examples, a handle
lookup, editable setup, the four fairness steps and static draw-shape choices.
Urn, wheel, deck and ballot box are labels and glyphs, with no animation.
Setup edits do not reconstruct the illustrative entry pool; this limitation is
visible beside the controls. Selecting a saved example resets its local setup.
All new product copy is in `lots-copy.ts`, without em dashes.

`lots-model.ts` mirrors `cc-lots::check_draw` using the `LotsDrawPolicy` and
`DrawCheckResult` types from the public contract root. The contract projects
reason codes as strings, not an exported reason enum. The mirror uses the
existing snake_case PolicyReason names, with display reasons in the copy file:

| Prize configuration | Fixture result |
| --- | --- |
| Paid entry or paid weight | Blocked, without an override |
| Total above 500,000 USD cents without registration | Blocked |
| Subscriber-only or points without an equal-odds free path | Warning |
| Missing age or eligible regions | Warning |
| Missing rules template or Twitch disclaimer acknowledgement | Blocked |
| Content without a prize | OK |

Both the disabled controls and the local model enforce the prize preconditions.
The rules checkbox attaches a built-in simulated rules example, displayed on
the page; it does not claim a legally reviewed or live attachment. Warn states
remain visible and allow an explicit seal. No Rust policy is added or changed.

All contract imports are types only. Hand-authored fixture objects use those
types directly, with readable fixture DrawId slugs minted in one file. There
is no external JSON input, duplicate schema parser, private generated import,
runtime lots method handle or `parseMethodParams` call.

## Writ and performance

The writ opens as a nested page with breadcrumb and Back, preserving the local
setup. Focus returns to the page container on either transition. It displays a
separate, fixed simulated commit-and-reveal vector from the merged offline
verifier corpus. Its source, seal, entries, weights, timestamp, margin, revealed
seed, commitment and winners are visible. The distinction from the editable
roll is explicit. The recompute action recomputes SHA-256 v1 seal bytes, the
seed commitment and weighted rejection-sampling winners in Web Crypto, solely
from this built-in fixture. It accepts no imports and emits no verified wire
cast. Failure produces a visible error, not a success or unverified animation.

The dot field groups 20 entries per shared WindowedRows row and memoizes that
grouping. At 10,000 entries, 500 logical rows produce at most 16 DOM rows and
320 dot cells, including at the final scroll window. The whole page remains
under 800 element nodes in the test. The scroll viewport is keyboard focusable;
inputs, selects and actions are native labelled controls. The existing central
shortcut registry is unchanged. The navigation test's old lottery empty-state
expectation is updated to the new page heading.

Co-located CSS uses the shared paper/stock tokens, display typography, gules,
rules, numbered panels and shared components. The prototype is design reference
only; its JavaScript is not copied. Screenshot fidelity at 1440x900/1280x800,
mounted-browser keyboard behavior and paper/stock screenshots remain unverified:
automatic approval review rejected Chrome access with "Computer Use was not
approved to use Google Chrome." No alternative UI automation was attempted.

## Verification, 2026-10-26

- `pnpm --config.verify-deps-before-run=false --filter @castle-control/desktop
  exec tsc --project tsconfig.json --noEmit`: exit 0.
- The corresponding `exec eslint src --max-warnings 0`: exit 0.
- Narrowed `exec vitest run src/lots.test.tsx src/navigation.test.tsx
  src/beacons.test.tsx src/events-view.test.tsx --pool=threads`: **27 tests pass
  across four files**, including 12 new Lot Chamber cases. Coverage includes
  hero state, real lookup/checkbox/action handlers, both acknowledgement orders,
  blocked paid weight, all policy table rows, first/end 10,000-lot windows,
  nested proof recomputation and failure, shapes, key 1 and fixture/core isolation.
- `pnpm --config.verify-deps-before-run=false --filter @castle-control/desktop
  build`: exit 0. The unchanged first-load checker reports **382,502 / 393,216
  uncompressed JS+CSS bytes** over two eager assets. Lot Chamber JS/CSS is deferred.
- `node scripts/check.mjs`: boundaries, hygiene, file-cap and secrets pass.
- Recursive `pnpm --config.verify-deps-before-run=false -r typecheck` and `-r
  lint` each exit 1 on **spawn EPERM**, before package checks run. They are not
  passing workspace gates despite the successful direct desktop checks.
- `pnpm --config.verify-deps-before-run=false gate` passes all 14 tooling tests
  and workspace inventories, then exits 1 in the unchanged contract exporter:
  **spawnSync cargo EPERM**. Rust checks and the recursive suites are not reached.
  The same errors are documented in the merged Beacons evidence on the base.
  Read-only diff confirms tooling, contract, manifests and lockfile are unchanged.
- The keyboard integration check first failed on its stale "No lots in the urn
  yet" expectation, then passed after its single expected-string update.

The App Master must run the full merge gate in its verification environment;
the Director must review screenshots before claiming the full fidelity exit.
Live draw delivery, disclaimer overlay, renderer animation and the test-channel
draw remain outside this explicitly offline part of WP 2.3.
