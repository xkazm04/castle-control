# Beacons: contribution visuals

Draft for owner review, current at `6cd46e6` (2026-10-29).
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
The picker landed at `b6c4e9b`; `6cd46e6` registers
`beacons.contribution.list` and routes accepted live contributions to selected
visual curves and the native overlay. Cheer and Bits-use share the bits input
without converting units or counting a duplicate twice. Saving a choice alone
is not live acceptance evidence. Sources: [live intake](../../crates/cc-core/src/beacons/live.rs)
and [curve routing](../../crates/cc-core/src/beacons/routing.rs).

Simulation starts empty per call and never becomes a live contribution total.
Saving configuration resets that visual's live total; configure it before the
test contribution. Decay snapshots run once a second. The desktop's existing
feed contains simulated events only; a **desktop live contribution feed is a
separate delivery**, even though the bounded core read now exists.

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

Live intake and curve routing are built, but **a real test cheer moving the live
OBS visual is not verified live yet**. Leonardo generation is an implemented
bring-your-own-key client with `public:false`, but is not yet connected to these
desktop controls. See [privacy](../privacy.md#optional-leonardo-art) and
[M3 acceptance](../plan/03-implementation-plan.md#m3--beacons).

## M3 live run

This is an owner runbook, not a completed M3 exit. Use only the owner's test
channel and owned test accounts after the Director's live-spike clearance.
Keep rules Watching; this run grants no arming or cloud opt-in. Prepare device
login/keychain access as in [login](login.md), OBS with obs-websocket v5, and a
test scene. No builder purchases Bits or sends a cheer on the owner's behalf.

### Start and prepare the source

From the repository root in a normal checkout with dependencies present:

```powershell
pnpm --config.verify-deps-before-run=false --filter @castle-control/desktop build
cargo run --locked -p cc-desktop --features custom-protocol -- --client-id YOURPUBLICCLIENTID --test-channel YOUR_OWN_TEST_CHANNEL --login
```

Use the actual public client ID and owned channel; omit `--login` only to reuse
an existing keychain grant. Existing `--obs-port` and `--obs-password-label`
options name the OBS port and a keychain label, never a password. Browser dev
preview is simulated and cannot prove live intake. Complete login privately.

1. Confirm the native core/Twitch and OBS connection status. Press **3**, select
   or create a visual, choose **Driven by → Bits cheer** (unit **bits**) and
   **Save visual to core**. Finish curve edits before the cheer: choose a
   non-flat range in bits so the owner's planned test amount produces a visible
   change, with a baseline below full blaze. Record the curve and decay.
2. The visual must name an already verified, intensity-bound design imported
   through the trusted native package door. Arrange that preparation with the
   Director; these desktop controls do not provide a package-import workflow.
   A URL without a verified design is insufficient. Restart loses imported
   packages/consent, so arrange reverification after any restart.
3. Use **Copy browser-source URL** for that visual, then add the returned URL as
   an OBS Browser source in the test scene, at 1280×720. Record its baseline;
   do not expose control capabilities or invent a URL. If copying fails, the
   design is unavailable or OBS is blank, keep the run pending and retain the
   sanitized failure instead of claiming a successful visual.

### Real cheer and simulated gift bomb

1. Start a sanitized recording of OBS and the app on the same time base. From
   one **owned test account**, the owner sends **one real test cheer** on the
   test channel, using an amount within the prepared curve. Record UTC time and
   amount in bits. Observe whether the matching OBS visual changes without a
   manual refresh and follows its configured decay. Do not save the visual or
   curve during this observation, since saving resets its live total.
2. In the app, verify the saved Driven-by selection and connection status with
   **Refresh Beacons** as needed. The current room does not display live totals
   or a live contribution feed, and still carries an unavailable-delivery
   notice. Neither that notice nor its simulated feed establishes whether the
   cheer reached OBS; keep the actual OBS observation, including no movement.
3. Separately select the test visual and click **Simulate 50 gift subs** under
   **Test fire · core simulation**. Keep the **simulated** output and
   **simulated · Core simulation** feed label visible. The app should show a
   core-computed blaze result and one synthetic row with amount 50. This models
   a 50-sub gift bomb; it does not send gifts or change the saved bits input.
4. Observe OBS as well: `beacons.simulate` is deliberately isolated and does
   **not** push the simulated result to OBS or alter live totals. Thus these
   controls cannot yet supply the M3 proof that a simulated 50-sub gift bomb
   moves the live OBS visual. Record the gap for the Director as a separate
   delivery; do not relabel a real gift or a fixture preview as that proof.
   Source: [simulation-isolation test](../../crates/cc-core/src/beacons/routing_tests.rs).

### Package timing and evidence

Run the separate owner-attended [1 s package-change measurement procedure](../../crates/cc-core/README.md#reproduction-and-measurement).
It uses an explicitly simulated diagnostic source, not the real-cheer source.
Record native handoff and OBS preview on one time base, count frames to the
first displayed change, and retain n/p50/p95/max, frame-rate uncertainty, OBS
and obs-browser versions, and whether every sample met 1 s without refresh.
The existing Chrome results above do not substitute for this OBS measurement.

Keep the tested revision, sanitized UTC interval, visual/design IDs, curve,
decay, cheer amount, before/after OBS recording, app simulation labels and the
timing output in the owner's private evidence record. Keep failures and gaps.
Evidence must contain no tokens, device codes, keychain contents or user data
beyond owned test accounts; stop capture if another viewer enters. Real chat
and contribution records never become repository fixtures. Publish only
sanitized extracts reviewed by the owner.

**M3 remains pending-owner:** no live cheer result or OBS timing is claimed.
The simulated-bomb-to-OBS gap also needs a separate implementation delivery
before the full exit can be demonstrated. Beacons stays beyond the floor demo.
