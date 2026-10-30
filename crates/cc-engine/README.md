# WP 1.4: engine and classifier lanes

Offline preparation only. This crate is not wired to core, Twitch or
the desktop app. Normal tests launch no real coding CLI and call no real model;
the ignored floor-wire twins below are reserved for an owner-run local spike.
Gatehouse provides an optional in-process `EngineClassifier` adapter.

## Routing and local admission

`Engine::new` calls `cc_types::parse_engine_settings` once. Its typed result is
the only source of engine settings. The table is configured with explicit model
IDs; `Engine::complete` accepts a class, prompt and optional deterministic rules
verdict. No call site chooses a model or reads an engine setting itself.

The additive native constructor is:

```rust,ignore
pub fn Engine::from_settings(
    settings: &cc_types::Settings,
    door: cc_engine::SpawnDoor,
    max_processes: usize,
) -> Result<cc_engine::Engine, cc_engine::ConstructionError>
```

It uses the same settings parser and endpoint admission/authorization as
`Engine::new`. The caller supplies the private spawn-control directory via
`SpawnDoor` and the concurrency cap. Construction does not probe a CLI or make
a network request. It requires only the selected `engine.cli_provider`'s
executable path and model: `engine.claude_exe_path` and `engine.model_claude`,
or `engine.codex_exe_path`, `engine.model_codex` and `engine.posture_helper_path`.
The parser's default selected provider is Claude. There are no inferred paths
or models, and the other CLI provider and `engine.model_local` may stay absent.

Incomplete settings return `ConstructionError::MissingKeys(Vec<&'static str>)`
in lexical key order. Display is `missing engine settings: <keys joined by , >`;
Display and Debug retain only key names, never configured values. The host can
keep launching while reporting the Steward unavailable with this reason; core
and host wiring are a later delivery. Invalid settings and runtime setup failures
also return sanitized typed construction errors.

An absent class model returns `Failure::MissingModel("engine.model_local")`
at call time (live/near-live), before any provider attempt. No engine audit row
is invented for that configuration failure because its required selected-model
field has no value. Configured calls retain the existing admission, fallback,
custody and audit behavior. `RoutingTable::new`, `CliRuntime::new` and
`Engine::new` keep their signatures and behavior for explicit legacy callers.
`tests/construction.rs` covers selected-provider construction, fake CLI calls,
missing-key order/redaction, absent lane models and endpoint safety.

| Class | Default transport | Total ceiling | Silence ceiling |
| --- | --- | --- | --- |
| live | local compatible HTTP | 2,000 ms | 1,500 ms |
| near_live | local compatible HTTP | 5,000 ms | 3,000 ms |
| batch | selected CLI | 120,000 ms | 30,000 ms |
| offline | selected CLI | 300,000 ms | 60,000 ms |

These are provisional budgets from the plan, not performance claims. HTTP
classification requires measured evidence: at least six exact structured verdicts,
100% correct, p95 within the class budget and longest silence below its ceiling.
The evidence belongs to the measured model and endpoint; changing either requires
a fresh reading; a changed served-model identity also invalidates admission.
Nonstreaming HTTP conservatively counts the entire call as
silence. Slow CLI calls hold a bounded process permit for their whole lifecycle;
both live classes are denied by the routing table, admission and spawn door.

`measure_floor` uses synthetic, explicitly labelled cases and audits every case.
Its six-case v1 bank measures structured output and instruction following, not
moderation accuracy. Pass a larger, representative generated bank for a useful
tail measurement; WP 1.6 owns moderation-quality evaluation. Missing/failed
measurements never count as a fast or capable model. A floor report can supply
the evidence in a `Route` when configuring the table.

Default HTTP is the plan's local `http://127.0.0.1:11434/v1`. Only literal loopback
IP addresses are treated as local (use `127.0.0.1` or `[::1]`, not DNS names).
Only HTTPS `api.openai.com:443` can be a remote endpoint, and it requires the
existing cloud opt-in setting and a keychain label. Proxy inheritance and
redirects are disabled. `CLOUD_NOTICE` is the plain notice for a future UI.
The OpenAI path uses Responses with `store:false`; local runtimes use compatible
Chat Completions JSON output. `measure_floor_with_key` permits cloud calibration
only through those same opt-in and keychain checks; the command below is local-only.

