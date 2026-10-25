use cc_types::*;
use serde::de::DeserializeOwned;
use serde_json::{Value, json};

const AT: &str = "2026-10-25T12:00:00Z";
const SOURCE: &str = "simulated recording";

fn configuration() -> Value {
    json!({"rules":[{"rule_id":"simulated-links", "name":"Simulated links",
        "rule_class":"pattern", "mode":"shadow", "action":"delete",
        "delivery":"simulated", "pattern":"example"}],
        "bank":"simulated-near-misses", "judge":"simulated-blind-judge",
        "prompts":["Simulated prompt"]})
}

fn outcome() -> Value {
    json!({"message_id":"simulated-message", "source":SOURCE, "at":AT,
        "state":"acted", "verdict":"bar", "action":"delete",
        "rule_id":"simulated-links", "passed":true})
}

fn run() -> Value {
    let hash = "a".repeat(64);
    json!({"label":"simulated", "source":SOURCE, "instrument_hash":hash,
        "instrument":{"rules_hash":hash, "bank_hash":hash, "judge_hash":hash, "prompts_hash":hash},
        "outcomes":[outcome()], "summary":{"passes":1,
        "states":{"acted":1,"not_provoked":0,"not_evaluable":0,"judge_pending":0,"judge_void":0,"engine_failed":0},
        "over_moderation":{"evaluated":1,"false_positives":0}},
        "gaps":[{"from":AT,"to":"2026-10-25T12:00:10Z"}]})
}

fn consensus() -> Value {
    json!({"at":AT,"window_s":900,"filter":{"kind":"all"},"shed_count":3,
        "directions":[{"key":"simulated-direction","label":"Simulated opinion", "share":0.5,
        "delta_3m":-0.1,"messages":2,"series":[{"at":AT,"share":0.5}]}]})
}

fn cases() -> Vec<(&'static str, Value, Value, &'static str)> {
    vec![
        (
            "gatehouse.consensus.get",
            json!({"window_s":900,"filter":{"kind":"all"}}),
            consensus(),
            "WP 1.5",
        ),
        (
            "gatehouse.drill.run",
            json!({"recording":"simulated-recording", "configuration":configuration()}),
            run(),
            "WP 1.6",
        ),
        (
            "gatehouse.drill.diff",
            json!({"recording":"simulated-recording", "baseline":configuration(),"candidate":configuration()}),
            json!({"label":"simulated","baseline":run(),"candidate":run(),"changes":[]}),
            "WP 1.6",
        ),
        (
            "gatehouse.recording.import",
            json!({"source":SOURCE,"messages":[{"message_id":"simulated-message",
            "user_id":"9007199254740993", "at":AT,"text":"Simulated chat"}], "gaps":[]}),
            json!({"recording":"simulated-recording","source":SOURCE,"message_count":1,"gaps":[]}),
            "WP 1.6",
        ),
    ]
}

fn request(method: &str, params: Value) -> Result<RpcRequest, ErrorEnvelope> {
    parse_request(&serde_json::to_vec(&json!({"method":method,"params":params})).unwrap())
}

#[test]
fn four_methods_are_typed_keep_owners_and_reject_unknown_fields_and_null() {
    for (method, params, result, owner) in cases() {
        let req = request(method, params.clone()).unwrap();
        assert_eq!(req.validate_result(result.clone()).unwrap(), result);
        let schema = method_schemas()
            .into_iter()
            .find(|m| m["name"] == method)
            .unwrap();
        assert_eq!(schema["owner"], owner);
        assert!(schema["params"].get("not").is_none());
        assert!(schema["result"].get("not").is_none());
        for key in params
            .as_object()
            .unwrap()
            .keys()
            .chain(std::iter::once(&"extra".to_owned()))
        {
            let mut bad = params.clone();
            bad[key] = Value::Null;
            assert!(request(method, bad).is_err());
        }
        for key in result
            .as_object()
            .unwrap()
            .keys()
            .chain(std::iter::once(&"extra".to_owned()))
        {
            let mut bad = result.clone();
            bad[key] = Value::Null;
            assert!(req.validate_result(bad).is_err());
        }
    }
}

fn reject_unknown_and_null<T: DeserializeOwned>(base: Value, optional: &[&str]) {
    assert!(serde_json::from_value::<T>(base.clone()).is_ok());
    let mut extra = base.clone();
    extra["extra"] = json!(true);
    assert!(serde_json::from_value::<T>(extra).is_err());
    for key in base
        .as_object()
        .unwrap()
        .keys()
        .map(String::as_str)
        .chain(optional.iter().copied())
    {
        let mut bad = base.clone();
        bad[key] = Value::Null;
        assert!(
            serde_json::from_value::<T>(bad).is_err(),
            "accepted null {key}"
        );
    }
}

