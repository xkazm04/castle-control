//! Generated simulated recordings only; no Twitch, OBS or model adapter.
use cc_core::{EventHub, Registry};
use cc_gatehouse::simulation::near_miss_bank;
use cc_types::{ErrorCode, ErrorEnvelope, parse_request};
use serde_json::{Value, json};
use std::sync::Arc;

fn registry(root: &std::path::Path) -> Registry {
    Registry::with_fixture_root(root, Arc::new(EventHub::new(64).unwrap())).unwrap()
}

async fn call(registry: &Registry, method: &str, params: Value) -> Result<Value, ErrorEnvelope> {
    let request = parse_request(
        &serde_json::to_vec(&json!({
            "method": method, "params": params
        }))
        .unwrap(),
    )
    .unwrap();
    registry.dispatch(&request).await
}

fn configuration(pattern: &str) -> Value {
    json!({
        "rules": [{
            "rule_id":"simulated-delete", "name":"Simulated delete rule",
            "rule_class":"pattern", "mode":"armed", "action":"delete",
            "delivery":"streamer", "pattern":pattern
        }],
        "bank":"simulated-near-misses-v1", "judge":"rules-only", "prompts":[]
    })
}

async fn import(registry: &Registry) -> Value {
    let at = cc_types::Timestamp::now();
    let time = chrono::DateTime::parse_from_rfc3339(&String::from(at.clone())).unwrap();
    let gaps = json!([{
        "from": (time - chrono::TimeDelta::seconds(2)).to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        "to": (time - chrono::TimeDelta::seconds(1)).to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
    }]);
    let messages: Vec<_> = near_miss_bank()
        .cases
        .iter()
        .enumerate()
        .map(|(i, case)| {
            json!({"message_id":format!("simulated-{i}"), "user_id":format!("{}",i+1),
            "at":at, "text":case.text})
        })
        .collect();
    call(
        registry,
        "gatehouse.recording.import",
        json!({
            "source":"simulated rule bank", "messages":messages, "gaps":gaps
        }),
    )
    .await
    .unwrap()
}

#[tokio::test]
async fn imported_recording_replays_deterministically_and_survives_reopen() {
    let root = tempfile::tempdir().unwrap();
    let service = registry(root.path());
    let recording = import(&service).await;
    assert_eq!(recording["message_count"], 4);
    let params = json!({"recording":recording["recording"],
        "configuration":configuration("^Simulated tagged threat")});
    let first = call(&service, "gatehouse.drill.run", params.clone())
        .await
        .unwrap();
    let second = call(&service, "gatehouse.drill.run", params.clone())
        .await
        .unwrap();
    assert_eq!(first, second);
    assert_eq!(first["label"], "simulated");
    assert_eq!(first["source"], recording["source"]);
    assert_eq!(first["gaps"], recording["gaps"]);
    assert_eq!(first["summary"]["passes"], 4);
    assert_eq!(first["summary"]["states"]["engine_failed"], 0);
    assert_eq!(first["outcomes"][3]["action"], "delete");
    assert!(
        first["outcomes"]
            .as_array()
            .unwrap()
            .iter()
            .all(|outcome| outcome["source"] == recording["source"])
    );
    // Replay never enters the live decision ledger or consensus intake.
    assert_eq!(
        std::fs::read(root.path().join("gatehouse/store/decisions.jsonl")).unwrap(),
        Vec::<u8>::new()
    );
    drop(service);
    let reopened = registry(root.path());
    assert_eq!(
        call(&reopened, "gatehouse.drill.run", params)
            .await
            .unwrap(),
        first
    );
    let chart = call(
        &reopened,
        "gatehouse.consensus.get",
        json!({"window_s":900,"filter":{"kind":"all"}}),
    )
    .await
    .unwrap();
    assert_eq!(chart["directions"], json!([]));
    assert_eq!(chart["shed_count"], 0);
}

