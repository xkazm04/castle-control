# Offline draw verifier

`index.html` is one self-contained offline file: no CDN, external resource,
network call or runtime import. It verifies five bundled writs: a simulated
streamer-controlled draw, a simulated-key beacon draw, and three simulated
draws using official quicknet rounds **1, 2 and 1000**. The UI labels the entry
pools as simulated and distinguishes the public signatures from the test key.
Compare every seal against the announcement made before the round or reveal.

Arbitrary writ **file import stays disabled by Director decision**. The verifier
accepts bundled fixtures/generated writs only. No second JSON.parse door or
private contract import was introduced; the App Master owns that future work.
This is an offline proof-format mirror, not a new lots RPC contract.

`verifyDecodedWrit(unknown, trustedChain?)` validates and freezes owned snapshots,
rejects unknown fields, recomputes the seal and weighted rejection-sampling cast,
and checks the claimed winners. SHA-256 uses Web Crypto and sampling uses BigInt.
For quicknet it checks the separately supplied chain hash and exact scheduled
round, then verifies a compressed G1 signature against a compressed G2 key with
`@noble/curves@1.9.7` and the explicit DST
`BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_`. The signed message is
SHA-256(round u64 BE). Malformed, identity and non-subgroup points, invalid
signatures and inconsistent SHA-256(signature) randomness are rejected.

Without a separate trust anchor a beacon writ remains **UNVERIFIED**. A verified
streamer commitment always retains the **streamer-controlled** label. Only a
verified, frozen, provenance-checked result can pass `animationCast`; copied or
caller-forged results fail. The algorithm authority is
`crates/cc-verify/src/lib.rs`. The single HTML bundles this same implementation.

Official raw replies, source URL, fetch date **2026-10-25**, and the Director's
mirror cross-check are recorded in
`crates/cc-verify/tests/fixtures/drand-quicknet/`. Rust generates
`src/public-writs.json` from those replies and asserts it matches on every test
run; web tests verify the same real signatures and Rust-derived winners. The
independent bundled anchor is not taken from any writ.

Generate with `node src/generate.ts` from this package (Node 24.14+). The build
resolves the existing Vitest toolchain's Vite peer and uses its public build API
to produce one minified IIFE in memory, then embeds it and the fixtures into the
HTML. It refuses external/dynamic imports or additional output files. Both
`@noble/curves` and its `@noble/hashes@1.8.0` dependency retain their full MIT
notices in the HTML. A normalized source fingerprint detects a stale artifact.
The Director installed the pinned packages and updated the lockfile; this build
does not invoke a package manager installation or create a service.

Run the three package gates through `../../scripts/package-gate.mjs` using modes
`typecheck`, `lint`, and `test`. Tests run in process in Vitest's thread worker;
no child-process permission or experimental VM flag is required. Evidence:

- `same_winners_as_rust_across_1000_generated_simulated_writs`: all 1,000 match
  Rust, including 900 commit/reveal draws and 100 BLS-authenticated beacon draws.
- `official_quicknet_round_1_verifies_in_web`, and the equivalent tests for 2
  and 1000, check the official signatures and matching Rust-generated winners.
- `invalid_round_signature_is_rejected_in_browser` and the malformed/identity/
  non-subgroup test reject invalid signatures and keys; there is no TODO stub.
- `tampering_with_sealed_fields_or_claimed_winners_fails` and
  `schema_snapshot_and_animation_result_cannot_be_mutated_or_forged` check the
  seal and animation constraints.
- `missing_trust_anchor_is_explicitly_unverified` checks the failing trust state.
- `self_contained_html_verifies_all_bundled_writs_and_rejects_bad_bls` executes
  the actual embedded bundle with dynamic code generation disabled. It verifies
  all five controls, then substitutes another real signature and checks rejection.

The same parity and HTML checks can run directly from the repo root with
`node packages/verifier-web/src/offline-check.ts` and
`node packages/verifier-web/src/html-smoke.ts`.
