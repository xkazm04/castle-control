//! Simulated floor-wire instrument shared by fixtures and owner-only live twins.
#![allow(dead_code)]
use cc_engine::{FloorCase, FloorReport, ModelName, measure_floor, simulated_bank};
use cc_store::{LedgerKind, LedgerLine, Store};
use cc_types::{DataValue, Settings, Verdict};

pub const LIVE_GUARD: &str =
    "live floor disabled: CC_LIVE_FLOOR must be exactly 1; no endpoint request was made";

pub struct Target {
    pub settings: Settings,
    pub model: ModelName,
}

pub fn target(url: &str, model: &str) -> Result<Target, &'static str> {
    let parsed = reqwest::Url::parse(url).map_err(|_| "invalid local floor URL")?;
    let loopback = parsed
        .host_str()
        .and_then(|host| {
            host.trim_matches(['[', ']'])
                .parse::<std::net::IpAddr>()
                .ok()
        })
        .is_some_and(|ip| ip.is_loopback());
    if !loopback {
        return Err("live floor requires a literal loopback IP URL; DNS/cloud refused");
    }
    let settings = Settings {
        values: [("engine.live_endpoint".into(), DataValue::String(url.into()))].into(),
    };
    cc_types::parse_engine_settings(&settings).map_err(|_| "invalid local floor settings")?;
    let model = ModelName::parse(model).map_err(|_| "invalid local floor model ID")?;
    Ok(Target { settings, model })
}

pub fn guarded_target(
    flag: Option<&str>,
    url: Option<&str>,
    model: Option<&str>,
) -> Result<Target, &'static str> {
    if flag != Some("1") {
        return Err(LIVE_GUARD);
    }
    target(
        url.ok_or("CC_LIVE_FLOOR_URL is required; use a literal loopback /v1 URL")?,
        model
            .ok_or("CC_LIVE_FLOOR_MODEL is required; copy the loaded model ID from the runtime")?,
    )
}

pub fn live_target() -> Target {
    let flag = std::env::var("CC_LIVE_FLOOR").ok();
    // Refuse before reading endpoint/model variables or opening a measurement store.
    assert!(flag.as_deref() == Some("1"), "{LIVE_GUARD}");
    let url = std::env::var("CC_LIVE_FLOOR_URL").ok();
    let model = std::env::var("CC_LIVE_FLOOR_MODEL").ok();
    guarded_target(flag.as_deref(), url.as_deref(), model.as_deref())
        .unwrap_or_else(|message| panic!("{message}"))
}

pub async fn reading(target: &Target, cases: &[FloorCase]) -> (FloorReport, Vec<LedgerLine>) {
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(dir.path()).unwrap();
    let report = measure_floor(&target.settings, &target.model, cases, &mut store)
        .await
        .expect("local floor measurement failed before producing a report");
    let rows = store.read_ledger(LedgerKind::Engine).unwrap();
    assert_eq!(rows.len(), cases.len());
    assert!(store.read_ledger(LedgerKind::Decisions).unwrap().is_empty());
    assert!(store.read_ledger(LedgerKind::Draws).unwrap().is_empty());
    (report, rows)
}

pub async fn live_bank() -> (FloorReport, Vec<LedgerLine>) {
    let target = live_target();
    reading(&target, &simulated_bank()).await
}

pub fn structured(report: &FloorReport) {
    assert_eq!(report.evidence.samples, simulated_bank().len());
    assert_eq!(report.failed, 0, "simulated floor cases failed");
    assert_eq!(report.evidence.structured_correct, report.evidence.samples);
}

pub fn case(content: &str) -> FloorCase {
    FloorCase {
        prompt: format!(
            "Simulated capability-floor negative wire probe. Return exactly this JSON object, no extra keys: {content}"
        ),
        expected: Verdict::Pass,
    }
}
