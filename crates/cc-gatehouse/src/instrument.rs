//! Canonical JSON fingerprints, including resolved contents rather than labels.
use crate::drill::JudgeIdentity;
use crate::simulation::RuleBank;
use crate::{Result, internal, sha256};
use cc_types::{DrillConfiguration, DrillInstrument, GatehouseInstrumentInputs, InstrumentHash};
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
    let inputs = inputs(config, bank, judge)?;
    let instrument = DrillInstrument {
        rules_hash: hash(&config.rules)?,
        bank_hash: hash(&inputs.bank)?,
        judge_hash: hash(&inputs.judge)?,
        prompts_hash: hash(&inputs.prompts)?,
    };
    let digest = hash(&instrument)?;
    Ok((instrument, digest))
}

pub(crate) fn inputs(
    config: &DrillConfiguration,
    bank: &RuleBank,
    judge: &JudgeIdentity,
) -> Result<GatehouseInstrumentInputs> {
    Ok(GatehouseInstrumentInputs {
        bank: cc_types::GatehouseInstrumentBank {
            label: bank.label.clone(),
            calibration: bank.calibration.clone().try_into().map_err(internal)?,
            cases: bank
                .cases
                .iter()
                .map(|case| {
                    Ok(cc_types::GatehouseInstrumentCase {
                        key: case.key.clone().try_into().map_err(internal)?,
                        text: case.text.clone().try_into().map_err(internal)?,
                        expected: match case.expected {
                            crate::simulation::Expectation::Allow => {
                                cc_types::GatehouseInstrumentExpectation::Allow
                            }
                            crate::simulation::Expectation::Action(action) => {
                                cc_types::GatehouseInstrumentExpectation::Action(action)
                            }
                        },
                    })
                })
                .collect::<Result<_>>()?,
        },
        judge: serde_json::from_value(serde_json::to_value(judge).map_err(internal)?)
            .map_err(internal)?,
        prompts: cc_types::GatehouseInstrumentPrompts {
            version: "live-shadow-and-replay-v1"
                .to_owned()
                .try_into()
                .map_err(internal)?,
            system: crate::classifier::SYSTEM
                .to_owned()
                .try_into()
                .map_err(internal)?,
            prompts: config.prompts.clone(),
            sources: [
                ("drill.rs", include_str!("drill.rs")),
                ("drill_evaluate.rs", include_str!("drill_evaluate.rs")),
                ("drill_report.rs", include_str!("drill_report.rs")),
                ("rules.rs", include_str!("rules.rs")),
                ("classifier.rs", include_str!("classifier.rs")),
                ("lane.rs", include_str!("lane.rs")),
                ("live_capture.rs", include_str!("live_capture.rs")),
                ("store.rs", include_str!("store.rs")),
            ]
            .into_iter()
            .map(|(name, source)| {
                Ok((
                    name.to_owned(),
                    sha256::digest(source.replace("\r\n", "\n").as_bytes())
                        .try_into()
                        .map_err(internal)?,
                ))
            })
            .collect::<Result<_>>()?,
        },
    })
}
