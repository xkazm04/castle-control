//! Generated, labelled shadow traffic only. No network, model or action executor.
use async_trait::async_trait;
use cc_core::{Registry, gatehouse::GatehouseModule};
use cc_gatehouse::{Classifier, ClassifierError, Gatehouse, IngestedMessage};
use cc_store::{SystemClock, TwitchUserId};
use cc_types::{ErrorCode, RulesUpsertParams, Timestamp, parse_request};
use serde_json::{Value, json};
use std::sync::Arc;

struct NoModel;
#[async_trait]
impl Classifier for NoModel {
    async fn classify(&self, _: &str, _: &str) -> Result<String, ClassifierError> {
        panic!("simulated rules-only capture must not call a model")
    }
}

fn message(index: usize) -> IngestedMessage {
    IngestedMessage {
        message_id: format!("simulated-capture-{index}").try_into().unwrap(),
        user_id: TwitchUserId::parse("123").unwrap(),
        login: "simulated_capture".into(),
        text: "Simulated tagged threat against another viewer.".into(),
        at: Timestamp::now(),
        simulated: true,
        metadata: None,
    }
}

fn rule(pattern: &str) -> RulesUpsertParams {
    serde_json::from_value(json!({"rule":{"rule_id":"simulated-pattern","name":"Simulated pattern",
        "rule_class":"pattern","mode":"shadow","action":"delete","delivery":"streamer","pattern":pattern}})).unwrap()
}

fn registry(root: &std::path::Path) -> Registry {
    let mut registry = Registry::default();
    registry
        .register(Arc::new(
            GatehouseModule::open(root, Arc::new(SystemClock)).unwrap(),
        ))
        .unwrap();
    registry
}

async fn call(
    registry: &Registry,
    method: &str,
    params: Value,
) -> Result<Value, cc_types::ErrorEnvelope> {
    let request =
        parse_request(&serde_json::to_vec(&json!({"method":method,"params":params})).unwrap())?;
    registry.dispatch(&request).await
}

