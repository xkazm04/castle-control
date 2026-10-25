use cc_types::{ErrorCode, StatusResult, parse_request};
use serde_json::{Value, json};

fn status() -> Value {
    json!({"at": "2026-10-25T12:00:00Z", "version": "0.1.0", "uptime_ms": 42,
        "twitch_connected": false, "obs_connected": false, "simulated": true})
}

#[test]
fn summaries_round_trip_with_unknown_values_omitted() {
    let value = status();
    let parsed: StatusResult = serde_json::from_value(value.clone()).unwrap();
    assert_eq!(serde_json::to_value(parsed).unwrap(), value);
    for stream in [
        json!({"live": false}),
        json!({"live": true, "started_at": "2026-10-25T11:00:00Z", "viewer_count": 0}),
    ] {
        let mut value = status();
        value["stream"] = stream;
        value["gatehouse"] = json!({"armed_rules": 0, "shadow_rules": 2, "shield": false});
        let parsed: StatusResult = serde_json::from_value(value.clone()).unwrap();
        assert_eq!(serde_json::to_value(parsed).unwrap(), value);
    }
}

#[test]
fn summaries_reject_null_unknown_fields_and_invalid_counters() {
    for extra in [
        json!({"stream": null}),
        json!({"gatehouse": null}),
        json!({"unknown": true}),
        json!({"stream": {"live": true, "started_at": null}}),
        json!({"stream": {"live": true, "viewer_count": null}}),
        json!({"stream": {"live": true, "viewer_count": -1}}),
        json!({"stream": {"live": true, "viewer_count": 4294967296_u64}}),
        json!({"stream": {"live": true, "started_at": "yesterday"}}),
        json!({"stream": {"live": false, "unknown": true}}),
        json!({"gatehouse": {"armed_rules": 0, "shadow_rules": 0, "shield": false, "unknown": true}}),
    ] {
        let mut value = status();
        value
            .as_object_mut()
            .unwrap()
            .extend(extra.as_object().unwrap().clone());
        assert!(
            serde_json::from_value::<StatusResult>(value.clone()).is_err(),
            "{value}"
        );
    }
}

#[test]
fn bridge_read_round_trips_states_and_optional_gap() {
    let request = parse_request(br#"{"method":"bridge.status.get","params":{}}"#).unwrap();
    for state in ["disconnected", "connecting", "connected", "error"] {
        for last_gap in [
            None,
            Some(json!({
                "from": "2026-10-25T11:59:00Z", "to": "2026-10-25T12:00:00Z"
            })),
        ] {
            let mut value = json!({"state": state});
            if let Some(gap) = last_gap {
                value["last_gap"] = gap;
            }
            assert_eq!(request.validate_result(value.clone()).unwrap(), value);
        }
    }
    for value in [
        json!({"state": "unknown"}),
        json!({"state": "connected", "last_gap": null}),
        json!({"state": "connected", "detail": "simulated"}),
        json!({"state": "connected", "last_gap": {"from": "yesterday", "to": "2026-10-25T12:00:00Z"}}),
        json!({"state": "connected", "last_gap": {"from": "2026-10-25T11:59:00Z", "to": "2026-10-25T12:00:00Z", "unknown": true}}),
    ] {
        assert_eq!(
            request.validate_result(value).unwrap_err().code,
            ErrorCode::Internal
        );
    }
}
