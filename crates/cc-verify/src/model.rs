use crate::{BeaconRound, Error, QuicknetChain, cast, hash, round_number, time::timestamp, unhex};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Entry {
    pub handle: String,
    pub weight: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "source", deny_unknown_fields)]
enum Plan {
    #[serde(rename = "drand_quicknet")]
    Drand { chain_hash: String, round: String },
    #[serde(rename = "streamer_commit")]
    Streamer { commitment: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Roll {
    version: u8,
    entries: Vec<Entry>,
    winner_count: u32,
    sealed_at: String,
    margin_s: u32,
    randomness: Plan,
}

impl Roll {
    fn canonical(&self) -> Result<Vec<u8>, Error> {
        if self.version != 1
            || self.entries.is_empty()
            || self.entries.len() > 10000
            || self.winner_count == 0
            || self.winner_count as usize > self.entries.len()
            || self.margin_s == 0
        {
            return Err(Error::Invalid("roll bounds/version"));
        }
        timestamp(&self.sealed_at)?;
        let mut previous = "";
        for entry in &self.entries {
            if entry.handle.is_empty()
                || entry.handle.len() > 25
                || entry.weight == 0
                || !entry
                    .handle
                    .bytes()
                    .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_')
                || entry.handle.as_str() <= previous
            {
                return Err(Error::Invalid(
                    "entries must be unique, canonical and sorted",
                ));
            }
            previous = &entry.handle;
        }
        let mut bytes = b"castle-control/seal/v1\0".to_vec();
        bytes.extend((self.entries.len() as u32).to_be_bytes());
        bytes.extend(cast::entry_bytes(&self.entries));
        bytes.extend(self.winner_count.to_be_bytes());
        bytes.extend(self.sealed_at.as_bytes());
        bytes.extend(self.margin_s.to_be_bytes());
        match &self.randomness {
            Plan::Drand { chain_hash, round } => {
                bytes.push(0);
                bytes.extend(unhex::<32>(chain_hash)?);
                bytes.extend(round_number(round)?.to_be_bytes());
            }
            Plan::Streamer { commitment } => {
                bytes.push(1);
                bytes.extend(unhex::<32>(commitment)?);
            }
        }
        Ok(bytes)
    }
}

/// An owned snapshot. Only construction before sealing can set entries or count.
#[derive(Debug, Clone, Serialize)]
pub struct SealedRoll {
    roll: Roll,
    seal: String,
}

impl SealedRoll {
    fn new(
        mut entries: Vec<Entry>,
        winner_count: u32,
        sealed_at: String,
        margin_s: u32,
        randomness: Plan,
    ) -> Result<Self, Error> {
        entries.sort_by(|a, b| a.handle.cmp(&b.handle));
        let roll = Roll {
            version: 1,
            entries,
            winner_count,
            sealed_at,
            margin_s,
            randomness,
        };
        let seal = hex::encode(hash(roll.canonical()?));
        Ok(Self { roll, seal })
    }

    pub fn quicknet(
        entries: Vec<Entry>,
        winner_count: u32,
        sealed_at: String,
        margin_s: u32,
        chain: &QuicknetChain,
    ) -> Result<Self, Error> {
        let round = chain.round_after(&sealed_at, margin_s)?;
        let plan = Plan::Drand {
            chain_hash: chain.chain_hash().into(),
            round,
        };
        Self::new(entries, winner_count, sealed_at, margin_s, plan)
    }

    /// Commit before sealing; the revealed seed must have exactly 32 bytes.
    pub fn commitment(seed: &[u8; 32]) -> String {
        let mut bytes = b"castle-control/commit/v1\0".to_vec();
        bytes.extend(seed);
        hex::encode(hash(bytes))
    }

    pub fn streamer(
        entries: Vec<Entry>,
        winner_count: u32,
        sealed_at: String,
        margin_s: u32,
        commitment: String,
    ) -> Result<Self, Error> {
        Self::new(
            entries,
            winner_count,
            sealed_at,
            margin_s,
            Plan::Streamer { commitment },
        )
    }

    pub fn seal(&self) -> &str {
        &self.seal
    }

    pub fn to_json(&self) -> Result<String, Error> {
        Ok(serde_json::to_string(self)?)
    }

    pub(crate) fn selected_round(&self, chain: &QuicknetChain) -> Result<&str, Error> {
        match &self.roll.randomness {
            Plan::Drand { chain_hash, round }
                if chain_hash == chain.chain_hash()
                    && *round == chain.round_after(&self.roll.sealed_at, self.roll.margin_s)? =>
            {
                Ok(round)
            }
            _ => Err(Error::Invalid("round schedule/chain")),
        }
    }

    pub fn finish_quicknet(
        &self,
        chain: &QuicknetChain,
        round: &BeaconRound,
    ) -> Result<Writ, Error> {
        if self.selected_round(chain)? != round.round {
            return Err(Error::Invalid("unexpected round"));
        }
        let randomness = chain.verify_round(round)?;
        self.finish(
            Proof::Drand {
                signature: round.signature.clone(),
                randomness: round.randomness.clone(),
            },
            randomness,
        )
    }

    pub fn finish_streamer(&self, seed: [u8; 32]) -> Result<Writ, Error> {
        match &self.roll.randomness {
            Plan::Streamer { commitment } if *commitment == Self::commitment(&seed) => self.finish(
                Proof::Streamer {
                    seed: hex::encode(seed),
                },
                seed,
            ),
            _ => Err(Error::Invalid("offline commitment mismatch")),
        }
    }

    fn finish(&self, proof: Proof, randomness: [u8; 32]) -> Result<Writ, Error> {
        let winners = cast::cast(
            &self.roll.entries,
            self.roll.winner_count,
            &self.seal,
            randomness,
        )?;
        Ok(Writ {
            roll: self.roll.clone(),
            seal: self.seal.clone(),
            proof,
            winners,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "source", deny_unknown_fields)]
enum Proof {
    #[serde(rename = "drand_quicknet")]
    Drand {
        signature: String,
        randomness: String,
    },
    #[serde(rename = "streamer_commit")]
    Streamer { seed: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Writ {
    roll: Roll,
    seal: String,
    proof: Proof,
    winners: Vec<String>,
}

impl Writ {
    pub fn to_json(&self) -> Result<String, Error> {
        Ok(serde_json::to_string(self)?)
    }

    fn verify(&self, chain: Option<&QuicknetChain>) -> Result<VerifiedCast, Error> {
        if unhex::<32>(&self.seal)? != hash(self.roll.canonical()?) {
            return Err(Error::Invalid("seal mismatch"));
        }
        let sealed = SealedRoll {
            roll: self.roll.clone(),
            seal: self.seal.clone(),
        };
        let (expected, label) = match (&self.roll.randomness, &self.proof) {
            (
                Plan::Drand { round, .. },
                Proof::Drand {
                    signature,
                    randomness,
                },
            ) => {
                let chain = chain.ok_or(Error::MissingTrust)?;
                let beacon = BeaconRound {
                    round: round.clone(),
                    signature: signature.clone(),
                    randomness: randomness.clone(),
                };
                (sealed.finish_quicknet(chain, &beacon)?, "drand-quicknet")
            }
            (Plan::Streamer { .. }, Proof::Streamer { seed }) => (
                sealed.finish_streamer(unhex::<32>(seed)?)?,
                "streamer-controlled",
            ),
            _ => return Err(Error::Invalid("source/proof mismatch")),
        };
        if self.winners != expected.winners {
            return Err(Error::Invalid("cast mismatch"));
        }
        Ok(VerifiedCast {
            seal: self.seal.clone(),
            winners: expected.winners,
            label,
        })
    }
}

/// All JSON writ input passes through this door, then full validation.
pub fn verify_writ_json(json: &str, chain: Option<&QuicknetChain>) -> Result<VerifiedCast, Error> {
    if json.len() > 2_000_000 {
        return Err(Error::Invalid("writ too large"));
    }
    let writ: Writ = serde_json::from_str(json)?;
    writ.verify(chain)
}

/// Only this result is intended to feed an animation; winners are read-only.
#[derive(Debug, Serialize)]
pub struct VerifiedCast {
    seal: String,
    winners: Vec<String>,
    label: &'static str,
}

impl VerifiedCast {
    pub fn winners(&self) -> &[String] {
        &self.winners
    }
    pub fn seal(&self) -> &str {
        &self.seal
    }
    pub fn label(&self) -> &str {
        self.label
    }
}
