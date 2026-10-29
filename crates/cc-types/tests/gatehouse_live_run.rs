use cc_types::{GatehouseLiveRunResult, parse_request};
use serde_json::{Value, json};

#[test]
fn live_capture_contract_accepts_retained_and_unavailable_coverage() {
    let fixture: Value =
        serde_json::from_str(include_str!("fixtures/gatehouse_live_run.json")).unwrap();
    let request =
        parse_request(br#"{"method":"gatehouse.liveRun.get","params":{"limit":2}}"#).unwrap();
    assert_eq!(request.validate_result(fixture.clone()).unwrap(), fixture);
    for malformed in [
        json!({"items":[], "unavailable_count":0, "next_cursor":null}),
        json!({"items":[{"coverage":"unavailable","decision_id":"bad","reason":"capture_unavailable"}], "unavailable_count":1}),
        json!({"items":vec![fixture["items"][0].clone();101], "unavailable_count":0}),
    ] {
        assert!(serde_json::from_value::<GatehouseLiveRunResult>(malformed).is_err());
    }
    for field in ["instrument_hash", "inputs", "configuration"] {
        let mut malformed = fixture.clone();
        malformed["items"][0]["capture"][field] = Value::Null;
        assert!(request.validate_result(malformed).is_err());
    }
    for field in ["bank", "judge", "prompts"] {
        let mut malformed = fixture.clone();
        malformed["items"][0]["capture"]["inputs"][field] = json!(true);
        assert!(request.validate_result(malformed).is_err());
    }
    let mut malformed = fixture;
    malformed["items"][0]["capture"]["replay_gap"] = Value::Null;
    assert!(request.validate_result(malformed).is_err());
}

#[test]
fn live_capture_requests_refuse_unbounded_pages_and_caller_hashes() {
    for params in [
        json!({"limit":0}),
        json!({"limit":101}),
        json!({"limit":1,"cursor":"liveRun:01"}),
        json!({"limit":1,"instrument_hash":"a".repeat(64)}),
    ] {
        assert!(
            parse_request(
                &serde_json::to_vec(&json!({"method":"gatehouse.liveRun.get","params":params}))
                    .unwrap()
            )
            .is_err()
        );
    }
    for method in ["gatehouse.drill.run", "gatehouse.drill.diff"] {
        let configuration =
            json!({"rules":[],"bank":"simulated-bank","judge":"rules-only","prompts":[]});
        let params = if method.ends_with("run") {
            json!({"recording":"simulated","configuration":configuration,"instrument_hash":"a".repeat(64)})
        } else {
            json!({"recording":"simulated","baseline":configuration,"candidate":configuration,"instrument_hash":"a".repeat(64)})
        };
        assert!(
            parse_request(&serde_json::to_vec(&json!({"method":method,"params":params})).unwrap())
                .is_err()
        );
    }
}
