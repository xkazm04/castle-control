# Offline draw verifier preparation

`index.html` is a self-contained offline artifact with no external resource or
CDN. Generate it with `node src/generate.ts` from this package (Node 24.14+).
The build only strips types and embeds the shared schema/seal/cast source and
two labelled-simulated writs. The HTML can recompute both examples now. The
streamer-controlled example verifies its commitment. The quicknet example
always says **UNVERIFIED**, even when its seal and cast match. No unverified
result can pass `animationCast`; verified results are frozen and provenance
checked. Recomputed winners are diagnostic until randomness is authenticated.

The public API `verifyDecodedWrit(unknown, trustedChain?)` validates one owned, frozen snapshot,
rejects unknown fields at every level, recomputes the seal and cast, and checks
the claimed winners. SHA-256 uses Web Crypto; BigInt preserves rejection
sampling and string round semantics exactly. An independently supplied chain
anchor is checked for scheme, chain hash and the exact scheduled round; BLS
authentication remains unavailable. The algorithm authority is
`crates/cc-verify/src/lib.rs`. This is an offline proof mirror, not a new RPC
contract. The single HTML is generated from these same sources, never a second
hand-maintained algorithm.

Two integration steps are intentionally parked for the Director:

1. Add the `packages/verifier-web` importer with an outside-sandbox pnpm install,
   and install **@noble/curves@1.9.7** for browser BLS12-381 G1 signature checks.
   Resume this thread to implement signature group/key validation and pairing checks,
   bundle the dependency locally, and replace the pending signature test. There
   is no signature-success stub, caller-supplied verifier hook or CDN fallback.
2. Provide a public shared contract JSON-decoding door, or explicitly approve
   an offline-writ parsing exception. The current package exports no generic
   JSON parser and private deep imports are prohibited. File import is therefore
   visibly unavailable; the browser API accepts already decoded values and the
   self-contained artifact demonstrates simulated examples. No alternative JSON
   parser has been slipped past the contract-only parsing rule.

The Director should also fetch independently confirmed quicknet chain info and
real rounds **1, 2 and 1000**, retaining raw responses and expected verification
outcomes. Simulated keypair tests are not a real-network conformance claim.

Acceptance evidence: `same_winners_as_rust_across_1000_generated_simulated_writs`
compares 1,000 Rust-generated writs, with varying weighted pools and counts.
`tampering_with_sealed_fields_or_claimed_winners_fails`,
`schema_snapshot_and_animation_result_cannot_be_mutated_or_forged`,
`beacon_signature_dependency_is_explicitly_unverified`, and
`self_contained_html_runs_both_examples` cover the other currently testable
properties. `invalid_round_signature_is_rejected_in_browser_after_noble_curves_install`
is explicitly TODO, never claimed as passing. Package gates and full pnpm gate
must be rerun after the Director's install; this sandbox has no node_modules.

Before install, the same parity check can run without a test framework:
`node packages/verifier-web/src/offline-check.ts` from the repo root.
`node --experimental-vm-modules packages/verifier-web/src/html-smoke.ts` exercises
the actual embedded HTML module and both example controls without network or
browser dependencies. The Vitest tests invoke these same checks after install.
