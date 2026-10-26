//! LIVE twins of floor_wire.rs, opt-in only; all prompts remain simulated.
//! Every reading uses measure_floor (never measure_floor_with_key) and a temp Store.
mod floor_wire_support;

use cc_engine::{EngineClass, ModelName, simulated_bank};
use cc_store::{EngineProvider, LedgerEvent};
use floor_wire_support::{case, live_bank, live_target, reading, structured};

#[tokio::test]
#[ignore = "live: CC_LIVE_FLOOR=1"]
async fn live_local_only() {
    let target = live_target();
    let (report, rows) = reading(&target, &simulated_bank()).await;
    structured(&report);
    assert!(rows.iter().all(|row| matches!(
        row.event,
        LedgerEvent::Engine {
            provider: EngineProvider::LocalEndpoint,
            ..
        }
    )));
}

#[tokio::test]
#[ignore = "live: CC_LIVE_FLOOR=1"]
async fn live_request_shape() {
    let (report, _) = live_bank().await;
    // The actual runtime must accept the same production JSON-output request as the fixture.
    structured(&report);
}

#[tokio::test]
#[ignore = "live: CC_LIVE_FLOOR=1"]
async fn live_response_shape() {
    let (report, _) = live_bank().await;
    // Successful structured cases traverse the production response and verdict schema doors.
    structured(&report);
}

#[tokio::test]
#[ignore = "live: CC_LIVE_FLOOR=1"]
async fn live_usage_shape() {
    let (report, rows) = live_bank().await;
    structured(&report);
    // Response parsing requires usage even though the floor's local Prices are zero.
    assert!(rows.iter().all(|row| matches!(
        row.event,
        LedgerEvent::Engine {
            cost_microusd: 0,
            ..
        }
    )));
}

#[tokio::test]
#[ignore = "live: CC_LIVE_FLOOR=1"]
async fn live_latency_budgets() {
    let (report, _) = live_bank().await;
    structured(&report);
    eprintln!(
        "simulated-floor-v1 n={} correct={} failed={} p95_ms={} longest_silence_ms={} live_admitted={} near_live_admitted={}",
        report.evidence.samples,
        report.evidence.structured_correct,
        report.failed,
        report.evidence.p95_ms,
        report.evidence.longest_silence_ms,
        report.evidence.admits(EngineClass::Live),
        report.evidence.admits(EngineClass::NearLive)
    );
    assert!(
        report.evidence.admits(EngineClass::Live),
        "local model did not meet the existing live floor"
    );
    assert!(
        report.evidence.admits(EngineClass::NearLive),
        "local model did not meet the existing near_live floor"
    );
}

#[tokio::test]
#[ignore = "live: CC_LIVE_FLOOR=1"]
async fn live_measurement_timeout() {
    let (report, _) = live_bank().await;
    structured(&report);
    // Successful calls must finish inside the floor reader's existing per-case timeout.
    assert!(report.evidence.longest_silence_ms <= 5_000);
    assert_eq!(report.evidence.p95_ms, report.evidence.longest_silence_ms);
}

#[tokio::test]
#[ignore = "live: CC_LIVE_FLOOR=1"]
async fn live_model_identity() {
    let target = live_target();
    let (report, rows) = reading(&target, &simulated_bank()).await;
    structured(&report);
    let mut served = None;
    for row in rows {
        let LedgerEvent::Engine {
            model_selected,
            model_served,
            ..
        } = row.event
        else {
            panic!("expected floor audit");
        };
        assert_eq!(model_selected, target.model);
        let reported = model_served.expect("runtime must report a model ID");
        if let Some(previous) = &served {
            assert_eq!(
                previous, &reported,
                "served-model drift requires a fresh reading"
            );
        }
        served = Some(reported);
    }
}

#[tokio::test]
#[ignore = "live: CC_LIVE_FLOOR=1"]
async fn live_http_errors() {
    let mut target = live_target();
    // Ask the same runtime for an explicitly nonexistent ID; never auto-discover/pull a model.
    target.model = ModelName::parse(&format!("simulated-missing-{}", ulid::Ulid::new())).unwrap();
    let (report, rows) = reading(&target, &[case(r#"{"verdict":"pass"}"#)]).await;
    assert_eq!(report.failed, 1, "runtime must reject an unknown model ID");
    assert!(
        matches!(
            rows[0].event,
            LedgerEvent::Engine {
                model_served: None,
                ..
            }
        ),
        "unknown-model probe must fail at the endpoint, not return a substituted model"
    );
}

#[tokio::test]
#[ignore = "live: CC_LIVE_FLOOR=1"]
async fn live_refusal_shapes() {
    let target = live_target();
    // Harmless negative-format probe, not a request for unsafe content or a safety refusal.
    let (report, rows) = reading(&target, &[case(r#"{"refusal":"simulated"}"#)]).await;
    assert_eq!(
        report.failed, 1,
        "refusal-shaped content must never count as a verdict"
    );
    assert!(
        matches!(
            rows[0].event,
            LedgerEvent::Engine {
                model_served: Some(_),
                ..
            }
        ),
        "negative-format probe needs a parsed response; transport failure is not proof"
    );
}
