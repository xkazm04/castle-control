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
the same contract door before serialization. Only `status.get` is registered
in this foundation. Twitch and OBS report disconnected until adapters own them.

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
