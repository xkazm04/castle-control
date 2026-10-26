// SplitMix64 adapted from Shadowrunr OS @ 7e4b6f8,
// crates/shadowrunr-sim/src/rng.rs (Apache-2.0; see NOTICE).
//! Seeded offline chat, with assumed cadence/mix, never a real-room calibration.
use crate::{Result, date, internal};
use cc_types::{Action, GatehouseText, RecordedMessage, RecordingImportParams, Timestamp};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum Expectation {
    Allow,
    Action(Action),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BankCase {
    pub key: String,
    pub text: String,
    pub expected: Expectation,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RuleBank {
    pub label: GatehouseText,
    pub calibration: String,
    pub cases: Vec<BankCase>,
}

pub fn near_miss_bank() -> RuleBank {
    RuleBank {
        label: "simulated-near-misses-v1".to_owned().try_into().expect("static"),
        calibration: "simulated; assumed uniform case mix, one message/second; not population evidence".into(),
        cases: [
            ("roast", "Simulated requested roast: your strategy has the aim of a potato.", Expectation::Allow),
            ("dark-joke", "Simulated dark joke: my game character has booked a coffin for this boss fight.", Expectation::Allow),
            ("quote", "Simulated quotation: the villain says 'tagged threat' in the novel; discussing fiction.", Expectation::Allow),
            ("violation", "Simulated tagged threat against another viewer.", Expectation::Action(Action::Delete)),
        ].into_iter().map(|(key, text, expected)| BankCase { key: key.into(), text: text.into(), expected }).collect(),
    }
}

/// The seed travels as text at the public boundary. No clocks or model calls.
pub fn generate(
    seed: &str,
    count: u32,
    start: Timestamp,
    bank: &RuleBank,
) -> Result<RecordingImportParams> {
    let seed: u64 = seed.parse().map_err(internal)?;
    if bank.cases.is_empty() {
        return Err(internal("empty simulation bank"));
    }
    let mut state = seed ^ 0x9E37_79B9_7F4A_7C15;
    let start = date(&start)?;
    let mut messages = Vec::new();
    for i in 0..count {
        state = state.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = state;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^= z >> 31;
        let case = &bank.cases[(z % bank.cases.len() as u64) as usize];
        messages.push(RecordedMessage {
            message_id: format!("simulated-{seed}-{i}")
                .try_into()
                .map_err(internal)?,
            user_id: (100 + z % 20).to_string().try_into().map_err(internal)?,
            at: (start + chrono::TimeDelta::seconds(i64::from(i)))
                .with_timezone(&chrono::Utc)
                .to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
                .try_into()
                .map_err(internal)?,
            text: case.text.clone(),
        });
    }
    Ok(RecordingImportParams {
        source: format!("simulated seed={seed}; {}", bank.calibration)
            .try_into()
            .map_err(internal)?,
        messages,
        gaps: Vec::new(),
    })
}
