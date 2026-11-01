//! Generated simulated fixtures only; no OBS, audience or credential access.
use cc_types::*;
use serde::{Serialize, de::DeserializeOwned};
use serde_json::{Value, json};

fn fixtures() -> Value {
    serde_json::from_str(include_str!("fixtures/rehearsal.json")).unwrap()
}

fn strict_round_trip<T: DeserializeOwned + Serialize>(value: Value) {
    let parsed: T = serde_json::from_value(value.clone()).unwrap();
    assert_eq!(serde_json::to_value(parsed).unwrap(), value);
    let mut unknown = value;
    unknown["extra"] = json!(true);
    assert!(serde_json::from_value::<T>(unknown).is_err());
}

#[test]
fn all_nine_method_declarations_round_trip_params_results_and_reject_unknowns() {
    let fixture = fixtures();
    assert_eq!(fixture["simulated"], true);
    let entries = fixture["methods"].as_array().unwrap();
    assert_eq!(entries.len(), 9);
    let schemas = method_schemas();
    for entry in entries {
        let wire = json!({"method":entry["method"],"params":entry["params"]});
        let parsed = parse_request(&serde_json::to_vec(&wire).unwrap()).unwrap();
        assert_eq!(serde_json::to_value(&parsed).unwrap(), wire);
        assert_eq!(
            parsed.validate_result(entry["result"].clone()).unwrap(),
            entry["result"]
        );
        let schema = schemas
            .iter()
            .find(|s| s["name"] == entry["method"])
            .unwrap();
        assert_eq!(schema["owner"], "WP R.1");
        assert_eq!(schema["params"]["additionalProperties"], false);
        assert_eq!(schema["result"]["additionalProperties"], false);
        for key in entry["params"].as_object().unwrap().keys() {
            let mut invalid = entry["params"].clone();
            invalid[key] = Value::Null;
            let request = json!({"method":entry["method"],"params":invalid});
            assert!(parse_request(&serde_json::to_vec(&request).unwrap()).is_err());
        }
        for (part, shape) in [("params", &schema["params"]), ("result", &schema["result"])] {
            for key in shape["required"].as_array().into_iter().flatten() {
                let mut missing = entry[part].clone();
                missing
                    .as_object_mut()
                    .unwrap()
                    .remove(key.as_str().unwrap());
                if part == "params" {
                    let request = json!({"method":entry["method"],"params":missing});
                    assert!(parse_request(&serde_json::to_vec(&request).unwrap()).is_err());
                } else {
                    assert!(parsed.validate_result(missing).is_err());
                }
            }
        }
        let mut unknown = wire;
        unknown["params"]["extra"] = json!(true);
        assert!(parse_request(&serde_json::to_vec(&unknown).unwrap()).is_err());
        let mut unknown = entry["result"].clone();
        unknown["extra"] = json!(true);
        assert!(parsed.validate_result(unknown).is_err());
    }
}

#[test]
fn standalone_types_use_the_same_strict_boundary() {
    let fixture = fixtures();
    let methods = fixture["methods"].as_array().unwrap();
    strict_round_trip::<ObsConnectParams>(methods[0]["params"].clone());
    strict_round_trip::<ObsStatus>(methods[0]["result"].clone());
    strict_round_trip::<ObsSceneEnsureParams>(methods[1]["params"].clone());
    strict_round_trip::<ObsSceneEnsureResult>(methods[1]["result"].clone());
    strict_round_trip::<Empty>(json!({}));
    strict_round_trip::<ObsRehearsalClearResult>(methods[2]["result"].clone());
    strict_round_trip::<LotsSourceUrlParams>(methods[3]["params"].clone());
    strict_round_trip::<SourceUrlResult>(methods[3]["result"].clone());
    strict_round_trip::<RehearsalStatus>(methods[4]["result"].clone());
    strict_round_trip::<RehearsalScenarioParams>(methods[6]["params"].clone());
    strict_round_trip::<RehearsalScenarioResult>(methods[6]["result"].clone());
    strict_round_trip::<RehearsalCrowdParams>(methods[7]["params"].clone());
    strict_round_trip::<RehearsalStatus>(methods[7]["result"].clone());
    strict_round_trip::<SourceUrlResult>(methods[8]["result"].clone());
}

#[test]
fn obs_password_is_redacted_through_params_and_enclosing_request() {
    let value = fixtures()["methods"][0]["params"].clone();
    let parsed: ObsConnectParams = serde_json::from_value(value).unwrap();
    let secret = &parsed.password;
    for debug in [
        format!("{parsed:?}"),
        format!("{parsed:#?}"),
        format!("{:?}", RpcRequest::ObsConnect(parsed.clone())),
    ] {
        assert!(!debug.contains(secret));
        assert!(debug.contains("[REDACTED]"));
    }
    // The parse door's public error never echoes malformed secret-bearing input.
    let invalid = json!({"method":"obs.connect","params":{"password":secret}});
    let error = parse_request(&serde_json::to_vec(&invalid).unwrap()).unwrap_err();
    assert!(!format!("{error:?}").contains(secret));
}