## Floor wire assumptions

These describe the existing `measure_floor` implementation, not a broader
OpenAI-compatibility claim. Each item has a normal FIXTURE test in
`tests/floor_wire.rs`, named `simulated_fixture_<suffix>`, and a LIVE twin in
`tests/floor_live.rs`, named `live_<suffix>`. All prompts/replies in fixtures and
all prompts sent by live twins are labelled simulated. Live twins use the same
production parser and `measure_floor`, with a fresh temporary measurement Store
per reading; they never call `measure_floor_with_key` or configure routes.

- **`local_only`:** `CC_LIVE_FLOOR` must be exactly `1`, with
  `CC_LIVE_FLOOR_URL` and `CC_LIVE_FLOOR_MODEL` supplied separately. Before any
  request/store, the twin rejects missing/other flags and non-loopback URLs.
  Only literal loopback IPs such as `127.0.0.1` or `[::1]` qualify; `localhost`
  and all cloud/DNS hosts are refused. Settings still pass the existing schema
  door. The production client disables proxy inheritance and redirects and
  sends no authorization header to this local-only floor path. The fixture also
  tests the guard without mutating process environment variables.
- **`request_shape`:** POST to the configured base path plus
  `/chat/completions` (normally `/v1/chat/completions`), JSON content type, with
  exactly `model`, one `messages` entry (`role: "user"`, simulated prompt),
  `stream: false`, `max_tokens: 2048`, and
  `response_format: {"type":"json_object"}`. No streaming, tools, temperature,
  JSON-schema response format or Responses API is requested on this path.
  The fixture compares the entire request; the live twin checks runtime acceptance.
- **`response_shape`:** a JSON response with a valid `model`, a `usage` object
  and a nonempty `choices` array. Only the first choice is read. It must have
  `finish_reason: "stop"` and `message.content` as a nonblank string containing
  exactly `{"verdict":"pass"}`, `{"verdict":"hold"}` or
  `{"verdict":"bar"}`, matching the case's expectation. Arrays, extra verdict
  keys, unknown verdicts, null/array content and truncated/tool-call finishes
  fail. Extra envelope fields are tolerated; there is no streaming decoder here.
- **`usage_shape`:** `usage` is required; missing counters default to zero.
  `prompt_tokens` and `completion_tokens` are unsigned integers used for local
  token cost calculation. The shared usage parser also accepts unsigned
  `input_tokens`/`output_tokens`, but these do not price local Chat Completions;
  `total_tokens` is ignored. Wrong types/negative counters fail parsing.
  The local floor uses zero default prices, so each case's audit cost is zero
  regardless of reported counts; the live twin validates parsing and that audit.
- **`latency_budgets`:** existing admission requires at least six samples,
  every structured verdict correct, p95 total at most **2,000 ms** and longest
  silence at most **1,500 ms** for `live`; **5,000 ms** and **3,000 ms** for
  `near_live`. Equality passes. Nonstreaming calls count their entire duration
  as silence. The fixture checks both boundaries, one millisecond over, too few
  cases and incorrect cases. The live twin prints the report and checks both
  classes using `Evidence::admits`, without adding a threshold.
- **`measurement_timeout`:** the floor reader's per-case HTTP/body deadline is
  **5,000 ms**, independent of class admission. Timeout/transport/parse failures
  still add a failed sample and an engine audit, not a fast successful sample.
  The fixture accepts a connection but withholds the response until measurement
  reports its timeout. The live twin requires the real runtime to complete
  the six-case bank within that existing deadline, without deliberately stalling it.
- **`model_identity`:** there is **no model-ID discovery** or `GET /models`.
  The owner copies the exact loaded ID from their runtime into the model argument;
  no model is downloaded or selected automatically. The response must report a
  valid model ID (not necessarily the selected alias); it is recorded separately
  from the selected ID. Served-ID drift invalidates the reading. The fixture
  checks explicit selection, absent/invalid IDs, drift and the POST-only request
  inventory; the live twin checks the supplied selection and stable reported ID.
