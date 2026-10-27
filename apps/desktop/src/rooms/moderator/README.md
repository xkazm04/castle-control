# Core Gatehouse connection (WP 1.7 desktop half)

Core launches enter the lazy moderator route and use `createCoreGatehousePort`.
`client.ts` keeps the launch capability, injected transport and cached port in a
per-client WeakMap, outside read snapshots. Fixture launches retain the existing
preview and proposal flow; the Steward slot is unchanged.

The port validates requests and replies through generated method contracts from
`@castle-control/contract/gatehouse`. That independently compiled subpath keeps
these validators out of the first-load bundle without changing the wire schema.
It sends only the ten existing methods named in the brief. Errors expose validated
codes and retry timing, never upstream prose, and mutations are not retried.

The connected view reads rules and consensus from core. Watching pattern rules
can be edited; arming, rail changes and live action grants are not offered.
Consensus filters fetch their actual core window and series. There is no preview
history or fixture fallback. Rules and drill change lists are windowed.

The drill imports a source-labelled recording JSON document (source, messages,
gaps), or uses a recording name already held by core. Bank, judge and prompts
are explicit inputs. A saved baseline remains with the connection while the
streamer returns to edit watching rules. Run and comparison results display
simulated labels, provenance, gaps, outcome states and each instrument hash.

The current read contract has no pending-ban or chat-list lookup. Those views
therefore explain their unavailability instead of inventing review records. The
typed ban/dismiss/undo/petition port methods are tested, but the UI does not act
on an unseen original message. No live tests or owner steps are claimed.

Evidence: `gatehouse-core.test.ts` exercises all ten methods, invalid values,
HTTP and transport failures, immutable snapshots, concurrent mutation suppression,
baseline persistence, and rendered consensus/comparison data. `shell/room.test.tsx`
checks actual lazy core and drill routing, per-client capability isolation and
fixture separation. `packages/contract/scripts/test-codegen.mjs` checks the split,
positive and negative schema parity, independent function objects and determinism.

Validation in this worktree: desktop typecheck/lint, all 186 desktop tests,
contract typecheck/lint, all 124 contract tests plus generator assertions, and
all 17 verifier tests passed. The production desktop first-load check passed at
382,254/393,216 bytes. Snapshot-based contract drift passed; the ten pre-existing
generated artifacts are unchanged. The verifier was regenerated because adding
the public package export changes its fingerprint; only the stamp changed.

`pnpm gate` stopped at the native schema exporter (`spawnSync cargo EPERM`).
Native parity could not run for the same reason, and recursive workspace
typecheck/lint wrappers failed at subprocess creation (`spawn EPERM`). These
checks still require App Master verification; they are not claimed green.
