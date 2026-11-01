//! Shared generated SIMULATED fixtures; declarations and parsing only.
use cc_types::*;
use serde::{Serialize, de::DeserializeOwned};
use serde_json::{Value, json};

fn fixtures() -> Value {
    serde_json::from_str(include_str!("fixtures/tiltyard.json")).unwrap()
}

fn round_trip<T: DeserializeOwned + Serialize>(value: &Value) {
    let parsed: T = serde_json::from_value(value.clone()).unwrap();
    assert_eq!(serde_json::to_value(parsed).unwrap(), *value);
}

fn accepted(door: &str, value: Value) -> bool {
    match door {
        "params" => parse_request(
            &serde_json::to_vec(&json!({"method":"maproom.turn.run","params":value})).unwrap(),
        )
        .is_ok(),
        "result" => serde_json::from_value::<TiltyardStageResult>(value).is_ok(),
        "snapshot" => serde_json::from_value::<TiltyardRenderSnapshot>(value).is_ok(),
        _ => panic!("unexpected simulated fixture door"),
    }
}

#[test]
fn all_actions_states_and_overlay_phases_round_trip_at_the_same_doors() {
    let f = fixtures();
    assert_eq!(f["simulated"], true);
    let get = parse_request(br#"{"method":"maproom.stage.get","params":{}}"#).unwrap();
    assert_eq!(f["actions"].as_array().unwrap().len(), 9);
    for action in f["actions"].as_array().unwrap() {
        round_trip::<TiltyardAction>(action);
        let params = json!({"action":action});
        round_trip::<TiltyardTurnParams>(&params);
        let wire = json!({"method":"maproom.turn.run","params":params});
        let request = parse_request(&serde_json::to_vec(&wire).unwrap()).unwrap();
        assert_eq!(serde_json::to_value(&request).unwrap(), wire);
        for result in f["stages"].as_array().unwrap() {
            round_trip::<TiltyardStageResult>(result);
            assert_eq!(get.validate_result(result.clone()).unwrap(), *result);
            assert_eq!(request.validate_result(result.clone()).unwrap(), *result);
        }
    }
    for snapshot in f["snapshots"].as_array().unwrap() {
        round_trip::<TiltyardRenderSnapshot>(snapshot);
    }
    round_trip::<StreamEvent>(&f["control_event"]);
    assert_eq!(TILTYARD_CURRENT_ROUTE, "/tiltyard/current");
    assert_eq!(TILTYARD_PUSH_ROUTE, "/push/tiltyard");
    assert!(!EventKind::NAMES.contains(&TILTYARD_RENDER_SNAPSHOT_EVENT));
}

#[test]
fn shared_invalid_fixtures_reject_unknowns_nulls_wrong_types_and_out_of_bounds() {
    let f = fixtures();
    assert!(f["invalid"].as_array().unwrap().len() > 80);
    for case in f["invalid"].as_array().unwrap() {
        assert!(
            !accepted(case["door"].as_str().unwrap(), case["value"].clone()),
            "invalid simulated fixture was accepted: {case}"
        );
    }
    let invalid = json!({"method":"maproom.stage.get","params":{"extra":true}});
    assert!(parse_request(&serde_json::to_vec(&invalid).unwrap()).is_err());
    let mut event = f["control_event"].clone();
    event["payload"] = f["stages"][1].clone();
    assert!(serde_json::from_value::<StreamEvent>(event).is_err());
}

#[test]
fn unicode_labels_seed_strings_window_endpoints_and_omissions_are_preserved() {
    for text in [
        "x".to_owned(),
        "\u{0085}".to_owned(),
        "🦇".repeat(256),
        "<script>SIMULATED</script>".into(),
    ] {
        round_trip::<TiltyardLabel>(&json!(text));
    }
    for value in ["0", "9007199254740993", &"9".repeat(128)] {
        round_trip::<TiltyardSeed>(&json!(value));
    }
    for ms in [1, u32::MAX] {
        round_trip::<TiltyardWindowMs>(&json!(ms));
    }
    let idle = fixtures()["stages"][0].clone();
    assert!(idle.get("session").is_none());
    round_trip::<TiltyardStageResult>(&idle);
    for method in ["maproom.stage.get", "maproom.turn.run"] {
        let schema = method_schemas()
            .into_iter()
            .find(|m| m["name"] == method)
            .unwrap();
        assert_eq!(schema["owner"], "D5a");
        assert_eq!(schema["result"]["title"], "TiltyardStageResult");
        assert_ne!(schema["params"]["title"], "Pending");
    }
    // Names and registration count do not change when two placeholders gain schemas.
    assert_eq!(RpcRequest::NAMES.len(), 62);
}

#[test]
fn every_nested_record_rejects_unknown_keys_and_present_null() {
    fn paths(value: &Value, path: String, out: &mut Vec<String>) {
        match value {
            Value::Object(fields) => {
                out.push(path.clone());
                for (key, child) in fields {
                    paths(child, format!("{path}/{key}"), out);
                }
            }
            Value::Array(items) => {
                for (i, child) in items.iter().enumerate() {
                    paths(child, format!("{path}/{i}"), out);
                }
            }
            _ => {}
        }
    }
    let f = fixtures();
    let params = json!({"action":f["actions"][0]});
    for (door, value) in [
        ("params", &params),
        ("result", &f["stages"][5]),
        ("snapshot", &f["snapshots"][6]),
    ] {
        let mut objects = Vec::new();
        paths(value, String::new(), &mut objects);
        for path in objects {
            let mut unknown = value.clone();
            unknown.pointer_mut(&path).unwrap()["extra"] = json!(true);
            assert!(!accepted(door, unknown), "unknown field at {door}{path}");
            for key in value.pointer(&path).unwrap().as_object().unwrap().keys() {
                let mut null = value.clone();
                null.pointer_mut(&path).unwrap()[key] = Value::Null;
                assert!(!accepted(door, null), "present null at {door}{path}/{key}");
            }
        }
    }
}
