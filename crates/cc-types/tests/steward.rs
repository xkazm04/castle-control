use cc_types::*;
use serde::{Serialize, de::DeserializeOwned};
use serde_json::{Value, json};

// Generated and labelled simulated, never real chat. TS reads these same bytes.
fn fixtures() -> Vec<Value> {
    serde_json::from_str(include_str!("fixtures/steward.json")).unwrap()
}
fn round_trip<T: DeserializeOwned + Serialize>(value: Value) {
    let parsed: T = serde_json::from_value(value.clone()).unwrap();
    assert_eq!(serde_json::to_value(parsed).unwrap(), value);
}
fn rejects(value: Value) {
    assert!(
        serde_json::from_value::<Writ>(value.clone()).is_err(),
        "accepted {value}"
    );
}

#[test]
fn shared_writ_fixtures_round_trip_all_proposals_and_statuses() {
    let values = fixtures();
    assert_eq!(values.len(), 5);
    for value in values {
        round_trip::<Writ>(value.clone());
        let result = json!({"writ":value});
        round_trip::<AskResult>(result.clone());
        round_trip::<WritSealResult>(result.clone());
        round_trip::<WritTearResult>(result);
        round_trip::<StewardEventPayload>(json!({"kind":"steward.writ","payload":value}));
    }
}

#[test]
fn asks_and_decisions_are_strict_and_omit_missing_keys() {
    let params = json!({"chamber":"lots","prompt":"Simulated: three questions"});
    round_trip::<AskParams>(params.clone());
    let id = fixtures()[0]["writ_id"].clone();
    round_trip::<AskParams>(json!({"chamber":"lots","prompt":"Simulated follow-up","writ_id":id}));
    for (key, value) in [
        ("writ_id", Value::Null),
        ("extra", json!(true)),
        ("chamber", json!("maproom")),
        ("prompt", json!(" \n")),
    ] {
        let mut bad = params.clone();
        bad[key] = value;
        assert!(serde_json::from_value::<AskParams>(bad).is_err());
    }
    round_trip::<WritSealParams>(json!({"writ_id":id}));
    round_trip::<WritTearParams>(json!({"writ_id":id}));
    for bad in [
        json!({}),
        json!({"writ_id":null}),
        json!({"writ_id":"not-ulid"}),
        json!({"writ_id":id,"extra":true}),
    ] {
        assert!(serde_json::from_value::<WritSealParams>(bad.clone()).is_err());
        assert!(serde_json::from_value::<WritTearParams>(bad).is_err());
    }
    assert_ne!(WritId::mint(), WritId::mint());
}

#[test]
fn writs_reject_unknowns_nulls_and_chamber_mismatches() {
    let sample = fixtures()[0].clone();
    for (key, value) in [
        ("chamber", json!("unknown")),
        ("chamber", json!("maproom")),
        ("chamber", json!("beacons")),
        ("status", json!("applied")),
        ("writ_id", json!("not-ulid")),
        ("created_at", json!("2026-02-30T00:00:00Z")),
        ("updated_at", json!("2026-10-26T00:00:00+01:00")),
        ("error", Value::Null),
        ("extra", json!(true)),
    ] {
        let mut value_to_check = sample.clone();
        value_to_check[key] = value;
        rejects(value_to_check);
    }
    for pointer in ["/proposal", "/proposal/diff"] {
        let mut bad = sample.clone();
        bad.pointer_mut(pointer).unwrap()["extra"] = json!(true);
        rejects(bad);
    }
    let mut bad = sample.clone();
    bad["proposal"]["method"] = json!("maproom.design.upsert");
    rejects(bad);
    let mut bad = sample;
    bad["proposal"]["diff"]["before"] = Value::Null;
    rejects(bad);
    for value in fixtures() {
        for key in value.as_object().unwrap().keys() {
            let mut bad = value.clone();
            bad[key] = Value::Null;
            rejects(bad);
        }
        let mut extra = value["proposal"]["diff"]["after"].clone();
        extra["extra"] = json!(true);
        for after in [extra, Value::Null] {
            let mut bad = value.clone();
            bad["proposal"]["diff"]["after"] = after;
            rejects(bad);
        }
        let wrapped = json!({"writ":value,"extra":true});
        assert!(serde_json::from_value::<AskResult>(wrapped.clone()).is_err());
        assert!(serde_json::from_value::<WritSealResult>(wrapped.clone()).is_err());
        assert!(serde_json::from_value::<WritTearResult>(wrapped).is_err());
        assert!(
            serde_json::from_value::<StewardEventPayload>(
                json!({"kind":"steward.writ","payload":value,"extra":true})
            )
            .is_err()
        );
    }
}

