mod common;
use cc_engine::{
    AnswerShape, Call, Engine, EngineClass, Failure, NoKeychain, Outcome, Prices, Route, Transport,
};
use cc_store::{LedgerKind, Store};
use cc_types::Verdict;

#[tokio::test]
async fn custom_array_shape_keeps_default_verdict_validation_and_audit() {
    let array = r#"["simulated"]"#;
    let mut responses: Vec<_> = ["pass", "hold", "bar", "bar", "pass", "hold"]
        .into_iter()
        .map(|v| (200, common::local_answer(v)))
        .collect();
    responses.extend([array, array, "invalid", array].into_iter().map(|text| {
        (200, serde_json::json!({"model":"simulated-served", "choices":[{"message":{"content":text},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":20}}).to_string())
    }));
    let server = common::Server::new(responses);
    let root = tempfile::tempdir().unwrap();
    let mut store = Store::open(root.path()).unwrap();
    let settings = common::settings("codex_cli", &server.endpoint);
    let evidence = cc_engine::measure_floor(
        &settings,
        &common::model(),
        &cc_engine::simulated_bank(),
        &mut store,
    )
    .await
    .unwrap()
    .evidence;
    let mut routes = common::table();
    routes
        .set(Route {
            class: EngineClass::Live,
            model: common::model(),
            transport: Transport::Endpoint,
            prices: Prices::default(),
            evidence: Some(evidence),
        })
        .unwrap();
    let engine = Engine::new(&settings, routes, None).unwrap();
    let call = || Call {
        class: EngineClass::Live,
        prompt: "simulated",
        rules_verdict: Some(Verdict::Hold),
    };
    let default = engine
        .complete(call(), &mut store, &NoKeychain, None)
        .await
        .unwrap();
    assert!(matches!(
        default.outcome,
        Outcome::RulesOnly {
            reason: Failure::Parse,
            ..
        }
    ));
    let validate = |text: &str| serde_json::from_str::<Vec<String>>(text).is_ok();
    let shape = AnswerShape::Custom(&validate);
    let custom = engine
        .complete_with_shape(call(), &mut store, &NoKeychain, None, shape)
        .await
        .unwrap();
    assert!(matches!(custom.outcome, Outcome::Model {ref text} if text == array));
    let malformed = engine
        .complete_with_shape(call(), &mut store, &NoKeychain, None, shape)
        .await
        .unwrap();
    assert!(matches!(
        malformed.outcome,
        Outcome::RulesOnly {
            reason: Failure::Parse,
            ..
        }
    ));
    let rows = store.read_ledger(LedgerKind::Engine).unwrap();
    assert_eq!(rows.len(), 9);
    {
        let requests = server.requests.lock().unwrap();
        assert!(requests[6].contains("json_object"));
        assert!(!requests[7].contains("response_format"));
    }
    std::fs::write(
        root.path().join("engine.jsonl"),
        "simulated audit corruption",
    )
    .unwrap();
    assert!(matches!(
        engine
            .complete_with_shape(call(), &mut store, &NoKeychain, None, shape)
            .await,
        Err(Failure::Audit)
    ));
}
