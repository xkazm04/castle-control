use cc_types::*;
use serde_json::{Value, json};

// Generated, simulated data. TypeScript consumes these exact fixture bytes too.
fn fixtures() -> Vec<Value> {
    serde_json::from_str(include_str!("fixtures/gatehouse_gate.json")).unwrap()
}
fn request(value: &Value) -> Result<RpcRequest, ErrorEnvelope> {
    parse_request(&serde_json::to_vec(value).unwrap())
}

#[test]
fn shared_gate_fixtures_round_trip_typed_requests_and_results() {
    let values = fixtures();
    assert_eq!(values.len(), 9);
    for value in values {
        let parsed = request(&value["request"]).unwrap();
        assert_eq!(serde_json::to_value(&parsed).unwrap(), value["request"]);
        assert_eq!(
            parsed.validate_result(value["result"].clone()).unwrap(),
            value["result"]
        );
    }
}

#[test]
fn every_gate_record_rejects_missing_null_and_unknown_fields() {
    for value in fixtures() {
        let valid = value["request"].clone();
        let parsed = request(&valid).unwrap();
        for pointer in ["/params", ""] {
            let mut bad = valid.clone();
            bad.pointer_mut(pointer).unwrap()["extra"] = json!(true);
            assert!(request(&bad).is_err());
        }
        for key in valid["params"].as_object().unwrap().keys() {
            let mut bad = valid.clone();
            bad["params"][key] = Value::Null;
            assert!(request(&bad).is_err());
            bad["params"].as_object_mut().unwrap().remove(key);
            assert!(request(&bad).is_err());
        }
        let mut bad = valid.clone();
        bad["params"] = Value::Null;
        assert!(request(&bad).is_err());
        let result = value["result"].clone();
        for key in result.as_object().unwrap().keys() {
            let mut bad = result.clone();
            bad[key] = Value::Null;
            assert!(parsed.validate_result(bad).is_err());
        }
        let mut bad = result.clone();
        bad["extra"] = json!(true);
        assert!(parsed.validate_result(bad).is_err());
        assert!(parsed.validate_result(Value::Null).is_err());
        // Optional Decision keys must be omitted when absent, never present as null.
        if result.get("decision_id").is_some() {
            for key in ["rule_id", "message_text"] {
                let mut bad = result.clone();
                bad[key] = Value::Null;
                assert!(parsed.validate_result(bad).is_err());
            }
        }
    }
}

#[test]
fn gate_scalar_validation_is_strict_for_both_params_and_results() {
    for delay in [
        json!(-1),
        json!(1),
        json!(3),
        json!(5),
        json!(7),
        json!(256),
        json!(2.5),
        json!("2"),
        json!(true),
    ] {
        let params = json!({"delay_s":delay});
        assert!(request(&json!({"method":"gatehouse.delay.set","params":params})).is_err());
        let parsed = request(&fixtures()[2]["request"]).unwrap();
        assert!(parsed.validate_result(params).is_err());
    }
    for enabled in [json!(0), json!(1), json!("on"), json!("off")] {
        let params = json!({"enabled":enabled});
        assert!(request(&json!({"method":"gatehouse.shield.set","params":params})).is_err());
        let parsed = request(&fixtures()[6]["request"]).unwrap();
        assert!(parsed.validate_result(params).is_err());
    }
    for outcome in [
        json!("pass"),
        json!("released"),
        json!("unknown"),
        json!(true),
    ] {
        assert!(
            request(&json!({"method":"gatehouse.held.resolve","params":{
                "message_id":"simulated-held","outcome":outcome
            }}))
            .is_err()
        );
    }
    for id in [json!(""), json!("bad id"), json!(42), json!("simulated\n")] {
        assert!(
            request(&json!({"method":"gatehouse.held.resolve","params":{
                "message_id":id,"outcome":"allow"
            }}))
            .is_err()
        );
    }
    for id in [
        json!(""),
        json!(42),
        json!("not-ulid"),
        json!("81ARZ3NDEKTSV4RRFFQ69G5FAX"),
        json!("01arz3ndektsv4rrffq69g5fax"),
        json!("01ARZ3NDEKTSV4RRFFQ69G5FAX\n"),
    ] {
        assert!(
            request(&json!({"method":"gatehouse.lease.end","params":{"lease_id":id}})).is_err()
        );
    }
}

#[test]
fn gate_decisions_and_rate_limit_envelope_reuse_existing_constraints() {
    for value in [fixtures()[0].clone(), fixtures()[8].clone()] {
        let parsed = request(&value["request"]).unwrap();
        for (key, bad_value) in [
            ("decision_id", json!("not-ulid")),
            ("at", json!("2026-02-30T12:00:00Z")),
            ("kind", json!("unknown")),
            ("verdict", json!("unknown")),
        ] {
            let mut bad = value["result"].clone();
            bad[key] = bad_value;
            assert!(parsed.validate_result(bad).is_err());
        }
    }
    let limited = json!({"code":"rate_limited","message":"Simulated limit","retry_after_ms":2000});
    let parsed: ErrorEnvelope = serde_json::from_value(limited.clone()).unwrap();
    assert_eq!(parsed.code, ErrorCode::RateLimited);
    assert_eq!(serde_json::to_value(parsed).unwrap(), limited);
}
