//! WP 2.2 scaffold for quicknet round signatures and draw proof verification.
//!
//! Uses zkcrypto's pure-Rust bls12_381 0.8.0 with `experimental` hash-to-curve:
//! G1 hashing with SHA-256 XMD and pairings support quicknet's
//! bls-unchained-g1-rfc9380 scheme without a C toolchain on Windows MSVC.
//! The sha2_09 alias supplies its digest 0.9 API; sha2 0.10 hashes proof data.

#[test]
fn scaffold_is_registered() {
    assert_eq!(env!("CARGO_PKG_NAME"), "cc-verify");
}
