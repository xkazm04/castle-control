mod common;
use cc_engine::{
    Call, Engine, EngineClass, Evidence, Failure, LatencySample, NoKeychain, Outcome, Prices,
    Route, Transport, measure_floor, simulated_bank,
};
use cc_store::{LedgerKind, Store};
use cc_types::Verdict;

#[test]
fn admission_checks_tail_latency_longest_silence_and_capability_floor() {
    let mut samples = vec![
        LatencySample {
            total_ms: 100,
            longest_silence_ms: 100
        };
        20
    ];
    assert!(
        Evidence::measure(&samples, 20, 20)
            .unwrap()
            .admits(EngineClass::Live)
    );
    samples[0].total_ms = 4_000;
    samples[1].total_ms = 4_000;
    assert!(
        !Evidence::measure(&samples, 20, 20)
            .unwrap()
            .admits(EngineClass::Live)
    );
    assert!(
        Evidence::measure(&samples, 20, 20)
            .unwrap()
            .admits(EngineClass::NearLive)
    );
    samples[0].longest_silence_ms = 3_001;
    assert!(
        !Evidence::measure(&samples, 20, 20)
            .unwrap()
            .admits(EngineClass::NearLive)
    );
    assert!(
        !Evidence::measure(&samples, 19, 20)
            .unwrap()
            .admits(EngineClass::Batch)
    );
    assert!(Evidence::measure(&[], 0, 0).is_err());
}

#[tokio::test]
async fn capability_floor_measures_fake_endpoint_and_audits_each_case() {
    let responses = ["pass", "hold", "bar", "bar", "pass", "hold"]
        .into_iter()
        .map(|v| (200, common::local_answer(v)))
        .collect();
    let server = common::Server::new(responses);
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(dir.path()).unwrap();
    let report = measure_floor(
        &common::settings("claude_cli", &server.endpoint),
        &common::model(),
        &simulated_bank(),
        &mut store,
    )
    .await
    .unwrap();
    assert_eq!(report.failed, 0);
    assert!(report.evidence.admits(EngineClass::Live));
    assert_eq!(store.read_ledger(LedgerKind::Engine).unwrap().len(), 6);
    for request in server.requests.lock().unwrap().iter() {
        assert!(request.starts_with("POST /v1/chat/completions "));
        assert!(request.contains("Simulated capability-floor"));
        assert!(!request.to_ascii_lowercase().contains("authorization:"));
    }
}

#[tokio::test]
async fn malformed_wrong_and_unavailable_floor_cases_fail_closed() {
    let mut responses = vec![(200, common::local_answer("pass")); 4];
    responses.extend([(200, "{}".into()), (503, "{}".into())]);
    let server = common::Server::new(responses);
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(dir.path()).unwrap();
    let report = measure_floor(
        &common::settings("codex_cli", &server.endpoint),
        &common::model(),
        &simulated_bank(),
        &mut store,
    )
    .await
    .unwrap();
    assert_eq!(report.evidence.structured_correct, 1);
    assert_eq!(report.failed, 5);
    assert!(!report.evidence.admits(EngineClass::Live));
    assert_eq!(store.read_ledger(LedgerKind::Engine).unwrap().len(), 6);
}

#[tokio::test]
async fn measured_evidence_cannot_admit_another_endpoint_or_model() {
    let responses = ["pass", "hold", "bar", "bar", "pass", "hold"]
        .into_iter()
        .map(|v| (200, common::local_answer(v)))
        .collect();
    let source = common::Server::new(responses);
    let target = common::Server::new(vec![]);
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(dir.path()).unwrap();
    let evidence = measure_floor(
        &common::settings("claude_cli", &source.endpoint),
        &common::model(),
        &simulated_bank(),
        &mut store,
    )
    .await
    .unwrap()
    .evidence;
    let mut table = common::table();
    table
        .set(Route {
            class: EngineClass::Live,
            model: common::model(),
            transport: Transport::Endpoint,
            prices: Prices::default(),
            evidence: Some(evidence),
        })
        .unwrap();
    let engine = Engine::new(
        &common::settings("codex_cli", &target.endpoint),
        table,
        None,
    )
    .unwrap();
    let result = engine
        .complete(
            Call {
                class: EngineClass::Live,
                prompt: "simulated",
                rules_verdict: Some(Verdict::Hold),
            },
            &mut store,
            &NoKeychain,
            None,
        )
        .await
        .unwrap();
    assert!(matches!(
        result.outcome,
        Outcome::RulesOnly {
            reason: Failure::NotAdmitted,
            ..
        }
    ));
    assert!(target.requests.lock().unwrap().is_empty());
}

#[tokio::test]
async fn cloud_is_opt_in_and_arbitrary_remote_hosts_never_receive_calls() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(dir.path()).unwrap();
    for endpoint in [
        "https://api.openai.com/v1",
        "https://example.invalid/v1",
        "http://192.0.2.1/v1",
    ] {
        let engine = Engine::new(
            &common::settings("codex_cli", endpoint),
            common::table(),
            None,
        )
        .unwrap();
        let result = engine
            .complete(
                Call {
                    class: EngineClass::Live,
                    prompt: "simulated",
                    rules_verdict: Some(Verdict::Pass),
                },
                &mut store,
                &NoKeychain,
                None,
            )
            .await
            .unwrap();
        assert!(matches!(
            result.outcome,
            Outcome::RulesOnly {
                reason: Failure::CloudOptIn,
                ..
            }
        ));
    }
}

#[tokio::test]
async fn changed_served_model_requires_new_floor_reading() {
    let mut responses: Vec<_> = ["pass", "hold", "bar", "bar", "pass", "hold"]
        .into_iter()
        .map(|v| (200, common::local_answer(v)))
        .collect();
    responses.push((
        200,
        common::local_answer("pass").replace("simulated-served", "simulated-changed"),
    ));
    let server = common::Server::new(responses);
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(dir.path()).unwrap();
    let settings = common::settings("claude_cli", &server.endpoint);
    let evidence = measure_floor(&settings, &common::model(), &simulated_bank(), &mut store)
        .await
        .unwrap()
        .evidence;
    let mut table = common::table();
    table
        .set(Route {
            class: EngineClass::Live,
            model: common::model(),
            transport: Transport::Endpoint,
            prices: Prices::default(),
            evidence: Some(evidence),
        })
        .unwrap();
    let engine = Engine::new(&settings, table, None).unwrap();
    let result = engine
        .complete(
            Call {
                class: EngineClass::Live,
                prompt: "simulated",
                rules_verdict: Some(Verdict::Hold),
            },
            &mut store,
            &NoKeychain,
            None,
        )
        .await
        .unwrap();
    assert!(matches!(
        result.outcome,
        Outcome::RulesOnly {
            reason: Failure::NotAdmitted,
            ..
        }
    ));
}
