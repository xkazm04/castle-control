# Shared contract

`cc-types` owns the method table, Rust request dispatch, schemas, branded IDs,
closed event names and ten error codes. Its `export-contract` binary drives
this package's generated TypeScript types, metadata and Ajv standalone validators.
The runtime uses these validators without compilation/eval in the desktop.
Only `src/door.mjs` parses JSON. Unknown keys and explicit null are refused;
absent optional keys are omitted. UTC timestamps are validated as calendar dates.
Numeric counters are safe JS integers; Twitch IDs, seeds and rounds stay strings.

Run `pnpm -C packages/contract generate` after changing Rust types. Run
`pnpm -C packages/contract check` to regenerate in memory and compare the whole
generated tree, including missing and orphan files. The gate refuses empty
inventories. `pnpm gate` runs drift and method/event parity before other gates.
Generated artifacts are deterministic and carry their rebuild instruction.
Only Ajv's machine-emitted validator module disables ESLint; the global hygiene,
file cap and secrets gates still inspect it. All authored code remains linted.

When Node cannot spawn Cargo in the builder sandbox, the Director-authorized path is:

```powershell
cargo --config net.offline=false run --quiet -p cc-types --bin export-contract | Set-Content -Encoding utf8 $schemaPath
cargo --config net.offline=false run --quiet -p cc-core --bin export-registry | Set-Content -Encoding utf8 $registryPath
node packages/contract/scripts/generate.mjs --schema $schemaPath
node packages/contract/scripts/check.mjs --schema $schemaPath
node packages/contract/scripts/parity.mjs --schema $schemaPath --registry $registryPath
```

Use external run-directory files and freshly export both from the current tree.
`CC_CONTRACT_SCHEMA` and `CC_CORE_REGISTRY` supply the same files to `pnpm gate`.
Outside the sandbox no flags are required: both scripts run Cargo themselves.
These overrides are a build-harness input, never a product or CI default.

`Registry::with_status()` reports the actual built-in registration. Parity
requires registered methods to be declared and literal TS `invoke` calls to be
registered. Declared names awaiting later WPs are reported with their count.
The event gate checks emitted Rust enum variants, literal TS event subscriptions
and publications, and the generated event-name mirror against the closed registry.
It also refuses JSON parsing outside the contract door in application/packages code.

Later WPs own the placeholder shapes named in the Rust method table. `Pending`
is uninhabited (`never` in TS), so a placeholder cannot accidentally accept live
data. Add a method shape in `cc-types`, regenerate, then implement/register its
module. Events invalidate authoritative reads; even after replay, consumers
refetch. A `resync` requires refetch of every subscribed read.
