# Local core service

Construct `AppState::new(Registry::with_status(), capacity)` in the native shell,
hand its per-launch `session_token()` only to that shell, then call `bind` with
`127.0.0.1:<port>` (zero chooses a free port). Every other address is refused.
The returned server future runs until `AppState::shutdown()`; event sessions
also close. Tokens are generated from 32 random bytes, never served or logged.

POST `/rpc` carries `Authorization: Bearer <session>` and a JSON body such as
`{"method":"status.get","params":{}}`. Success is the method's typed result;
failure is `{code,message,retry_after_ms?,detail?}` with omitted optional keys.
Module handlers receive generated request variants; results are validated at
the same contract door before serialization. `Registry::with_status()` registers
the native method inventory without starting adapters; its status is disconnected
and adapter calls return unavailable. For a configured app, create
`NativeServices::new(NativeConfig, Store, LoginPresenter).await`, retain it, then
call `services.app(capacity)` and `bind`. It wires the Twitch bridge and OBS into
that registry and the same event hub used by `/events`. Call `shutdown` when
closing the app. The bridge owns its credential broker and revocation calls
`Store::purge_all`; no bearer credential crosses the module boundary.

WP 0.7 registers `bridge.status.get`, `auth.twitch.start/status/revoke`,
`obs.status.get` and `obs.source.create`, besides `status.get`. Device challenges
go to the supplied native `LoginPresenter`, never the RPC result or logs. The
provided Windows presenter opens Twitch and displays the code in a native dialog
through a fixed helper script with JSON on stdin. Other platforms must inject
their native presenter. Optional auth user_id is absent because the current
bridge API does not expose that identity; confirmed requested scopes are shown
only after the bridge connects. Stream and Gatehouse summaries stay absent until
their authoritative sources are available.

Bridge changes are sampled every 100 ms; `bridge.status.get` returns the current
state and the latest recorded gap. Gaps publish `bridge.gap`; chat notifications
publish `chat.message` without message bodies. M0 uses a labelled shadow/pass
stub; M1 owns the real verdict pipeline. OBS is probed with GetVersion every two
seconds and publishes `obs.status` changes. Source creation accepts only the
owned overlay URL from `services.overlay_url()`; hand that URL to the native
shell rather than accepting another localhost service or an arbitrary website.
The overlay has its own port and read-only router, never core's RPC origin.

The operator-only command is `cargo run -p cc-core --features spike --bin spike
-- ...`; its target login is mandatory. Default builds expose no fault hook.
See [the live-run template](../../../docs/spike-log.md) for the exact command,
owner preparation, sanitized evidence format and pending live acceptance items.

GET `/events?since_seq=<last applied seq>` upgrades to a WebSocket with the same
authorization. A native client uses the header. A browser supplies protocols
`cc-events` and `cc-session.<session>`; only `cc-events` is echoed. Session tokens
never go in a URL. Only exact Tauri origins are accepted; localhost browser
sources and arbitrary websites are refused even when they supply a capability.
The native shell owns HTTP transport; no overlay route is exposed by this router.

Every event has `seq`, UTC `at` and a closed `kind`. Without a cursor a client
starts at the current head. A valid retained cursor gets every later event in
order before live events; an expired cursor or a cursor ahead of this launch
gets one `resync` at the current head, then live events. Clients refetch reads
on invalidation and refetch all reads after resync. The bounded buffer is not a
durable log across process launches. Slow writers have a five-second ceiling.

Register modules through `Module`/`Registry::register`; empty, duplicate and
undeclared registrations fail atomically. `export-registry` instantiates that
registry for the method parity gate. Tests use generated simulated values and
real local HTTP/WebSocket connections, with no Twitch/OBS calls.
