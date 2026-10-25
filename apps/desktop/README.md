# Desktop frontend (WP 0.5a)

Run `pnpm --filter @castle-control/desktop dev` for a browser preview. It defaults
to an isolated, generated fixture source, labelled in both the rampart and a
prominent banner on every route. After 1.5 seconds simulated invalidations update
the authoritative fixture read. No fixture can accept a core endpoint or session
capability, and fixture transport never calls fetch or opens a WebSocket.

WP 0.5b supplies the Tauri shell; this package contains no Rust or Tauri wrapper.
Before loading `src/main.tsx`, the shell injects an in-memory object at
`window.__CASTLE_CONTROL_LAUNCH__` with `mode: 'core'`, `endpoint` (an HTTP
127.0.0.1 root URL), and `session_token` (the core's per-launch 64-hex capability).
The entry point consumes and deletes that property. Do not put it into URLs,
storage, environment files, logs or source. An invalid injection fails visibly
and never falls back to a simulated/live hybrid. The alternative preview object
is exactly `{ mode: 'fixture' }` and accepts no additional properties.

The client uses the contract's `invoke` door for POST `/rpc` and `parseEvent`
for `/events`. WebSocket authentication uses the existing `cc-events` and
`cc-session.<capability>` subprotocols, never a query token. Reconnects resume
with `since_seq`; every validated invalidation (including `bridge.status`,
`gatehouse.room`, and `resync`) refetches `status.get` and `bridge.status.get`.
Resync can reset the cursor. Reads in progress drain subsequent invalidations;
disconnection clears stale summaries and invalidates outstanding reads. Cleanup
cancels reconnect timers and ignores responses from stopped clients.

Stream live/viewers/uptime come only from `status.stream`; absent values read
unknown. Core process uptime never substitutes for stream uptime. Moderation
counts and Shield Mode come only from `status.gatehouse`, with absent summaries
unknown. Twitch comes from `bridge.status.get`, OBS from `status.obs_connected`.
Unknown-aware rampart composition reuses the kit's layout classes and individual
primitives because its boolean-only `Rampart` API cannot express absence. Shared
kit code, CSS and tokens remain unchanged.

Hash routes `#/lottery`, `#/moderator`, `#/visuals` and `#/studio` support direct
links and back/forward navigation. The kit's one keymap table is consumed with
the brief's `/` override for search; duplicates throw at registry creation.
One React `onKeyDown` handler receives shortcuts from the focusable shell.
Typing, composition and modified shortcuts do not trigger navigation. Search
offers at most four chamber links; there is no unbounded list in this shell.
The Steward is visibly disabled until its milestone; no mutation is offered.

Package `typecheck`, `lint` and `test` use the shared package-gate runner.
`build` includes an inventory-based first-load cap of 384 KiB uncompressed
JS+CSS for all four routes, including React DOM and generated contract validators.
Tests exercise keyboard dispatch plus actual shared-component renders, source
isolation, validated RPC/event transport, reconnect/resync, invalid payloads,
unknown state, and stale read races. They do not claim a mounted browser test.

Visual comparison at 1440×900 remains owed: computer-use approval rejected the
Chrome action during this run. Source-level differences from the prototype are
intentional shell empty states replacing populated heroes/panels, an added
simulated-source banner and search row above the header, unknown status chips,
disabled Steward, and no settings control in this frontend cut. These shift the
page header vertically and change rampart widths. The sidebar's Brand sheet link
targets the local shell-information note until a brand page exists. Inherited
kit differences (13 px labels, text-only moderation/Steward, reconstructed
symbols, missing secondary-link icons and shared empty artwork) remain recorded
in `docs/ui/inventory.md`. No pixel-fidelity or screenshot claim is made.
