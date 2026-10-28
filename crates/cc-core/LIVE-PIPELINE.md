# Native shadow ingress

This delivery contains fake-bridge evidence only. It claims no live stream,
armed moderation, Twitch ACK, OBS result, M1 exit or M2 exit.

## Beacons live intake (WP 3.1 stage 1)

The existing native launch opt-in now enables `beacons` beside `gatehouse`.
Fixture/default registration starts no contribution subscriber. The production
registry loads one `Arc<BeaconsModule>` for RPC and intake. Its path is EventSub
envelope -> `Notification::contribution` (private serde schemas in cc-twitch's
`eventsub.rs`) -> the existing `cc_types::Contribution` at cc-core's
`contribution_ingress` schema door -> bounded internal broadcast (256 deliveries)
-> shared Beacons store -> existing `beacons.contribution` invalidation. Raw
payloads, messages and credentials never enter public events or diagnostics.
The bridge pump remains independent of the shadow classifier's wait; no
per-delivery task fan-out is used. Overflow, malformed contributions, unavailable
intake and socket discontinuities publish the existing `bridge.gap` invalidation.
Socket recovery retains the bridge's resubscription and gap protocol.

This cut admits `channel.subscribe` (non-gift only),
`channel.subscription.gift` (the batch's `total`, not cumulative totals),
`channel.subscription.message` (one resub), and `channel.bits.use` (Bits,
including paid Power-ups). Gift recipients do not count again. These are the
four source mappings assigned to stage 1; other subscribed notifications do not
enter this sink. `channel.goal.*` and charity normalization are deferred.

Contributions are retained as typed envelopes (original notification time plus
the existing Contribution) in the Beacons store's existing `recordings` inventory;
row time is host receipt time for retention. Verified broadcaster/viewer logins
are mapped through cc-store, with broadcaster and optional viewer associations.
Anonymous gifts retain no donor identity and belong to the broadcaster. Existing
retention, forget and purge predicates apply, with expiry reaped on intake.
Retained rows are the dedupe authority across reconnects and restarts; identity
survives for the retention window. Purge on revocation closes admission under
the module lock before clearing rows, so queued deliveries cannot refill them.
The internal row ULID is storage identity only, never a contribution identity.

No contribution moves a saved curve, intensity, visual or renderer snapshot.
Every RPC method/response and `VisualListResult`/`BeaconsRenderSnapshot` remains
unchanged. The contribution read contract and per-visual source/unit routing
are **PARKED for the owner**. Acceptance reads the inventoried rows through a
test-visible Rust-only accessor; there is no read RPC.

- Ruling 1 (07:48Z): store only in the shared BeaconsModule; existing contribution invalidation only; public reads and snapshots unchanged.
- Ruling 2 (07:48Z): private serde mapping in cc-twitch, existing Contribution parsed at core ingress; no cc-twitch -> cc-types edge, dependency or lockfile change.
- Ruling 3 (07:52Z), **FOR OWNER REVIEW**: `Notification.id` is EventSub `metadata.message_id`, used as `dedupe_key` scoped by broadcaster for Bits, subscriptions, gift batches and resubs; this interpretation requires `channel.bits.use` as the single authoritative Bits topic and `channel.cheer` unsubscribed/suppressed. It differs from the frozen cc-types/intake comments; those remain unchanged. No heuristic or fabricated contribution ID is used.

Automated simulated evidence: `cargo test --locked -p cc-core --lib beacons::tests`
asserts units/counts for a 50-gift bomb and a Bits cheer, all four source mappings,
gift-recipient/cheer suppression, shared registry state, unchanged saved curves
and preview output, contribution invalidations, restart persistence, broadcaster
scoping, duplicate gift/Bits deliveries, gap forwarding, anonymous gifts and
revocation. `cargo test --locked -p cc-twitch contributions` drives actual
loopback EventSub sockets through a drop, checks every subscription is recreated,
observes a gap and unchanged metadata IDs, and proves redeliveries are suppressed.
The existing captured-log grep test additionally exercises malformed contribution
payloads containing synthetic secrets and verifies neither token is printed.
These are fixture-only checks. The 1 s live OBS check remains an owner step and
was not attempted; no Beacons intensity routing or M3 exit is claimed.

## Construction and ownership

The built desktop passes its existing `data_dir` to
`NativeServices::app_with_data_dir`. The registry's persistent module loader
constructs **one** Gatehouse and **one** Lots instance; RPC and the subscriber
hold the same instances. Stores are separate siblings under that directory:
`native/`, `gatehouse/store/`, `lots/store/`, and the existing Beacons store.
`cc-store` inventories each store directory exclusively. Earlier M0 files at
the data directory root are left intact; this change does not migrate them.

`NativeServices::app`, `Registry::with_status` and `with_fixture_root` retain
their recorded-fixture behavior, including simulated time and temporary-root
ownership. They do not start this pipeline. The feature-gated spike runner is
unchanged and is a separate, explicitly armed operator tool: do not use it to
run the shadow stream.

## Path and guarantees

1. The bridge pump parses verified login/identity through `chat_ingress` and
   broadcasts internal `ChatIngress` values. No raw payload leaves `/events`.
2. A subscriber consumes a bounded broadcast ring (256 chats), with one
   in-flight verdict. Waiting for a classifier never waits in the bridge pump;
   there is no per-message task fan-out or unbounded queue. On overflow it emits
   the existing `bridge.gap` invalidation and includes the lost interval in the
   next retained message's recording. Missing messages get no fabricated verdict.
3. The existing Gatehouse runs disclosure detection, deterministic rules,
   classifier parsing and its final action gate. An irreversible in-memory
   shadow restriction wins over saved armed rules **before** audit persistence:
   rule matches become `would_act`, with no action intent. Care and unavailable
   classifiers still hold. Configuration is not silently rewritten.
4. The existing recorder retains originals under retention; decisions use the
   existing append-only decision ledger and private audit inventory. The host
   reaps expired recordings during intake. Only after commit are `chat.message`,
   `gatehouse.verdict`, `gatehouse.decision` and, for pass, `gatehouse.consensus`
   invalidated. No event name or payload was added.
   The live chart uses host arrival time so a late notification cannot move it
   behind a newer chart read; audit/recordings retain Twitch's original time.
5. Only a matching passed decision can mint `PassedMessage`. The adapter feeds
   all currently open rolls; sealed rolls are absent from intake. `cc-lots`
   retains its token-based keyword/free-join, eligibility, cooldown and weight
   rules. Login and subscription status come from bridge metadata. Follow and
   redemption membership, activity weighting and raid cohorts are not inferred
   from chat; absent evidence grants nothing. A shadow `would_act` is a pass,
   consistent with the existing shadow pipeline; held/barred messages never enter.
6. No moderation client, bridge, Helix adapter or credential vault is held by
   the shadow consumer. The native classifier is `RulesOnly`: no local model is
   configured in this cut, no cloud opt-in is assumed, and neither live nor
   near-live work is sent to a CLI. Classifier rules hold with a `rules-only`
   reason rather than pretending to have a model verdict. Injected classifiers
   in Rust tests exercise the existing two-second deadline.
7. Revocation stops admission, waits for any in-flight work, and purges both
   live module stores through existing `cc-store` APIs. Queued chat cannot refill
   them. Reconnect after revocation requires restarting the host. Normal close
   aborts the subscriber and preserves retained data. Fatal processing errors
   emit `bridge.gap` and stop the consumer; restart after investigating them.

Diagnostics never print tokens or message bodies. `ChatIngress` has a redacted
Debug implementation, including when wrapped by channel errors. Recording
originals is distinct from diagnostic logging. Local retained chat must never be
copied into source fixtures or committed.

Native Lots uses the real clock and marks saved writs non-simulated. It does not
silently use the fixture's historical drand round. Public-beacon construction
remains unconfigured; use the existing `streamer_commit` source, visibly labelled
**streamer-controlled**, for this cut. No beacon service or dependency was added.

## Owner-run M1 two-hour shadow stream

These are prepared owner steps, not evidence that they ran. The owner supplies
the test channel, two owned viewer accounts, registered public Twitch client ID
and the completed live spike evidence. Keep all rules shadow; do not request an
armed action or a new grant. No real-viewer arming is unlocked by this delivery.

1. In the main checkout, after the Director installs dependencies, build and run:

   ```powershell
   pnpm --config.verify-deps-before-run=false --filter @castle-control/desktop build
   cargo run --locked -p cc-desktop --features custom-protocol -- --client-id YOURPUBLICCLIENTID --test-channel your_owned_test_channel --login
   ```

   Finish the app's device login as the test-channel broadcaster. Credentials
   go only to Twitch/the OS keychain. Vite development mode is fixtures only.
2. In the built window's local DevTools console, define this helper. The session
   capability remains inside the window; never print or copy it to chat/logs:

   ```javascript
   const launch = window.__CASTLE_CONTROL_LAUNCH__;
   const rpc = async (method, params = {}) => {
     const response = await fetch(`${launch.endpoint}/rpc`, {
       method: 'POST', headers: {'Content-Type':'application/json',
         Authorization:`Bearer ${launch.session_token}`},
       body: JSON.stringify({method, params})
     });
     const value = await response.json();
     if (!response.ok) throw new Error(value.code);
     return value;
   };
   ```

   Check `await rpc('bridge.status.get')` is connected. Record the UTC start,
   application version and rules from `gatehouse.rules.list`. Add a shadow-only
   pattern rule for an owned test account's harmless unique marker using
   `gatehouse.rules.upsert`; do not use classifier rules for the rules-only replay.
3. Run for two hours on that channel. Owned accounts send clean lines, the
   marker and `!join`; record observed counts and every connection/overflow gap.
   Confirm Twitch shows no app-issued deletion, timeout or ban. Care disclosures
   are human handoffs. Record the UTC end. Close the app normally before inspecting
   stores, and keep all evidence local and out of source control.
4. On Windows, `data_dir` is normally
   `%APPDATA%\io.castlecontrol.desktop\store`. Use a read-only SQLite viewer on
   `gatehouse/store/store.sqlite3`. The `recordings` table stores existing
   `StoredItem` JSON in `item`; its `content` is the recorder envelope. Filter
   envelopes whose `recording.source` is `live-shadow`, bounded by the recorded
   start/end. Each row ID yields the existing handle `recording-<ID>`. Retain
   gaps. Audit decisions are in `caches`; the append-only IDs/actions are in
   `gatehouse/store/decisions.jsonl`. Export counts, IDs and verdicts, never bodies
   to diagnostics. `recording_version` remains 1.
5. Restart the same built app/data directory. In its local console run each
   retained handle through `gatehouse.drill.run` with this configuration:

   ```javascript
   const configuration = {rules: (await rpc('gatehouse.rules.list')).rules,
     bank:'simulated-near-misses-v1', judge:'rules-only', prompts:[]};
   const report = await rpc('gatehouse.drill.run', {
     recording:'recording-REPLACE_WITH_LOCAL_ROW_ID', configuration
   });
   ```

   Compare each result's message ID, rule and verdict with the local live audit;
   keep the returned instrument hash and do not combine different hashes. Replay
   remains simulated and writes no live decision. Individual recording handles
   reset replay state: for cross-message care/strike cases the operator must
   combine the retained messages/gaps in order via the existing
   `gatehouse.recording.import` before replay. No recording-list/export RPC is
   introduced here. A mismatch, missing decision, unexplained gap or unverified
   disclosure handoff keeps M1 open; do not claim success or arm rules. Obtain
   the owner's written M1 sign-off separately.

## Owner-run M2 test-channel draw

1. In that same built app/channel, save a **no-prize question** draw using
   `lots.draw.upsert`. Use a keyword pool with `keyword:'!join'`, equal weights,
   `winner_count:1`, no cohort caps, and `free_join_equal_odds:true`. Keep paid
   entry/weight false and the free path enabled. Run `lots.draw.check` on its
   policy and require `ok`. No money or prize is needed for this test.
2. Have the two owned accounts send `!join`. Use `lots.roll.lookup` with verified
   numeric Twitch IDs to confirm both entries. Send `!joining` from another
   owned test identity if available and confirm it does not qualify. A held
   message must not add an entry; do not manufacture a crisis disclosure live
   just for this check (the generated test bank covers the held boundary).
3. Pause the accounts' intake, wait at least **one full second** after their last
   join (the existing seal cutoff has whole-second precision), then call:

   ```javascript
   const sealed = await rpc('lots.roll.seal', {
     draw_id:'YOUR_SAVED_DRAW_ID', source:'streamer_commit', margin_s:1});
   // Announce sealed.sealed before executing the following two statements.
   const cast = await rpc('lots.cast', {draw_run_id:sealed.draw_run_id});
   const writ = await rpc('lots.writ.get', {writ_id:cast.writ_id});
   ```

   Announce the seal before cast/reveal. Keep the source labelled
   streamer-controlled. Download the writ through the existing UI, verify it
   independently with `cc-verify` and `packages/verifier-web`, and compare winners.
   Keep the proof local until the owner authorizes sharing its viewer IDs.
4. Record UTC time, version, draw/run/writ IDs, entry count and both verifier
   results. Confirm the on-stream visual and disclaimer through the independently
   delivered renderer/OBS path. This wiring does not certify those components;
   absent visual/verifier evidence keeps M2 open. No live draw was run here.

## Automated evidence

`cargo test --locked -p cc-core --test live_pipeline` covers shared RPC/intake
state and real-clock non-simulated persistence, a saved armed rule becoming
`would_act` without an intent or client capability, held/barred pool rejection,
rules-only fallback, no-bridge construction, bounded slow-engine overflow with a
recorded gap, chart polling before delayed ingress, and revocation without
repopulation. Existing `native` and
`offline_registration` tests preserve fixture registration, recorded rounds,
recorded time, socket-free startup and arming refusal.

The desktop host test captures real diagnostics containing a synthetic private
body and the session capability, proves both stay redacted, verifies all three
native stores are beneath the supplied data directory, and reopens each with
the strict inventory check. Gate results belong to this run's external
`result.json`; a skipped or failed command is not a pass.
