# WP 1.4: engine and classifier lanes

Offline preparation only. This crate is not wired to core, Twitch or
the desktop app. No test launches a real coding CLI or calls a real model.
Gatehouse provides an optional in-process `EngineClassifier` adapter.

## Routing and local admission

`Engine::new` calls `cc_types::parse_engine_settings` once. Its typed result is
the only source of engine settings. The table is configured with explicit model
IDs; `Engine::complete` accepts a class, prompt and optional deterministic rules
verdict. No call site chooses a model or reads an engine setting itself.

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