#[test]
fn every_nested_record_is_closed_and_present_optional_keys_reject_null() {
    reject_unknown_and_null::<DrillConfiguration>(configuration(), &[]);
    reject_unknown_and_null::<DrillOutcome>(outcome(), &[]);
    reject_unknown_and_null::<DrillInstrument>(run()["instrument"].clone(), &[]);
    reject_unknown_and_null::<DrillSummary>(run()["summary"].clone(), &[]);
    reject_unknown_and_null::<DrillStateCounts>(run()["summary"]["states"].clone(), &[]);
    reject_unknown_and_null::<OverModeration>(run()["summary"]["over_moderation"].clone(), &[]);
    reject_unknown_and_null::<OpinionDirection>(consensus()["directions"][0].clone(), &[]);
    reject_unknown_and_null::<ConsensusPoint>(json!({"at":AT,"share":0.5}), &[]);
    reject_unknown_and_null::<DrillChange>(
        json!({"message_id":"simulated-message","before":"acted","after":"not_provoked"}),
        &[],
    );
    reject_unknown_and_null::<RecordedMessage>(
        json!({"message_id":"simulated-message","user_id":"9007199254740993","at":AT,"text":"Simulated chat"}),
        &[],
    );
    let minimal =
        json!({"message_id":"simulated-message","source":SOURCE,"at":AT,"state":"judge_pending"});
    let typed: DrillOutcome = serde_json::from_value(minimal.clone()).unwrap();
    assert_eq!(serde_json::to_value(typed).unwrap(), minimal);
    reject_unknown_and_null::<DrillOutcome>(minimal, &["passed", "verdict", "action", "rule_id"]);
    let mut direction = consensus()["directions"][0].clone();
    direction.as_object_mut().unwrap().remove("delta_3m");
    reject_unknown_and_null::<OpinionDirection>(direction, &["delta_3m"]);
}

#[test]
fn hash_and_numeric_try_from_boundaries_match_their_wire_shapes() {
    assert!(InstrumentHash::try_from("a".repeat(64)).is_ok());
    for hash in [
        "".to_owned(),
        "a".repeat(63),
        "a".repeat(65),
        "A".repeat(64),
        "z".repeat(64),
        format!("{}\n", "a".repeat(64)),
    ] {
        assert!(InstrumentHash::try_from(hash.clone()).is_err());
        let mut bad = run();
        bad["instrument_hash"] = json!(hash);
        assert!(serde_json::from_value::<DrillRunResult>(bad).is_err());
        for key in ["rules_hash", "bank_hash", "judge_hash", "prompts_hash"] {
            let mut bad = run();
            bad["instrument"][key] = json!(hash);
            assert!(serde_json::from_value::<DrillRunResult>(bad).is_err());
        }
    }
    for value in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY, -0.01, 1.01] {
        assert!(ConsensusShare::try_from(value).is_err());
    }
    for value in [f64::NAN, f64::INFINITY, -1.01, 1.01] {
        assert!(ConsensusDelta::try_from(value).is_err());
    }
    for value in [0.0, 0.5, 1.0] {
        assert!(ConsensusShare::try_from(value).is_ok());
    }
    for value in [-1.0, 0.0, 1.0] {
        assert!(ConsensusDelta::try_from(value).is_ok());
    }
    assert!(GatehouseText::try_from(String::new()).is_err());
    for window_s in [json!(0), json!(-1), json!(0.5), json!(4294967296_u64)] {
        assert!(
            request(
                "gatehouse.consensus.get",
                json!({"window_s":window_s,"filter":{"kind":"all"}})
            )
            .is_err()
        );
    }
}

#[test]
fn consensus_filters_and_the_one_named_event_have_closed_shapes() {
    for filter in [
        json!({"kind":"all"}),
        json!({"kind":"emotes"}),
        json!({"kind":"text"}),
        json!({"kind":"emote","emote":"simulated-emote"}),
    ] {
        assert!(
            request(
                "gatehouse.consensus.get",
                json!({"window_s":900,"filter":filter})
            )
            .is_ok()
        );
    }
    for filter in [
        json!({"kind":"all","emote":"x"}),
        json!({"kind":"emote"}),
        json!({"kind":"emote","emote":""}),
        json!({"kind":"emote","emote":null}),
        json!({"kind":"unknown"}),
    ] {
        assert!(
            request(
                "gatehouse.consensus.get",
                json!({"window_s":900,"filter":filter})
            )
            .is_err()
        );
    }
    let event = json!({"kind":"gatehouse.consensus","payload":consensus()});
    assert!(serde_json::from_value::<ConsensusEventPayload>(event.clone()).is_ok());
    reject_unknown_and_null::<ConsensusEventPayload>(event, &[]);
    assert!(
        serde_json::from_value::<ConsensusEventPayload>(
            json!({"kind":"gatehouse.drill","payload":run()})
        )
        .is_err()
    );
}

#[test]
fn six_states_direct_passes_provenance_gaps_and_separate_instruments_survive() {
    for state in [
        "acted",
        "not_provoked",
        "not_evaluable",
        "judge_pending",
        "judge_void",
        "engine_failed",
    ] {
        let mut value = run();
        value["outcomes"][0]["state"] = json!(state);
        let typed: DrillRunResult = serde_json::from_value(value.clone()).unwrap();
        assert_eq!(typed.summary.passes, 1);
        assert_eq!(typed.summary.over_moderation.false_positives, 0);
        assert_eq!(serde_json::to_value(typed).unwrap(), value);
    }
    let mut candidate = run();
    candidate["instrument_hash"] = json!("b".repeat(64));
    let value = json!({"label":"simulated","baseline":run(),"candidate":candidate,"changes":[]});
    let typed: DrillDiffResult = serde_json::from_value(value.clone()).unwrap();
    assert_eq!(serde_json::to_value(typed).unwrap(), value);
    let mut bad = run();
    bad["label"] = json!("live");
    assert!(serde_json::from_value::<DrillRunResult>(bad).is_err());
}
