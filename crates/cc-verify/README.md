# Draw proof core (WP 2.2 offline preparation)

The byte-exact algorithm is documented in `src/lib.rs`. This crate owns an
offline proof format, not the pending `lots.*` RPC payloads. It has no dependency
on `cc-lots` or the Twitch bridge. Eligibility, cohort caps and cooldowns belong
to the caller before sealing. Weights are positive integers; adapting other
weight representations requires an explicit policy in that caller.

`SealedRoll::quicknet` takes an owned entry list, winner count, UTC seal time,
positive margin and a separately trusted `QuicknetChain`. It freezes every
cast-relevant setting and selects the first round strictly after time + margin.
Publish `SealedRoll::to_json()` (including the canonical entries and seal) before
that round. `QuicknetClient::fetch` requests the exact selected round over HTTPS,
with no redirects, a ten-second timeout and a 16 KiB response cap. It verifies
the round using the operator-supplied public key. No HTTP request is made by the
tests or by the CLI. Official quicknet chain info and rounds 1, 2 and 1000 are
retained byte-for-byte in `tests/fixtures/drand-quicknet/`, with source and fetch
date documented there. Their signatures verify in Rust and in the web verifier.

`finish_quicknet` authenticates the round and constructs a writ whose winners
are derived, never provided by the caller. For offline fallback, publish the
seed commitment before revealing the 32-byte seed to `finish_streamer`. This
path is always labelled **streamer-controlled**; it is not an independent beacon.

Run `cc-verify <writ.json>`. Public-beacon writs additionally require
`--chain <trusted-chain.json>`; without that separate trust anchor they fail
closed. The chain file has exactly these fields:

```json
{
  "hash": "<64 lowercase hex characters from trusted quicknet chain info>",
  "public_key": "<192 lowercase hex characters, compressed G2>",
  "genesis_time": "<canonical YYYY-MM-DDTHH:MM:SSZ>",
  "period_s": 3,
  "scheme": "bls-unchained-g1-rfc9380"
}
```

Do not populate this file from a writ. Confirm the hash/key/schedule together
from an independent source. Upstream chain info's numeric epoch genesis must be
converted to the canonical UTC string. No unverified real-network constants have
been invented. Output on success is the `VerifiedCast` JSON only; failure emits
no cast, reports `Unverified` to stderr and exits 2. Compare its seal to the
original public announcement: a self-contained file cannot establish chronology
or prevent an operator discarding a sealed draw and announcing a new one.

Evidence:

- `seal_is_canonical_and_input_is_owned`
- `round_schedule_is_strictly_after_margin`
- `invalid_round_signature_is_rejected` (validly encoded wrong-round signature,
  identity, wrong randomness, missing independent trust)
- `sealed_fields_and_winners_cannot_be_substituted`
- `unknown_fields_and_noncanonical_values_fail_at_the_door`
- `rejection_sampling_rejects_the_biased_tail`
- `verified_cast_is_the_animation_output`
- `cli_accepts_offline_writ_and_rejects_tampering`
- `thousand_generated_simulated_writs_verify_in_rust`
- `official_quicknet_rounds_1_2_1000_verify_in_rust`
- `official_beacon_writs_match_the_rust_generated_web_fixture`

`cargo test --offline --locked -p cc-verify` runs the checks. Regenerate the shared
labelled-simulated fixture explicitly with
`cargo test --offline --locked -p cc-verify generate_simulated_fixture -- --ignored`.
The deterministic public test keypair signs 100 beacon cases; 900 additional
cases use commit/reveal. Pools, counts and integer weights vary, including u32
maximum weights. The generated fixture is owned by this delivery at
`packages/verifier-web/src/simulated-writs.json`; the web parity test reads it.

Regenerate the additional simulated draws using official beacon signatures with
`cargo test --offline --locked -p cc-verify generate_public_writs -- --ignored`.
This writes `packages/verifier-web/src/public-writs.json`; the ordinary test
rebuilds it in memory and checks equality without changing the file. These draws
use simulated handles and real public beacons, never Twitch viewer chat. Rebuild
the single HTML after regenerating either fixture. The browser's arbitrary writ
file import remains disabled by Director decision; this does not restrict CLI
file input through this crate's existing JSON validation door.