#[tokio::test]
async fn diff_keeps_distinct_instruments_and_summaries() {
    let root = tempfile::tempdir().unwrap();
    let service = registry(root.path());
    let recording = import(&service).await;
    let diff = call(
        &service,
        "gatehouse.drill.diff",
        json!({
            "recording":recording["recording"],
            "baseline":configuration("simulated-never-matches"),
            "candidate":configuration("^Simulated tagged threat")
        }),
    )
    .await
    .unwrap();
    assert_eq!(diff["label"], "simulated");
    assert_ne!(
        diff["baseline"]["instrument_hash"],
        diff["candidate"]["instrument_hash"]
    );
    assert_eq!(diff["baseline"]["summary"]["passes"], 3);
    assert_eq!(diff["candidate"]["summary"]["passes"], 4);
    assert_eq!(diff["changes"].as_array().unwrap().len(), 1);
    assert_eq!(diff["changes"][0]["message_id"], "simulated-3");
    assert!(diff.get("summary").is_none());
}

#[tokio::test]
async fn model_judges_and_classifier_rules_are_unavailable_on_both_diff_sides() {
    let root = tempfile::tempdir().unwrap();
    let service = registry(root.path());
    let recording = import(&service).await;
    let valid = configuration("simulated");
    let mut model = valid.clone();
    model["judge"] = json!("model-judge");
    let mut classifier = valid.clone();
    classifier["rules"][0]["rule_class"] = json!("classifier");
    classifier["rules"][0]
        .as_object_mut()
        .unwrap()
        .remove("pattern");
    classifier["rules"][0]["text"] = json!("Simulated classification");
    for unavailable in [model, classifier] {
        let error = call(
            &service,
            "gatehouse.drill.run",
            json!({
                "recording":recording["recording"], "configuration":unavailable
            }),
        )
        .await
        .unwrap_err();
        assert_eq!(error.code, ErrorCode::Unavailable);
        for (baseline, candidate) in [(&unavailable, &valid), (&valid, &unavailable)] {
            let error = call(
                &service,
                "gatehouse.drill.diff",
                json!({
                    "recording":recording["recording"], "baseline":baseline, "candidate":candidate
                }),
            )
            .await
            .unwrap_err();
            assert_eq!(error.code, ErrorCode::Unavailable);
        }
    }
}

#[tokio::test]
async fn recording_references_are_root_scoped_and_never_file_paths() {
    let root = tempfile::tempdir().unwrap();
    let service = registry(root.path());
    let outside_root = tempfile::tempdir().unwrap();
    let other = registry(outside_root.path());
    let outside_recording = import(&other).await;
    let file = outside_root.path().join("simulated-recording.json");
    std::fs::write(&file, "simulated inert data").unwrap();
    for reference in [
        json!(file.to_string_lossy()),
        json!("../outside/recording.json"),
        json!("recording-00000000000000000000000000"),
        outside_recording["recording"].clone(),
    ] {
        for (method, params) in [
            (
                "gatehouse.drill.run",
                json!({"recording":reference,
                "configuration":configuration("simulated")}),
            ),
            (
                "gatehouse.drill.diff",
                json!({"recording":reference,
                "baseline":configuration("simulated"),"candidate":configuration("simulated")}),
            ),
        ] {
            assert_eq!(
                call(&service, method, params).await.unwrap_err().code,
                ErrorCode::NotFound
            );
        }
    }
}

#[tokio::test]
async fn fresh_consensus_is_empty_for_every_filter_and_arming_stays_blocked() {
    let root = tempfile::tempdir().unwrap();
    let service = registry(root.path());
    for filter in [
        json!({"kind":"all"}),
        json!({"kind":"text"}),
        json!({"kind":"emotes"}),
        json!({"kind":"emote","emote":"simHappy"}),
    ] {
        let before = chrono::Utc::now();
        let chart = call(
            &service,
            "gatehouse.consensus.get",
            json!({"window_s":900,"filter":filter}),
        )
        .await
        .unwrap();
        assert_eq!(chart["directions"], json!([]));
        assert_eq!(chart["shed_count"], 0);
        assert_eq!(chart["filter"], filter);
        let at: cc_types::Timestamp = serde_json::from_value(chart["at"].clone()).unwrap();
        let date = |stamp: cc_types::Timestamp| {
            chrono::DateTime::parse_from_rfc3339(&String::from(stamp)).unwrap()
        };
        assert!(date(at.clone()) >= before && date(at) <= chrono::Utc::now());
    }
    let error = call(
        &service,
        "gatehouse.rules.upsert",
        json!({"rule":configuration("simulated")["rules"][0]}),
    )
    .await
    .unwrap_err();
    assert_eq!(error.code, ErrorCode::BlockedByPolicy);
}