#[tokio::test]
async fn retained_capture_survives_restart_and_rule_edits_and_controls_drill() {
    let dir = tempfile::tempdir().unwrap();
    let mut gate = Gatehouse::open(dir.path()).unwrap();
    gate.rules_upsert(rule("tagged threat")).unwrap();
    let screened = gate
        .capture_live_shadow(message(0), &NoModel, vec![])
        .await
        .unwrap();
    let decision_id = screened.decision.decision_id;
    assert!(screened.message.simulated);
    let saved_caches = gate.store().items(cc_store::DataStore::Caches).unwrap();
    let saved_ledger = gate
        .store()
        .read_ledger(cc_store::LedgerKind::Decisions)
        .unwrap();
    drop(gate);
    let registry = registry(dir.path());
    let page = call(&registry, "gatehouse.liveRun.get", json!({"limit":1}))
        .await
        .unwrap();
    assert_eq!(page["unavailable_count"], 0);
    let item = &page["items"][0];
    assert_eq!(item["decision_id"], decision_id.as_str());
    assert_eq!(item["provenance"], "simulated");
    assert_eq!(item["coverage"], "retained");
    let capture = &item["capture"];
    assert!(
        capture["recording"]
            .as_str()
            .unwrap()
            .starts_with("recording-")
    );
    assert!(capture["inputs"]["bank"]["cases"].as_array().unwrap().len() >= 4);
    assert_eq!(capture["inputs"]["judge"]["revision"], "rules-only-v1");
    assert_eq!(capture["from"], capture["to"]);
    assert!(capture.get("replay_gap").is_none());
    call(
        &registry,
        "gatehouse.rules.upsert",
        serde_json::to_value(rule("changed-simulated-pattern")).unwrap(),
    )
    .await
    .unwrap();
    let after = call(&registry, "gatehouse.liveRun.get", json!({"limit":1}))
        .await
        .unwrap();
    assert_eq!(
        after, page,
        "capture contents/hash must remain immutable after rule edits"
    );
    let params = json!({"recording":capture["recording"],"configuration":capture["configuration"]});
    let replay = call(&registry, "gatehouse.drill.run", params.clone())
        .await
        .unwrap();
    assert_eq!(replay["instrument_hash"], capture["instrument_hash"]);
    assert_eq!(replay["instrument"], capture["instrument"]);
    assert_eq!(
        replay["outcomes"][0]["verdict"],
        serde_json::to_value(screened.decision.verdict).unwrap()
    );
    let mut changed = params.clone();
    changed["configuration"]["rules"][1]["pattern"] = json!("changed-simulated-pattern");
    assert_eq!(
        call(&registry, "gatehouse.drill.run", changed.clone())
            .await
            .unwrap_err()
            .code,
        ErrorCode::Conflict
    );
    let mut tampered = params.clone();
    tampered["configuration"]["prompts"] = json!(["simulated tampered prompt"]);
    assert_eq!(
        call(&registry, "gatehouse.drill.run", tampered)
            .await
            .unwrap_err()
            .code,
        ErrorCode::Conflict
    );
    let mut forged = params.clone();
    forged["instrument_hash"] = json!("0".repeat(64));
    assert_eq!(
        call(&registry, "gatehouse.drill.run", forged)
            .await
            .unwrap_err()
            .code,
        ErrorCode::Invalid
    );
    let diff = call(
        &registry,
        "gatehouse.drill.diff",
        json!({"recording":capture["recording"],
        "baseline":capture["configuration"],"candidate":changed["configuration"]}),
    )
    .await
    .unwrap();
    assert_eq!(
        diff["baseline"]["instrument_hash"],
        capture["instrument_hash"]
    );
    assert_ne!(
        diff["candidate"]["instrument_hash"],
        capture["instrument_hash"]
    );
    assert_eq!(
        call(
            &registry,
            "gatehouse.drill.diff",
            json!({"recording":capture["recording"],
        "baseline":changed["configuration"],"candidate":capture["configuration"]})
        )
        .await
        .unwrap_err()
        .code,
        ErrorCode::Conflict
    );
    drop(registry);
    let gate = Gatehouse::open(dir.path()).unwrap();
    assert_eq!(
        gate.store().items(cc_store::DataStore::Caches).unwrap(),
        saved_caches
    );
    assert_eq!(
        gate.store()
            .read_ledger(cc_store::LedgerKind::Decisions)
            .unwrap(),
        saved_ledger
    );
}

