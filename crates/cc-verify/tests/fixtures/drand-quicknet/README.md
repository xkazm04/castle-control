# Official quicknet conformance fixtures

Source: https://api.drand.sh/52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971/ (`info`, `public/1`, `public/2`, `public/1000`), fetched 2026-10-25 by the Director.

These raw public replies were cross-checked byte-identical by the Director
against api2.drand.sh, api3.drand.sh and drand.cloudflare.com. They are public
beacon data, not viewer chat or simulated signatures. The chain uses
`bls-unchained-g1-rfc9380`, period 3 and genesis epoch 1692803367
(`2023-08-23T15:09:27Z`). Tests read these files without making network calls.

The separate web fixture `packages/verifier-web/src/public-writs.json` is
generated in Rust: its draws/entries are labelled simulated, while its round
signatures and trust anchor come from these official replies. The HTML embeds
those generated writs and the separately bundled trust anchor, never an anchor
supplied by a writ.
