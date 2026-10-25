//! Capability floor: exact structured verdicts and independent latency evidence.
use crate::{
    Endpoint, Evidence, Failure, Keychain, LatencySample, ModelName, Prices, Result, ledger::Audit,
};
use cc_store::{EngineClass, Store, Timestamp};
use cc_types::{Settings, Verdict, parse_engine_settings};
use serde::Deserialize;

pub struct FloorCase {
    pub prompt: String,
    pub expected: Verdict,
}
pub struct FloorReport {
    pub evidence: Evidence,
    pub failed: usize,
}
/// Synthetic instrument v1, never captured chat. Exact expected values judge output
/// format / instruction following; this is not a moderation-quality benchmark.
pub fn simulated_bank() -> Vec<FloorCase> {
    [Verdict::Pass, Verdict::Hold, Verdict::Bar, Verdict::Bar, Verdict::Pass, Verdict::Hold]
        .into_iter().map(|expected| {
            let expected_json = serde_json::to_string(&expected).expect("closed enum serializes");
            FloorCase { prompt: format!("Simulated capability-floor v1. Return exactly one JSON object, no extra keys: {{\"verdict\":{expected_json}}}"), expected }
        }).collect()
}
pub(crate) fn verdict(text: &str) -> Result<Verdict> {
    #[derive(Deserialize)]
    #[serde(deny_unknown_fields)]
    struct Structured {
        verdict: Verdict,
    }
    serde_json::from_str::<Structured>(text)
        .map(|v| v.verdict)
        .map_err(|_| Failure::Parse)
}
/// Deliberate measurement bypasses admission (it is what creates the evidence).
/// Every case is still audited. It uses the same endpoint and parser as live calls.
pub async fn measure_floor(
    settings: &Settings,
    model: &ModelName,
    cases: &[FloorCase],
    store: &mut Store,
) -> Result<FloorReport> {
    if cases.is_empty() {
        return Err(Failure::Invalid);
    }
    let settings = parse_engine_settings(settings).map_err(|_| Failure::Invalid)?;
    let endpoint = Endpoint::new(&settings)?;
    // Owner instrument is local-only. No cloud key or cloud request can slip in here.
    if endpoint.provider() != cc_store::EngineProvider::LocalEndpoint {
        return Err(Failure::CloudOptIn);
    }
    measure(&endpoint, model, cases, store, Prices::default(), None).await
}
/// Optional cloud calibration, behind the same opt-in and keychain door as calls.
/// The owner command above deliberately remains local-only. This is a Rust API,
/// not a new settings key, method identifier or wire format.
#[allow(clippy::too_many_arguments)]
pub async fn measure_floor_with_key(
    settings: &Settings,
    model: &ModelName,
    cases: &[FloorCase],
    store: &mut Store,
    prices: Prices,
    key_label: Option<&str>,
    vault: &dyn Keychain,
) -> Result<FloorReport> {
    let settings = parse_engine_settings(settings).map_err(|_| Failure::Invalid)?;
    let endpoint = Endpoint::new(&settings)?;
    if !endpoint.authorized() {
        return Err(Failure::CloudOptIn);
    }
    let key = if endpoint.provider() == cc_store::EngineProvider::OpenaiApi {
        Some(vault.load(key_label.ok_or(Failure::Auth)?)?)
    } else {
        None
    };
    measure(&endpoint, model, cases, store, prices, key.as_deref()).await
}
async fn measure(
    endpoint: &Endpoint,
    model: &ModelName,
    cases: &[FloorCase],
    store: &mut Store,
    prices: Prices,
    key: Option<&str>,
) -> Result<FloorReport> {
    if cases.is_empty() {
        return Err(Failure::Invalid);
    }
    let mut samples = Vec::new();
    let mut correct = 0;
    let mut served = None;
    let mut drifted = false;
    for case in cases {
        let at = Timestamp::now();
        let started = std::time::Instant::now();
        let result = endpoint
            .complete(model, &case.prompt, prices, key, 5_000)
            .await;
        let mut audit = Audit {
            call_id: ulid::Ulid::new(),
            at,
            class: EngineClass::Offline,
            provider: endpoint.provider(),
            model_selected: model.clone(),
            model_served: None,
            cost_microusd: 0,
        };
        let sample = match result {
            Ok(answer) => {
                if served
                    .as_ref()
                    .is_some_and(|model| Some(model) != answer.model_served.as_ref())
                {
                    drifted = true;
                }
                if served.is_none() {
                    served = answer.model_served.clone();
                }
                correct += usize::from(verdict(&answer.text).is_ok_and(|v| v == case.expected));
                audit.model_served = answer.model_served;
                audit.cost_microusd = answer.cost_microusd;
                LatencySample {
                    total_ms: answer.total_ms,
                    longest_silence_ms: answer.longest_silence_ms,
                }
            }
            Err(_) => {
                let ms = started.elapsed().as_millis() as u64;
                LatencySample {
                    total_ms: ms,
                    longest_silence_ms: ms,
                }
            }
        };
        audit.append(store)?;
        samples.push(sample);
    }
    if drifted {
        correct = 0;
    }
    let mut evidence = Evidence::measure(&samples, correct, cases.len())?;
    evidence.identity = Some((model.clone(), endpoint.identity().into()));
    evidence.served_model = served;
    Ok(FloorReport {
        evidence,
        failed: cases.len() - correct,
    })
}
