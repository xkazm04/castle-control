//! Offline draw proof core; this format is not a lots RPC contract.
//!
//! # Byte-exact v1 algorithm
//! Handles are lowercase ASCII `[a-z0-9_]`, 1..=25 bytes, unique and sorted
//! lexicographically. Each entry has a positive u32 weight. There are 1..=10,000
//! entries; winner_count is 1..=entry_count. Selection is weighted without
//! replacement (cohort/cooldown eligibility must already have been resolved).
//!
//! Seal bytes concatenate `castle-control/seal/v1\0`, entry_count as u32 BE,
//! then for each entry its byte length as u32 BE, handle bytes and weight as
//! u32 BE; then winner_count u32 BE, sealed_at's 20 ASCII bytes
//! (`YYYY-MM-DDTHH:MM:SSZ`), margin_s u32 BE, and the source commitment:
//! tag 0 + chain_hash's 32 bytes + round u64 BE for drand_quicknet;
//! tag 1 + commitment's 32 bytes for streamer_commit. The seal is SHA-256 of
//! these bytes. Version must be 1. Hex is lowercase, with no prefix; decimal
//! rounds are canonical strings without leading zeros. A drand round is the
//! first scheduled time STRICTLY AFTER sealed_at + margin_s. Round 1 occurs
//! at genesis_time; period is exactly three seconds. Margin must be positive.
//!
//! Quicknet signs SHA-256(round u64 BE), hashed to G1 with SHA-256 XMD and
//! DST `BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_`. The 48-byte compressed
//! signature is verified against a trusted 96-byte compressed G2 public key;
//! identity and non-subgroup points fail. Randomness is SHA-256(signature).
//! The trust anchor is supplied separately, NEVER taken from a writ.
//!
//! Offline commitment is SHA-256(`castle-control/commit/v1\0` + seed[32]).
//! Its label is always "streamer-controlled": the operator can select a seed
//! before committing or withhold it. This is not a public randomness beacon.
//!
//! Cast seed is SHA-256 of the concatenation of `castle-control/cast/v1\0`,
//! randomness[32], seal[32], and all canonical entry encodings above (without
//! entry_count). Randomness is
//! the verified round value or the revealed offline seed. At counter 0, hash
//! seed[32] + counter u64 BE; interpret its first 8 bytes as u64 BE. Increment
//! the counter for EVERY candidate, including rejections. With remaining total
//! weight n, reject x >= floor(2^64 / n)*n; otherwise use x modulo n to walk
//! cumulative weights in handle order. Remove that entire winning entry and
//! continue, preserving draw order. There is no animation RNG or winner setter.
//!
//! The seal (including count, schedule/source and weights) must be published
//! before the selected round/reveal. Rewriting both a writ and its seal cannot
//! prove a prior public announcement; compare against that external record.
//! `VerifiedCast` is the only verified output intended for an animation.

mod beacon;
mod cast;
mod model;
mod time;

pub use beacon::{BeaconRound, QuicknetChain, QuicknetClient};
pub use model::{Entry, SealedRoll, VerifiedCast, Writ, verify_writ_json};

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("invalid proof: {0}")]
    Invalid(&'static str),
    #[error("a separately trusted quicknet chain is required")]
    MissingTrust,
    #[error("invalid JSON proof")]
    Json(#[from] serde_json::Error),
    #[error("quicknet request failed")]
    Http(#[from] reqwest::Error),
}

pub(crate) fn hash(bytes: impl AsRef<[u8]>) -> [u8; 32] {
    use sha2::{Digest, Sha256};
    Sha256::digest(bytes).into()
}

pub(crate) fn unhex<const N: usize>(value: &str) -> Result<[u8; N], Error> {
    if value.len() != N * 2
        || !value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        return Err(Error::Invalid("noncanonical hex"));
    }
    let mut out = [0; N];
    hex::decode_to_slice(value, &mut out).map_err(|_| Error::Invalid("hex"))?;
    Ok(out)
}

pub(crate) fn round_number(value: &str) -> Result<u64, Error> {
    let n = value.parse::<u64>().map_err(|_| Error::Invalid("round"))?;
    if n == 0 || n.to_string() != value {
        return Err(Error::Invalid("noncanonical round"));
    }
    Ok(n)
}

#[cfg(test)]
mod tests;
