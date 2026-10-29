# Beacons: contribution visuals

Draft for owner review, current at `c3dea03` (2026-10-28).
Open `#/chamber/visuals` or press 3. Contributions are intended to change visual
intensity only; they do not buy draw odds, votes, rank or moderation decisions.
Offline intake/intensity logic, core configuration controls and the local
overlay host exist. Live contribution-to-OBS acceptance remains pending.
Sources: [Beacons domain](../../crates/cc-beacons/README.md),
[overlay status](../../crates/cc-core/README.md#wp-32-accepted-overlay-state).

## Preview or configure a visual

Fixture mode shows an altar, camera frame and border. Selection, simulated
gift/sub bursts and clock advancement affect a local preview only. **Test fire**
does not call OBS or create a real contribution. Draft artwork from the shared
proposal queue is marked `DRAFT` and does not silently replace the current look.
Source: [fixture room](../../apps/desktop/src/rooms/visuals/README.md).

Core mode reads the registered visual list. Save a visual, edit its kindling
curve and decay, and use the labelled simulation controls to inspect synthetic
intensity. Dragging a curve point previews a draft; release saves it. Focus a
point and use arrows for one-unit/percentage-point steps, Shift for ten, Enter
to commit or Escape to cancel. Numeric fields also provide Save/Cancel.
Rejected saves roll back to confirmed core state. Source:
[connected room and curve editor](../../apps/desktop/src/rooms/visuals/README.md).

Choose **Driven by** for each visual and save in core mode. The read-only native
unit follows the source: bits, count, level, points or minor_currency, with no
conversion implied. **Not routed** removes the input selection for legacy
visuals. Fixture mode lets you try this locally as simulated configuration.
Live routing of that input to the curve is a separate core step; saving a choice
does not establish live contribution-to-OBS delivery.

Simulation starts empty per call and never becomes a live contribution total.
The native registration is configuration-only; changed curves recompute an
empty contribution total until a real intake is connected. Source:
[native handoff](../../crates/cc-core/README.md#wp-32-accepted-overlay-state).

## Source URL and packages

**Copy browser-source URL** requests the validated URL from core and copies it
only after a successful reply. An unavailable source or denied clipboard action
is shown as feedback. There is no invented fixture URL. A native core owns a
separate localhost overlay listener; a socket-free offline core cannot provide
one. Source: [source-copy behavior](../../apps/desktop/src/rooms/visuals/README.md).

A URL alone does not import art. Packages must enter the trusted native import
door, pass schema/hash/local-asset checks, and receive consent before initial or
widened script privileges. A visual naming an unverified design publishes
nothing. Restart drops imported packages and consent, requiring verification
again. The overlay has no route to control RPC. A general end-user package
import workflow is not supplied by these controls. Sources:
[accepted state](../../crates/cc-core/README.md#wp-32-accepted-overlay-state),
[overlay custody](../SECURITY.md#obs-overlay-host-wp-32).

## Measured and pending

The Director's 2026-10-28 probe on `c3dea03` passed in disposable headless
Chrome: package changes n=20, p50 33 ms, p95 49 ms, max 49 ms; curve changes
n=20, p50 49 ms, p95 50 ms, max 51 ms; budget 1000 ms. It checked browser CSP,
consented scripts, widening, reload latest state and retained scene nodes.
These are Chrome figures. **Live OBS 1 s acceptance is still pending**, using
the owner-attended [measurement procedure](../../crates/cc-core/README.md#reproduction-and-measurement).
No OBS timing is inferred from them.

Real contribution subscription/intake wiring, a real test cheer and an observed
OBS response remain separate live exits. Leonardo generation is an implemented
bring-your-own-key client with `public:false`, but is not yet connected to these
desktop controls. See [privacy](../privacy.md#optional-leonardo-art) and
[M3 acceptance](../plan/03-implementation-plan.md#m3--beacons).