#[tokio::test]
async fn bridge_and_runtime_gaps_are_keyed_and_never_claim_replay_parity() {
    let dir = tempfile::tempdir().unwrap();
    let mut gate = Gatehouse::open(dir.path()).unwrap();
    let input = message(0);
    let at = input.at.clone();
    let screened = gate
        .capture_live_shadow(
            input,
            &NoModel,
            vec![cc_types::BridgeGap {
                from: at.clone(),
                to: at,
            }],
        )
        .await
        .unwrap();
    let mut privileged = message(1);
    privileged.metadata = Some(cc_gatehouse::VerifiedMetadata {
        moderator: true,
        broadcaster: false,
    });
    gate.capture_live_shadow(privileged, &NoModel, vec![])
        .await
        .unwrap();
    drop(gate);
    let registry = registry(dir.path());
    let page = call(&registry, "gatehouse.liveRun.get", json!({"limit":100}))
        .await
        .unwrap();
    assert_eq!(
        page["items"][0]["decision_id"],
        screened.decision.decision_id.as_str()
    );
    assert_eq!(page["items"][0]["capture"]["replay_gap"], "bridge_gap");
    assert_eq!(
        page["items"][0]["capture"]["gaps"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert_eq!(
        page["items"][1]["capture"]["replay_gap"],
        "runtime_context_not_replayable"
    );
    for item in page["items"].as_array().unwrap() {
        assert_eq!(
            call(
                &registry,
                "gatehouse.drill.run",
                json!({"recording":item["capture"]["recording"],
            "configuration":item["capture"]["configuration"]})
            )
            .await
            .unwrap_err()
            .code,
            ErrorCode::Unavailable
        );
    }
}

struct PastClock;
impl cc_store::Clock for PastClock {
    fn now(&self) -> cc_store::Timestamp {
        cc_store::Timestamp::parse("2020-01-01T00:00:01Z").unwrap()
    }
}

#[tokio::test]
async fn expiration_and_erasure_do_not_reconstruct_capture_or_provenance() {
    let expired = tempfile::tempdir().unwrap();
    let mut gate = Gatehouse::with_clock(expired.path(), Arc::new(PastClock)).unwrap();
    let mut input = message(0);
    input.at = "2020-01-01T00:00:00Z".to_owned().try_into().unwrap();
    gate.capture_live_shadow(input, &NoModel, vec![])
        .await
        .unwrap();
    drop(gate);
    let expired_registry = registry(expired.path());
    let page = call(
        &expired_registry,
        "gatehouse.liveRun.get",
        json!({"limit":1}),
    )
    .await
    .unwrap();
    assert_eq!(page["unavailable_count"], 1);
    assert_eq!(page["items"][0]["reason"], "recording_unavailable");
    assert!(page["items"][0].get("capture").is_none());

    let erased = tempfile::tempdir().unwrap();
    let mut gate = Gatehouse::open(erased.path()).unwrap();
    gate.capture_live_shadow(message(0), &NoModel, vec![])
        .await
        .unwrap();
    drop(gate);
    let mut store = cc_store::Store::open(erased.path().join("store")).unwrap();
    store
        .forget_user("simulated_capture", cc_store::Timestamp::now())
        .unwrap();
    drop(store);
    let page = call(
        &registry(erased.path()),
        "gatehouse.liveRun.get",
        json!({"limit":1}),
    )
    .await
    .unwrap();
    assert_eq!(page["unavailable_count"], 1);
    assert_eq!(page["items"][0]["coverage"], "unavailable");
    assert_eq!(page["items"][0]["reason"], "capture_unavailable");
    assert!(page["items"][0].get("provenance").is_none());
}

#[tokio::test]
async fn legacy_rows_are_counted_and_pagination_is_bounded_and_endpoint_scoped() {
    let dir = tempfile::tempdir().unwrap();
    let mut gate = Gatehouse::open(dir.path()).unwrap();
    let legacy = gate.screen_batch(vec![message(0)], &NoModel).await.unwrap();
    let mut expected = vec![legacy[0].decision.decision_id.as_str().to_owned()];
    for index in 1..104 {
        expected.push(
            gate.capture_live_shadow(message(index), &NoModel, vec![])
                .await
                .unwrap()
                .decision
                .decision_id
                .as_str()
                .to_owned(),
        );
    }
    drop(gate);
    let registry = registry(dir.path());
    let mut params = json!({"limit":37});
    let mut ids = Vec::new();
    let mut unavailable = 0;
    let mut pages = 0;
    loop {
        let page = call(&registry, "gatehouse.liveRun.get", params.clone())
            .await
            .unwrap();
        assert!(page["items"].as_array().unwrap().len() <= 37);
        for item in page["items"].as_array().unwrap() {
            ids.push(item["decision_id"].as_str().unwrap().to_owned());
        }
        unavailable += page["unavailable_count"].as_u64().unwrap();
        pages += 1;
        if pages == 1 {
            assert_eq!(page["items"][0]["reason"], "capture_unavailable");
            assert_eq!(page["items"][0]["coverage"], "unavailable");
        }
        if let Some(cursor) = page.get("next_cursor") {
            params["cursor"] = cursor.clone();
        } else {
            break;
        }
        assert!(pages < 5);
    }
    assert_eq!(ids, expected);
    assert_eq!(unavailable, 1);
    assert_eq!(pages, 3);
    for params in [
        json!({"limit":101}),
        json!({"limit":0}),
        json!({"limit":1,"cursor":"chat:1"}),
        json!({"limit":1,"cursor":"liveRun:999"}),
        json!({"limit":1,"instrument_hash":"a".repeat(64)}),
    ] {
        assert_eq!(
            call(&registry, "gatehouse.liveRun.get", params)
                .await
                .unwrap_err()
                .code,
            ErrorCode::Invalid
        );
    }
}
