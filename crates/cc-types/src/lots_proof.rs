//! Wire projection of cc-verify/src/model.rs v1, with no extra writ fields.
//! Parsing establishes shape, never cryptographic validity. Use cc-verify for that.
use crate::{LotsHandle, LotsHex32, LotsProofTime, LotsRound, LotsSignature};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::num::NonZeroU32;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct LotsProofEntry {
    pub handle: LotsHandle,
    #[schemars(range(min = 1))]
    pub weight: NonZeroU32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "source", deny_unknown_fields)]
pub enum LotsRandomnessPlan {
    #[serde(rename = "drand_quicknet")]
    Drand {
        chain_hash: LotsHex32,
        round: LotsRound,
    },
    #[serde(rename = "streamer_commit")]
    Streamer { commitment: LotsHex32 },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "source", deny_unknown_fields)]
pub enum LotsProof {
    #[serde(rename = "drand_quicknet")]
    Drand {
        signature: LotsSignature,
        randomness: LotsHex32,
    },
    #[serde(rename = "streamer_commit")]
    Streamer { seed: LotsHex32 },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct LotsProofRoll {
    pub version: LotsProofVersion,
    #[serde(deserialize_with = "entries")]
    #[schemars(length(min = 1, max = 10000))]
    pub entries: Vec<LotsProofEntry>,
    #[schemars(range(min = 1))]
    pub winner_count: NonZeroU32,
    pub sealed_at: LotsProofTime,
    #[schemars(range(min = 1))]
    pub margin_s: NonZeroU32,
    pub randomness: LotsRandomnessPlan,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(try_from = "u8", into = "u8")]
#[schemars(with = "u8", extend("const" = 1))]
pub struct LotsProofVersion;
impl TryFrom<u8> for LotsProofVersion {
    type Error = &'static str;
    fn try_from(value: u8) -> Result<Self, Self::Error> {
        if value == 1 {
            Ok(Self)
        } else {
            Err("unsupported writ version")
        }
    }
}
impl From<LotsProofVersion> for u8 {
    fn from(_: LotsProofVersion) -> Self {
        1
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct LotsSealedRoll {
    pub roll: LotsProofRoll,
    pub seal: LotsHex32,
}

/// Exactly the JSON written and verified by cc-verify, without RPC IDs inside it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct LotsWrit {
    pub roll: LotsProofRoll,
    pub seal: LotsHex32,
    pub proof: LotsProof,
    #[serde(deserialize_with = "winners")]
    #[schemars(length(min = 1, max = 10000))]
    pub winners: Vec<LotsHandle>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub enum LotsCastLabel {
    #[serde(rename = "drand-quicknet")]
    DrandQuicknet,
    #[serde(rename = "streamer-controlled")]
    StreamerControlled,
}

/// A projection of VerifiedCast; the owning service must verify before emitting.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct LotsVerifiedCast {
    pub seal: LotsHex32,
    #[serde(deserialize_with = "winners")]
    #[schemars(length(min = 1, max = 10000))]
    pub winners: Vec<LotsHandle>,
    pub label: LotsCastLabel,
}

fn bounded<'de, D, T>(deserializer: D) -> Result<Vec<T>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    let values = Vec::<T>::deserialize(deserializer)?;
    if (1..=10000).contains(&values.len()) {
        Ok(values)
    } else {
        Err(serde::de::Error::custom("expected 1..=10000 entries"))
    }
}
fn entries<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Vec<LotsProofEntry>, D::Error> {
    bounded(deserializer)
}
fn winners<'de, D: serde::Deserializer<'de>>(deserializer: D) -> Result<Vec<LotsHandle>, D::Error> {
    bounded(deserializer)
}