- **`http_errors`:** non-2xx statuses fail regardless of provider error-body
  shape. Existing transport labels 401/403 as `Auth`, 429 as `RateLimited`,
  other statuses as `Unavailable`; a 2xx error envelope without the required
  completion fields fails parsing. Floor reports aggregate these as failed
  cases, with no raw error body in the audit and no per-reason error counters.
  The fixture covers 400/401/403/404/429/500/503/302 and a 200 error envelope.
  The live twin requests a unique nonexistent simulated model ID and requires
  endpoint failure rather than silent model substitution; it does not induce
  authentication errors, throttling or outages.
- **`refusal_shapes`:** null content with a refusal, refusal-only JSON content,
  and `finish_reason: "content_filter"` do not count as structured verdicts.
  There is no separate floor refusal result: they increment `failed`. An extra
  `message.refusal` property is not independently interpreted; a valid verdict
  with `finish_reason: "stop"` still follows the ordinary verdict parser.
  The live twin harmlessly asks for `{"refusal":"simulated"}`, and requires
  a parsed response rejected as a verdict. It does not seek an actual safety
  refusal; provider-specific refusal envelopes remain covered by fixtures.

### Spike: floor reading

Owner step only; **nothing runs live during this delivery**. Start the intended
local runtime and load the model first. Supply its literal-loopback `/v1` base
URL in `CC_LIVE_FLOOR_URL` and exact model ID in `CC_LIVE_FLOOR_MODEL`. From the
repository root, the measurement command uses a new temporary audit directory:

```powershell
cargo run --offline --locked -p cc-engine --bin measure-floor -- $env:CC_LIVE_FLOOR_URL $env:CC_LIVE_FLOOR_MODEL (Join-Path $env:TEMP ("castlecontrol-floor-" + [guid]::NewGuid()))
```

