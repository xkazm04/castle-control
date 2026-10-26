//! Canonical JSON fingerprints, including resolved contents rather than labels.
use crate::drill::JudgeIdentity;
use crate::simulation::RuleBank;
use crate::{Result, internal, sha256};
use cc_types::{DrillConfiguration, DrillInstrument, InstrumentHash};
use serde::Serialize;
use serde_json::Value;
use std::collections::BTreeMap;

fn encode(value: &Value, out: &mut String) -> Result<()> {
    match value {
        Value::Object(map) => {
            out.push('{');
            for (i, (key, value)) in map
                .iter()
                .collect::<BTreeMap<_, _>>()
                .into_iter()
                .enumerate()
            {
                if i != 0 {
                    out.push(',');
                }
                out.push_str(&serde_json::to_string(key).map_err(internal)?);
                out.push(':');
                encode(value, out)?;
            }
            out.push('}');
        }
        Value::Array(values) => {
            out.push('[');
            for (i, value) in values.iter().enumerate() {
                if i != 0 {
                    out.push(',');
                }
                encode(value, out)?;
            }
            out.push(']');
        }
        _ => out.push_str(&serde_json::to_string(value).map_err(internal)?),
    }
    Ok(())
}

pub(crate) fn hash(value: &impl Serialize) -> Result<InstrumentHash> {
    let mut canonical = String::new();
    encode(
        &serde_json::to_value(value).map_err(internal)?,
        &mut canonical,
    )?;
    sha256::digest(canonical.as_bytes())
        .try_into()
        .map_err(internal)
}

pub(crate) fn instrument(
    config: &DrillConfiguration,
    bank: &RuleBank,
    judge: &JudgeIdentity,
) -> Result<(DrillInstrument, InstrumentHash)> {
    let instrument = DrillInstrument {
        rules_hash: hash(&config.rules)?,
        bank_hash: hash(bank)?,
        judge_hash: hash(judge)?,
        prompts_hash: hash(&(
            "offline-replay-v1",
            crate::classifier::SYSTEM,
            &config.prompts,
            [
                include_str!("drill.rs"),
                include_str!("drill_evaluate.rs"),
                include_str!("drill_report.rs"),
                include_str!("rules.rs"),
                include_str!("classifier.rs"),
            ]
            .map(|source| sha256::digest(source.replace("\r\n", "\n").as_bytes())),
        ))?,
    };
    let digest = hash(&instrument)?;
    Ok((instrument, digest))
}
