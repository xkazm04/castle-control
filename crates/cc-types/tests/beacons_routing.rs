use cc_types::{ErrorCode, Visual, parse_request};
use serde_json::{Value, json};

// Generated simulated data, never real chat or live contribution intake.
fn visual() -> Value {
    json!({"visual_id":"simulated-frame","name":"Simulated frame",
        "curve":{"ranges":[{"total":0,"intensity":0.0}],"decay":{"kind":"none"}}})
}

#[test]
fn optional_visual_input_round_trips_and_legacy_absence_stays_absent() {
    let legacy = visual();
    let parsed: Visual = serde_json::from_value(legacy.clone()).unwrap();
    assert!(parsed.input.is_none());
    assert_eq!(serde_json::to_value(parsed).unwrap(), legacy);
    for (source, unit) in [
        ("cheer", "bits"),
        ("bits_use", "bits"),
        ("subscribe", "count"),
        ("gift", "count"),
        ("resub", "count"),
        ("power_up", "count"),
        ("hype_train", "level"),
        ("channel_points", "points"),
        ("charity", "minor_currency"),
        ("goal", "minor_currency"),
    ] {
        let mut configured = visual();
        configured["input"] = json!({"source":source,"unit":unit});
        let parsed: Visual = serde_json::from_value(configured.clone()).unwrap();
        assert_eq!(serde_json::to_value(parsed).unwrap(), configured);
    }
}

#[test]
fn visual_input_is_closed_and_source_units_must_match() {
    for input in [
        Value::Null,
        json!({}),
        json!({"source":"unknown","unit":"count"}),
        json!({"source":"gift","unit":"unknown"}),
        json!({"source":"gift","unit":"bits"}),
        json!({"source":"cheer","unit":"count"}),
        json!({"source":"hype_train","unit":"points"}),
        json!({"source":"channel_points","unit":"level"}),
        json!({"source":"charity","unit":"count"}),
        json!({"source":null,"unit":"count"}),
        json!({"source":"gift","unit":null}),
        json!({"source":"gift","unit":"count","extra":true}),
    ] {
        let mut invalid = visual();
        invalid["input"] = input;
        assert!(serde_json::from_value::<Visual>(invalid).is_err());
    }
}

fn request(params: Value) -> Result<cc_types::RpcRequest, cc_types::ErrorEnvelope> {
    parse_request(
        &serde_json::to_vec(&json!({"method":"beacons.contribution.list","params":params}))
            .unwrap(),
    )
}

#[test]
fn recent_reads_bound_params_and_results_at_the_contract_door() {
    let contribution = json!({"source":"gift","broadcaster_id":"123",
        "event_id":"simulated-event","amount":50,"dedupe_key":"simulated-gift"});
    for limit in [1, 100] {
        let params = json!({"limit":limit});
        let parsed = request(params.clone()).unwrap();
        assert_eq!(serde_json::to_value(&parsed).unwrap()["params"], params);
        let result = json!({"items":vec![contribution.clone();limit as usize]});
        assert_eq!(parsed.validate_result(result.clone()).unwrap(), result);
        assert_eq!(
            parsed.validate_result(json!({"items":[]})).unwrap(),
            json!({"items":[]})
        );
        for invalid in [
            json!({"items":vec![contribution.clone();101]}),
            json!({"items":[null]}),
            json!({"items":null}),
            json!({"items":[],"extra":true}),
        ] {
            assert!(parsed.validate_result(invalid).is_err());
        }
    }
    for params in [
        json!({}),
        json!({"limit":0}),
        json!({"limit":101}),
        json!({"limit":-1}),
        json!({"limit":1.5}),
        json!({"limit":"1"}),
        json!({"limit":null}),
        json!({"limit":1,"extra":true}),
    ] {
        assert_eq!(request(params).unwrap_err().code, ErrorCode::Invalid);
    }
}