The binary itself has no environment opt-in guard; do not run it until the
owner's spike. Its report is `instrument=simulated-floor-v1 n=6 correct=6
failed=0 ... live_admitted=true` for a passing live reading. The p95/silence
values must satisfy the existing budgets above. Exit zero alone is not a pass:
the binary also prints unsuccessful readings. This six-case format/instruction
instrument is not moderation-quality evidence; repeat representative cold/warm
measurements before admitting a real model.

For the LIVE twins, the owner must explicitly opt in with `CC_LIVE_FLOOR` equal
to `1` in that shell, in addition to URL/model. This document deliberately does
not set the flag. Run serially to avoid measuring this suite's own contention:

```powershell
cargo test --offline --locked -p cc-engine --test floor_live -- --ignored --test-threads=1 --nocapture
```

All nine twins must pass; successful positive readings have six correct cases
and no failures, while the unknown-model and refusal-shaped negative probes
must each record one failure. Each twin writes only a temporary Store, removed
afterward. The owner-run binary's temporary audit directory remains available
for inspection. No reading arms rules, enables wiring or persists admission.

Offline delivery evidence, 2026-10-26:

- `cargo test --offline -p cc-engine`: exit 0, 33 passed and nine LIVE twins
  ignored with `live: CC_LIVE_FLOOR=1`. After the test-lock scope cleanup,
  `cargo test --offline -p cc-engine --test floor_wire --test floor_live` also
  exited 0: nine fixtures passed, nine LIVE twins ignored.
- Red guard proof, with no live flag set:
  `cargo test --offline -p cc-engine --test floor_live -- --ignored --test-threads=1`
  exited 1: all nine twins panicked before requesting an endpoint, each with
  `live floor disabled: CC_LIVE_FLOOR must be exactly 1; no endpoint request was made`.
- `cargo fmt --all -- --check` and
  `cargo clippy --offline --workspace --all-targets -- -D warnings`: exit 0.
- `node scripts/check.mjs`: exit 0 for boundaries, hygiene, file cap and secrets.
- Both `pnpm --config.verify-deps-before-run=false -r typecheck` and the
  corresponding `-r lint` exited 1 at package-script launch with Node
  `spawn EPERM` (errno -4048). These checks did not pass in the builder sandbox.
  `git diff --exit-code HEAD -- package.json pnpm-lock.yaml pnpm-workspace.yaml scripts packages apps`
  exited 0: their inputs are unchanged from this worktree's base. App Master
  must rerun them in its permitted gate environment. No install was attempted.

## CLI custody and probes

The provider trait selects `claude_cli` or `codex_cli` from settings. Claude is
the development default. Both use one native spawn door with absolute executable
paths, a fresh empty neutral directory, stdin prompts, bounded JSONL output,
sanitized errors, a total deadline, a silence deadline and kill-on-drop.
Windows `.cmd`/`.bat` shims are refused; configure the native executable instead.

The child environment is rebuilt from OS/runtime/login-location variables only.
It has no inherited PATH, proxies, provider keys, plugin directories or parent CLI
session settings. The host implements the injected `Keychain` broker using the
OS vault. The crate passes a label to it and puts that key only into that child's
provider-specific environment; it never reads credential files or prints keys.
HTTP credentials are never forwarded to local endpoints.

Claude runs in plan mode with no tools, no permission prompts, empty settings
sources, an empty strict MCP configuration and no session persistence. Its init
event must report plan mode. Codex runs `exec --json -s read-only` with ephemeral
state and ignored user configuration/rules. Before a Codex turn, the same spawn
door runs `codex sandbox windows -c sandbox_mode="read-only" -- <posture helper>
<target>`. The helper must observe a permission-denied write at a location proved
writable by the host. Missing/unsupported enforcement fails closed. Explicit
posture overrides in JSONL also fail the call. The fake CLI pins the received
argument vector, including empty arguments, and the received environment.

Configure `CliExecutables.posture_probe` with the built native
`cc-engine-posture.exe`; it does not call any model. No real CLI/version-specific
sandbox or account behavior has been exercised by this offline delivery.

| Provider | Installed/version probe | Login probe | Evidence, checked 2026-10-25 |
| --- | --- | --- | --- |
| Claude | `--version` | `auth status` | [Official CLI reference](https://code.claude.com/docs/en/cli-usage): JSON by default, exit 0 when logged in; pinned source `health.rs` also used the auth-status surface |
| Codex | `--version` | `login status` | [Official developer commands](https://learn.chatgpt.com/docs/developer-commands): exit 0 when logged in |

Both probes run through the call's spawn door and environment. Only version and
login state survive; identity fields and raw output do not. Invocations and the
sandbox helper follow the [official Codex CLI reference](https://learn.chatgpt.com/docs/cli/reference).
The [non-interactive documentation](https://learn.chatgpt.com/docs/non-interactive-mode)
supports stdin prompts and invocation-scoped API keys; the HTTP shape follows the
[Responses API](https://developers.openai.com/api/reference/responses/overview).

Windows jobs kill descendants after timeout, cancellation, parent exit or host
death. Parent exit is observed alongside output so an inherited pipe cannot
delay descendant cleanup. Termination requests stdin EOF, grants a short grace,
then kills the job and reaps the child. A per-root kernel file lock excludes a
second live host before startup sweep. ULID control directories identify named
jobs, never recycled process IDs. Sweep opens only those exact jobs and refuses
unknown payloads and symlinks. It never traverses or deletes recursively.
Assignment happens immediately after native spawn and before sending the prompt;
it is not atomic with process creation. Windows is the supported CLI platform
for this delivery; non-Windows CLI custody refuses until M6 supplies containment.

## Outcomes and the one ledger

`Engine::complete` keeps the exact single-verdict object check on live classes.
`complete_with_shape(..., AnswerShape::Custom(&parser))` is the Rust-only seam for
callers with another structured reply. The callback must use the caller's schema
door; it runs before any live model result is returned. Gatehouse supplies its
existing hit-array decoder, then checks batch/rule membership in its lane. Custom
shapes omit local `json_object` response mode so arrays are possible; default
calls and capability-floor measurements retain that mode. Invalid custom output
uses the same fallback ladder, and every result still requires a successful
engine audit append. Admission, endpoint authorization and CLI custody do not
change. `tests/answer_shape.rs` proves default rejection of arrays, custom
acceptance, malformed-output fallback, request modes and audit failure.

The ladder labels outcomes `model`, `rules-only`, or `refused`. No engine/model
means the caller's deterministic verdict continues, explicitly rules-only. With
no deterministic verdict, the result is an honest refusal. Unknown or malformed
live verdicts are never silently passed. The model result is still a proposal;
this crate has no moderation action path.

Every completed call (including unavailable, rules-only, refusal and floor
cases) appends through `Store::append_ledger` and the existing `LedgerEvent::Engine`.
The row carries class, selected provider, selected model, reported served model,
and micro-USD cost. Rules-only and refusal omit the served model. No prompt,
reply, raw error, credential, second ledger or new wire identifier is introduced.
An audit error prevents returning an unrecorded result. CLI JSONL does not always
report the served model: that field stays absent rather than inventing an identity.

HTTP/token-based CLI costs use explicit configured rates (micro-USD per million
tokens), rounded up; Claude's reported call cost wins when present. Local and
subscription calls default to zero marginal provider billing. A transport failure
without usage has zero *known* spend; a reported failed turn retains known usage
and cost. This is not a provider billing reconciliation service. Configure paid
model rates when building the routing table; no price or model roster is fetched.

## Steward scenarios

WP 5.1 tests can reuse the native `fake-cli` binary through the normal slow-lane
spawn door. Put one whitespace-delimited marker in the prompt sent on stdin:

- `cc-fake-scenario:writ-ok`: a proposed Writ from the first shared simulated
  fixture in `crates/cc-types/tests/fixtures/steward.json`, embedded at build time.
- `cc-fake-scenario:writ-schema-invalid`: the same JSON with a chamber/method
  mismatch, rejected by the `cc_types::Writ` deserializer.
- `cc-fake-scenario:writ-malformed`: non-JSON answer text.

Both Codex and Claude wrap these answers in their normal successful JSONL
events. Invalid proposal text is still an engine answer for the caller to
validate; it neither applies a change nor bypasses engine billing. The existing
posture, sandbox, sentinel and environment assertions run unchanged. No marker
preserves the original behavior. No argv or environment selector is added.
`tests/steward_scenarios.rs` covers all three markers on both slow classes and
both providers, compares billing with an unmarked call, and checks that decision
and draw ledgers stay empty. Steward should reuse this fake rather than keep a
crate-local copy.

## Verification and owner reading

Run `cargo test --offline --locked -p cc-engine`. Acceptance evidence:

1. `cli_never_runs_on_live_lane`.
2. `both_cli_backends_share_contract_and_settings_switch_call_sites`.
3. `parent_sentinel_is_invisible_and_only_keychain_child_receives_key`.
4. `ledger_records_class_selected_served_and_cost_for_every_call`.
5. `unavailable_model_continues_rules_only_and_no_rules_refuses`.

Additional tests cover capability admission, floor errors, cloud refusal,
Responses HTTP/schema parsing, both probes, startup sweep/ownership, silence
timeouts, malformed/failed/oversized CLI output, nonzero exits, and job cleanup.
The descendant test first failed after 30 seconds; observing parent exit alongside
stdout made the same test pass in under a second. All test chat and replies are
simulated. Fake endpoints bind to ephemeral loopback ports only.

Owner step, not run by this build: start the intended local runtime, choose its
model ID and a separate audit directory, then run from the repo:

```powershell
cargo run --offline --locked -p cc-engine --bin measure-floor -- http://127.0.0.1:11434/v1 <local-model-id> <measurement-store-directory>
```

Record n, correct/failed, p95 and longest silence. Repeat using representative
prompt sizes and cold/warm runs before admitting a real model. The tool creates
only the chosen measurement Store; it does not enable live wiring or armed rules.

## Provenance and standards

Adaptations name Shadowrunr OS commit `7e4b6f8` and their source paths in headers.
Admission, API transport, both CLI dialects (Codex from `alt_cli`), ladder, ledger,
limits, model, stream and health were reworked for Castle Control's contracts,
local-first defaults and process custody. No cross-repo dependency is retained;
the Director owns the NOTICE update in WP 1.1. No source fixture with real chat
or original credential-file fallback was copied.

Registry subjects read: model-routing, live-response-latency-budgeting,
agent-cli-transport and subprocess-lifecycle, including child-observed posture
and permission-stance enforcement. Their consequences here are measured admission,
class routing, explicit fallbacks, one hardened spawn door and owned child reaping.
