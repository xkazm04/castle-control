# Verify a draw writ

Draft for owner review, current at `c3dea03` (2026-10-28). The Rust CLI and
self-contained web verifier work offline. Verification checks a proof, not
whether a live Twitch draw happened. A writ contains entry handles and weights;
review privacy before sharing it. Sources:
[Rust verifier](../../crates/cc-verify/README.md),
[web verifier](../../packages/verifier-web/README.md).

## Save the proof and its announcement

Obtain the writ JSON from the draw operator or use **Download proof bundle**
in the connected [Lot Chamber](lots.md). Keep the original publicly announced
seal and beacon round or seed commitment, made before the round/reveal. Compare
the verified seal to that announcement. Verification cannot establish chronology
or rule out an operator discarding another sealed attempt. Source:
[trust limits](../../crates/cc-verify/README.md).

## Command line

From the repository root, with the Rust toolchain and dependencies available:

```powershell
# Streamer-controlled commit/reveal writ:
cargo run --locked -p cc-verify --bin cc-verify -- .\writ.json
# Public quicknet writ, with a separately trusted chain file:
cargo run --locked -p cc-verify --bin cc-verify -- .\writ.json --chain .\trusted-chain.json
```

If the binary is already built, its invocation is
`cc-verify <writ.json> [--chain <trusted-chain.json>]`. No network request is
made by the CLI. Success prints `VerifiedCast` JSON; compare its seal and winners.
Failure prints `Unverified` to stderr, emits no cast and exits 2. Keep
**streamer-controlled** as the label for commit/reveal even when it verifies.
Sources: [CLI behavior](../../crates/cc-verify/src/main.rs),
[verification algorithm](../../crates/cc-verify/README.md).

A quicknet writ needs an independent trusted chain file with exactly `hash`,
`public_key`, `genesis_time`, `period_s` and `scheme`. Follow the canonical field
formats in the [chain-file specification](../../crates/cc-verify/README.md).
Confirm the chain hash, public key and schedule together from an independent
source; do not copy the trust anchor from the writ you are checking. Missing
trust, a wrong signature, modified entries or substituted winners fail closed.

## Single-file web verifier

Open [packages/verifier-web/index.html](../../packages/verifier-web/index.html)
from disk in a browser with Web Crypto support. It is self-contained, uses no
CDN and makes no network call. Its bundled examples have simulated entry pools:
a streamer-controlled draw, a test-key beacon draw and three draws using real
public quicknet signatures. A working example is not live Twitch evidence.
Source: [web behavior](../../packages/verifier-web/README.md).

Use the page's writ file control to choose your JSON file, at most **2 MiB**.
Import stays offline. The verifier validates its schema, recomputes the seal
and winners, and verifies the beacon signature against the independently
bundled official quicknet anchor for official-chain imports. It does not trust
an anchor supplied in the imported writ. Check the displayed outcome and seal;
malformed, oversized, unreadable or tampered files show **REJECTED**. A beacon
proof without a separate applicable anchor is **UNVERIFIED**, not a pass.
Source: [web verification/import limits](../../packages/verifier-web/README.md).

The web package README describes the current file control; the Rust README's
older statement that browser import is disabled is historical. The current
implementation and import tests are in
[page.ts](../../packages/verifier-web/src/page.ts) and the
[web package](../../packages/verifier-web/README.md). For a different trusted
chain, use the CLI with an independently checked chain file rather than treating
the web page's bundled official anchor as universal.