#[test]
fn reused_mutation_safety_constraints_and_required_parameters_remain_intact() {
    let mut value = fixtures()[0].clone();
    value["chamber"] = json!("gatehouse");
    value["proposal"] = json!({"method":"gatehouse.rules.setMode","diff":{
        "after":{"rule_id":"simulated-links","mode":"armed"}
    }});
    rejects(value);
    for method in ["steward.ask", "steward.writ.seal", "steward.writ.tear"] {
        assert!(
            parse_request(
                serde_json::to_string(&json!({"method":method,"params":{}}))
                    .unwrap()
                    .as_bytes()
            )
            .is_err()
        );
    }
    assert!(EventKind::NAMES.contains(&"steward.writ"));
}

#[test]
fn bound_methods_round_trip_the_existing_types() {
    for value in fixtures() {
        let writ: Writ = serde_json::from_value(value).unwrap();
        let requests = [
            RpcRequest::Ask(AskParams {
                chamber: writ.chamber,
                prompt: "Simulated: propose a configuration".into(),
                writ_id: None,
            }),
            RpcRequest::WritSeal(WritSealParams {
                writ_id: writ.writ_id.clone(),
            }),
            RpcRequest::WritTear(WritTearParams {
                writ_id: writ.writ_id.clone(),
            }),
        ];
        let results = [
            serde_json::to_value(AskResult { writ: writ.clone() }).unwrap(),
            serde_json::to_value(WritSealResult { writ: writ.clone() }).unwrap(),
            serde_json::to_value(WritTearResult { writ }).unwrap(),
        ];
        for (request, result) in requests.into_iter().zip(results) {
            let wire = serde_json::to_vec(&request).unwrap();
            assert_eq!(parse_request(&wire).unwrap(), request);
            assert_eq!(request.validate_result(result.clone()).unwrap(), result);
            assert!(request.validate_result(json!({})).is_err());
            round_trip::<RpcRequest>(serde_json::to_value(request).unwrap());
        }
    }
}

#[test]
fn simulated_storage_metadata_never_crosses_the_steward_wire() {
    let writ = fixtures()[0].clone();
    for (method, params) in [
        (
            "steward.ask",
            json!({"chamber":"lots","prompt":"Simulated request"}),
        ),
        ("steward.writ.seal", json!({"writ_id":writ["writ_id"]})),
        ("steward.writ.tear", json!({"writ_id":writ["writ_id"]})),
    ] {
        let request = parse_request(
            &serde_json::to_vec(&json!({
                "method":method,"params":params
            }))
            .unwrap(),
        )
        .unwrap();
        let response = request.validate_result(json!({"writ":writ})).unwrap();
        for value in [serde_json::to_value(&request).unwrap(), response.clone()] {
            assert!(
                !serde_json::to_string(&value)
                    .unwrap()
                    .contains("\"simulated\"")
            );
            assert!(
                !serde_json::to_string(&value)
                    .unwrap()
                    .contains("\"SIMULATED\"")
            );
        }
        for key in ["simulated", "SIMULATED"] {
            let mut bad_params = params.clone();
            bad_params[key] = json!(true);
            assert!(
                parse_request(
                    &serde_json::to_vec(&json!({
                        "method":method,"params":bad_params
                    }))
                    .unwrap()
                )
                .is_err()
            );
            let mut bad_response = response.clone();
            bad_response[key] = json!(true);
            assert!(request.validate_result(bad_response).is_err());
            let mut bad_writ = response.clone();
            bad_writ["writ"][key] = json!(true);
            assert!(request.validate_result(bad_writ).is_err());
        }
    }
}
