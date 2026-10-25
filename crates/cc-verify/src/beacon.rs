use crate::{Error, SealedRoll, hash, round_number, time::timestamp, unhex};
use bls12_381::hash_to_curve::{ExpandMsgXmd, HashToCurve};
use bls12_381::{G1Affine, G1Projective, G2Affine, pairing};
use serde::{Deserialize, Serialize};
use std::time::Duration;

pub(crate) const DST: &[u8] = b"BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_";

/// Operator-provided trust anchor, not self-attested data from a writ.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct QuicknetChain {
    hash: String,
    public_key: String,
    genesis_time: String,
    period_s: u32,
    scheme: String,
}

impl QuicknetChain {
    pub fn new(hash: String, public_key: String, genesis_time: String) -> Result<Self, Error> {
        let chain = Self {
            hash,
            public_key,
            genesis_time,
            period_s: 3,
            scheme: "bls-unchained-g1-rfc9380".into(),
        };
        chain.validate()?;
        Ok(chain)
    }

    pub fn from_json(json: &str) -> Result<Self, Error> {
        let chain: Self = serde_json::from_str(json)?;
        chain.validate()?;
        Ok(chain)
    }

    pub(crate) fn validate(&self) -> Result<(), Error> {
        unhex::<32>(&self.hash)?;
        self.key()?;
        timestamp(&self.genesis_time)?;
        if self.period_s != 3 || self.scheme != "bls-unchained-g1-rfc9380" {
            return Err(Error::Invalid("not the quicknet scheme"));
        }
        Ok(())
    }

    fn key(&self) -> Result<G2Affine, Error> {
        let key =
            Option::<G2Affine>::from(G2Affine::from_compressed(&unhex::<96>(&self.public_key)?))
                .ok_or(Error::Invalid("BLS public key"))?;
        if bool::from(key.is_identity()) {
            return Err(Error::Invalid("identity public key"));
        }
        Ok(key)
    }

    pub fn chain_hash(&self) -> &str {
        &self.hash
    }

    pub fn round_after(&self, sealed_at: &str, margin_s: u32) -> Result<String, Error> {
        self.validate()?;
        if margin_s == 0 {
            return Err(Error::Invalid("positive margin required"));
        }
        let after = timestamp(sealed_at)?
            .checked_add(u64::from(margin_s))
            .ok_or(Error::Invalid("time overflow"))?;
        let genesis = timestamp(&self.genesis_time)?;
        let round = if after < genesis {
            1
        } else {
            (after - genesis) / u64::from(self.period_s) + 2
        };
        Ok(round.to_string())
    }

    pub fn verify_round(&self, round: &BeaconRound) -> Result<[u8; 32], Error> {
        self.validate()?;
        let message = hash(round_number(&round.round)?.to_be_bytes());
        let hashed = <G1Projective as HashToCurve<ExpandMsgXmd<sha2_09::Sha256>>>::hash_to_curve(
            message, DST,
        );
        let encoded = unhex::<48>(&round.signature)?;
        let signature = Option::<G1Affine>::from(G1Affine::from_compressed(&encoded))
            .ok_or(Error::Invalid("BLS signature encoding"))?;
        if bool::from(signature.is_identity())
            || pairing(&signature, &G2Affine::generator())
                != pairing(&G1Affine::from(hashed), &self.key()?)
        {
            return Err(Error::Invalid("BLS signature verification failed"));
        }
        let randomness = hash(encoded);
        if unhex::<32>(&round.randomness)? != randomness {
            return Err(Error::Invalid("round randomness"));
        }
        Ok(randomness)
    }
}

/// Round numbers remain strings in the local proof format.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BeaconRound {
    pub round: String,
    pub signature: String,
    pub randomness: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct UpstreamRound {
    round: u64,
    signature: String,
    randomness: String,
    #[serde(default)]
    previous_signature: Option<String>,
}

/// HTTPS quicknet transport. Redirects are disabled; no trust is learned from HTTP.
pub struct QuicknetClient {
    client: reqwest::Client,
    chain: QuicknetChain,
}

impl QuicknetClient {
    pub fn new(chain: QuicknetChain) -> Result<Self, Error> {
        chain.validate()?;
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .redirect(reqwest::redirect::Policy::none())
            .build()?;
        Ok(Self { client, chain })
    }

    pub async fn fetch(&self, roll: &SealedRoll) -> Result<BeaconRound, Error> {
        let selected = roll.selected_round(&self.chain)?;
        let url = format!("https://api.drand.sh/{}/public/{selected}", self.chain.hash);
        let mut response = self.client.get(url).send().await?.error_for_status()?;
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await? {
            if bytes.len() + chunk.len() > 16384 {
                return Err(Error::Invalid("beacon response too large"));
            }
            bytes.extend(chunk);
        }
        let reply: UpstreamRound = serde_json::from_slice(&bytes)?;
        if reply.previous_signature.is_some_and(|s| !s.is_empty()) {
            return Err(Error::Invalid("chained signature is not quicknet"));
        }
        let round = BeaconRound {
            round: reply.round.to_string(),
            signature: reply.signature,
            randomness: reply.randomness,
        };
        if round.round != selected {
            return Err(Error::Invalid("unexpected round"));
        }
        self.chain.verify_round(&round)?;
        Ok(round)
    }
}
