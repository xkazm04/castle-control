# Privacy notice

**Draft, not reviewed by a lawyer.** Checked against source at `c3dea03` on
2026-10-28. This notice distinguishes implemented libraries from their desktop
integration. It is pending owner review under
[WP 6.3](plan/03-implementation-plan.md#wp-63--release-checklist).

## What stays on your computer

Castle Control's store uses local SQLite for viewer-associated recordings,
rollups, caches, managed exports, managed writs and login-to-Twitch-ID mappings.
Separate JSONL audit ledgers record decisions, draws and engine usage. In a
configured native shell, the native store is under Tauri's app-data directory
at `io.castlecontrol.desktop/store`. Browser fixture mode uses generated sample
data and has no native store, keychain, Twitch or OBS connection.
Sources: [store inventory](../crates/cc-store/README.md#inventory-and-erasure),
[desktop setup](../apps/desktop/README.md#tauri-shell).

The recorder library stores message text, message and viewer IDs, UTC timestamps,
source information and gaps for replay. Imports are local documents and are not
assumed to be simulated. The live recorder API refuses capture predating the
installation time. Automatic live chat recording is **planned integration**:
current native registration uses an isolated offline Gatehouse rather than
feeding the live bridge into that recorder. Importing a recording does store its
content locally; do not import a log you are not entitled to process.
Sources: [recorder](../crates/cc-gatehouse/src/recorder.rs),
[offline registration](../crates/cc-core/src/offline.rs),
[WP 1.6](plan/03-implementation-plan.md#wp-16--recorder-and-the-drill).

Audit records contain typed actions, IDs, times and digests, with model/provider
and cost metadata for engine calls. They do not contain viewer names or message
text. Twitch user IDs in these records can still identify a viewer; the records
are not described as anonymous. Sources:
[ledger format](../crates/cc-store/README.md#ledger-format),
[engine classifier](../crates/cc-gatehouse/src/engine_classifier.rs).

## Retention windows

The store's default recording window is **30 days** (2,592,000 seconds), with a
minimum of **24 hours** (86,400 seconds). A shorter setting is refused. A sweep
deletes recordings strictly older than its cutoff; a recording exactly at the
cutoff remains. Other inventory stores and audit ledgers do not expire under
this recording-only policy. Imported batches are checked against the retention
window, and expired batches cannot be resolved for replay. Sources:
[retention policy and worker](../crates/cc-store/README.md#retention-and-dry-runs),
[recorder](../crates/cc-gatehouse/src/recorder.rs).

A scheduled-retention worker exists in the store library. Scheduling it in the
native app, exposing retention settings there, and a complete desktop erasure
workflow remain **planned**; the current native startup does not start that
worker. Do not assume that closing the app or waiting 30 days automatically
deletes every local file. Sources:
[native startup](../crates/cc-core/src/integration.rs),
[registered methods](../crates/cc-core/src/registry.rs),
[WP 0.3](plan/03-implementation-plan.md#wp-03--store-ledgers-and-retention).

## Forget and purge

The store library can preview and perform erasure. Forgetting a known login
deletes its mappings and associated recordings, rollups, caches, managed exports
and writs. A shared document is deleted in full if it includes that viewer.
Forget preserves audit ledgers, including their Twitch IDs. Full purge removes
all viewer rows, mappings and the explicit retention setting, and truncates the
audit ledgers. Dry-run counts carry an as-of time and can become stale after new
writes. Sources: [erasure inventory](../crates/cc-store/README.md#inventory-and-erasure),
[dry runs](../crates/cc-store/README.md#retention-and-dry-runs).

The Twitch bridge retires credentials, removes its keychain entry and calls the
required `purge_all` callback when authorization is revoked or explicitly
disconnected. The native callback is wired to its `cc-store` instance; failures
are errors and cleanup can be retried. Closing the shell does not revoke
authorization or purge recordings. This callback is not a promise to erase
separate offline fixture roots or every configuration file. Sources:
[revocation behavior](SECURITY.md#revocation-and-purge_all),
[native eraser](../crates/cc-core/src/integration.rs),
[offline roots](../crates/cc-core/src/offline.rs),
[shell lifecycle](../apps/desktop/README.md#tauri-shell).

The store cannot erase downloads you copied elsewhere, backups or filesystem
snapshots. Full purge retains its database/lock containers and is not a forensic
erasure guarantee. The desktop does not yet expose general forget/purge controls;
the library functions are not instructions to call an unregistered RPC.
Sources: [erasure limits](../crates/cc-store/README.md#inventory-and-erasure),
[native registry](../crates/cc-core/src/registry.rs).

## Credentials

Twitch access/refresh credentials and expiry use the OS keychain under service
`castlecontrol-twitch`, account `streamer`, with no plaintext token-file fallback.
This is **OS-user custody**: software running as the same signed-in user may
read them, subject to the OS keychain policy. It does not isolate credentials
from malware or an administrator with session access. The bridge brokers calls
without handing tokens to modules. Sources:
[custody class](SECURITY.md#keyring-custody-class),
[brokered calls](SECURITY.md#brokered-calls).

## Optional cloud classification

The default policy is rules plus a local model; cloud processing is opt-in.
The implemented engine refuses remote classification unless cloud opt-in and
the user's keychain key are provided, and permits only the OpenAI HTTPS endpoint.
It sends the selected model and classification prompt to the Responses API
with `store:false`. That request flag is not a claim about every aspect of the
provider's retention policy. Sources:
[D2 and WP 1.4](plan/03-implementation-plan.md#wp-14--engine-and-the-classifier-lanes),
[HTTP transport and notice](../crates/cc-engine/src/api.rs).

When used, the classifier prompt contains its instructions, rule IDs and rule
text, plus fenced chat text limited to 500 characters per message and temporary
batch labels such as `m1`. It does not add Twitch IDs or logins as dedicated
prompt fields, but a message can itself contain personal information. Opt-in
therefore permits sending that chat content to OpenAI using your key.
Sources: [prompt construction](../crates/cc-gatehouse/src/classifier.rs),
[engine adapter](../crates/cc-gatehouse/src/engine_classifier.rs).

These are implemented engine capabilities, not a claim that the current desktop
classifies live chat or has a completed cloud settings screen. Current native
Gatehouse registration starts no live classifier. The simulated Steward also
makes no model call; wiring a real co-pilot remains separate work. Sources:
[offline registration](../crates/cc-core/src/offline.rs),
[engine integration status](../crates/cc-engine/README.md),
[simulated Steward](../apps/desktop/README.md#ai-first-keep-and-overview-ai-3--ai-4).

## Optional Leonardo art

The Leonardo client uses your own key, referenced by label in the OS keychain
under `castlecontrol-leonardo`. Generation sends the prompt, model, dimensions
and requested image count, and matching sets reference an existing generated
image. Background removal sends a generated-image reference. Generation and
background-removal requests set `public:false`; this requests private generation,
not local execution or a blanket provider-retention guarantee. Sources:
[client requests](../crates/cc-beacons/src/art/client.rs),
[keychain door](../crates/cc-beacons/src/art/key.rs).

The Leonardo client is not yet connected to desktop RPC/UI. Public Extension
use of generated art still requires the owner's terms check. Sources:
[integration limit](../crates/cc-beacons/src/art/mod.rs),
[WP 3.4](plan/03-implementation-plan.md#wp-34--leonardo-client).

## Who receives data

This build sends nothing to Castle Control's project authors and has no
project-author telemetry/upload service. A configured Twitch connection talks
to Twitch; OBS control and the overlay are local. Optional model and art calls
go to the providers described above, and a future live public-beacon draw can
fetch a drand round. Downloading and sharing a writ yourself is a separate
disclosure: its entry handles and weights are visible to its recipient.
Sources: [bridge destinations](SECURITY.md#brokered-calls),
[overlay isolation](SECURITY.md#obs-overlay-host-wp-32),
[engine transport](../crates/cc-engine/src/api.rs),
[art transport](../crates/cc-beacons/src/art/transport.rs),
[draw transport/status](../crates/cc-core/README.md#offline-lots-module-wp-2122),
[proof format](../crates/cc-verify/src/lib.rs).

The hosted Extension service is **planned, not built**. Its proposed stateless
design and self-hosting guide are not a service currently collecting viewer
data. Sources: [M4 plan](plan/03-implementation-plan.md#m4--map-room),
[self-hosting status](guide/self-hosting.md).