#[test]
fn scene_names_count_unicode_characters_and_enforce_one_through_256() {
    for scene_name in ["S".into(), "Simulated scene".into(), "🦇".repeat(256)] {
        strict_round_trip::<ObsSceneEnsureParams>(json!({"scene_name":scene_name}));
    }
    for scene_name in [json!(""), json!("🦇".repeat(257)), json!(null), json!(1)] {
        let request = json!({"method":"obs.scene.ensure","params":{"scene_name":scene_name}});
        assert!(parse_request(&serde_json::to_vec(&request).unwrap()).is_err());
    }
}

#[test]
fn crowd_params_reject_601_and_non_uint16_values_without_clamping() {
    for per_minute in [0, 1, 600] {
        strict_round_trip::<RehearsalCrowdParams>(json!({"per_minute":per_minute}));
    }
    for per_minute in [
        json!(601),
        json!(-1),
        json!(65536),
        json!(1.5),
        json!("60"),
        Value::Null,
    ] {
        let request = json!({"method":"rehearsal.crowd.set","params":{"per_minute":per_minute}});
        assert!(parse_request(&serde_json::to_vec(&request).unwrap()).is_err());
    }
}

#[test]
fn scenarios_are_closed_and_visual_ids_are_optional_branded_slugs() {
    for scenario in ["lots_fill", "vote_round", "beacon_fire", "duel_round"] {
        let parsed: RehearsalScenario = serde_json::from_value(json!(scenario)).unwrap();
        assert_eq!(serde_json::to_value(parsed).unwrap(), json!(scenario));
        strict_round_trip::<RehearsalScenarioParams>(json!({"scenario":scenario}));
    }
    for value in [
        json!({"scenario":"unknown"}),
        json!({"scenario":"BeaconFire"}),
        json!({"scenario":"beacon_fire","visual_id":null}),
        json!({"scenario":"beacon_fire","visual_id":"not a slug"}),
    ] {
        assert!(serde_json::from_value::<RehearsalScenarioParams>(value).is_err());
    }
}

#[test]
fn status_events_bind_payloads_without_changing_control_envelopes() {
    let fixture = fixtures();
    strict_round_trip::<RehearsalEventPayload>(fixture["status_event"].clone());
    let status = fixture["status_event"]["payload"].clone();
    assert!(status.get("scene_name").is_none());
    assert!(status.get("simulated").is_none());
    for (key, value) in [
        ("scene_name", Value::Null),
        ("simulated", json!(true)),
        ("obs", json!({"connected":false,"extra":true})),
        ("crowd_per_minute", json!(65536)),
        ("at", json!("2026-02-30T12:00:00Z")),
    ] {
        let mut invalid = status.clone();
        invalid[key] = value;
        assert!(serde_json::from_value::<RehearsalStatus>(invalid.clone()).is_err());
        assert!(
            serde_json::from_value::<RehearsalEventPayload>(
                json!({"kind":"rehearsal.status","payload":invalid})
            )
            .is_err()
        );
    }
    assert!(
        serde_json::from_value::<RehearsalEventPayload>(json!({"kind":"unknown","payload":status}))
            .is_err()
    );
    let control = json!({"seq":1,"at":status["at"],"kind":"rehearsal.status"});
    strict_round_trip::<StreamEvent>(control.clone());
    let mut invalid = control;
    invalid["payload"] = status;
    assert!(serde_json::from_value::<StreamEvent>(invalid).is_err());
}

#[test]
fn tiltyard_snapshot_is_a_strict_overlay_replacement_with_omitted_verdict() {
    assert_eq!(TILTYARD_RENDER_SNAPSHOT_EVENT, "tiltyard.render.snapshot");
    assert!(!EventKind::NAMES.contains(&TILTYARD_RENDER_SNAPSHOT_EVENT));
    let snapshot = fixtures()["snapshot"].clone();
    strict_round_trip::<TiltyardRenderSnapshot>(snapshot.clone());
    strict_round_trip::<TiltyardSide>(snapshot["left"].clone());
    for verdict in [
        json!({"side":"left","how":"tally"}),
        json!({"side":"right","how":"call"}),
        json!({"side":"left","how":"tie"}),
    ] {
        let parsed: TiltyardVerdict = serde_json::from_value(verdict.clone()).unwrap();
        assert_eq!(serde_json::to_value(parsed).unwrap(), verdict);
        let mut value = snapshot.clone();
        value["verdict"] = verdict;
        strict_round_trip::<TiltyardRenderSnapshot>(value);
    }
    for (key, value) in [
        ("verdict", Value::Null),
        ("verdict", json!("unknown")),
        ("ballots", json!(-1)),
        ("ballots", json!(4294967296_u64)),
        ("simulated", Value::Null),
        ("simulated", json!("true")),
        ("at", json!("2026-02-30T12:00:00Z")),
    ] {
        let mut invalid = snapshot.clone();
        invalid[key] = value;
        assert!(serde_json::from_value::<TiltyardRenderSnapshot>(invalid).is_err());
    }
    for side in ["left", "right"] {
        for (key, value) in [
            ("extra", json!(true)),
            ("count", json!(-1)),
            ("label", json!(null)),
        ] {
            let mut invalid = snapshot.clone();
            invalid[side][key] = value;
            assert!(serde_json::from_value::<TiltyardRenderSnapshot>(invalid).is_err());
        }
    }
    for key in ["left", "right", "ballots", "simulated", "at"] {
        let mut invalid = snapshot.clone();
        invalid.as_object_mut().unwrap().remove(key);
        assert!(serde_json::from_value::<TiltyardRenderSnapshot>(invalid).is_err());
    }
}
