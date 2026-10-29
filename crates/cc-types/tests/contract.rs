use cc_types::*;
use schemars::schema_for;
use serde_json::{Value, json};

const PLAN: &str = include_str!("../../../docs/plan/03-implementation-plan.md");
fn backticks(text: &str) -> Vec<&str> {
    text.split('`').skip(1).step_by(2).collect()
}

#[test]
fn method_table_and_events_match_the_plan_letter_for_letter() {
    let contract = PLAN.split("## Contract identifiers").nth(1).unwrap();
    let methods = contract
        .split("| Module | Methods |")
        .nth(1)
        .unwrap()
        .split("**Stream events")
        .next()
        .unwrap();
    assert_eq!(backticks(methods), RpcRequest::NAMES);
    let events = contract
        .split("**Stream events")
        .nth(1)
        .unwrap()
        .split("**Enums:")
        .next()
        .unwrap();
    let names: Vec<_> = backticks(events)
        .into_iter()
        .filter(|v| EventKind::NAMES.contains(v))
        .collect();
    assert_eq!(names, EventKind::NAMES);
    assert_eq!(RpcRequest::NAMES.len(), 51);
    assert_eq!(EventKind::NAMES.len(), 16);
    assert_eq!(
        method_schemas()
            .iter()
            .map(|s| s["name"].as_str().unwrap())
            .collect::<Vec<_>>(),
        RpcRequest::NAMES
    );
}

#[test]
fn every_enum_and_the_ten_error_codes_match_the_plan() {
    macro_rules! check { ($($ty:ty),+) => { $(
        let row = PLAN.lines().find(|line| line.starts_with(concat!("| `", stringify!($ty), "` |"))).unwrap();
        let expected = backticks(row).into_iter().skip(1).map(str::to_owned).collect::<Vec<_>>();
        assert_eq!(expected, <$ty>::VALUES);
        let schema = serde_json::to_value(schema_for!($ty)).unwrap();
        assert_eq!(schema["enum"], json!(expected));
        for value in expected {
            let parsed: $ty = serde_json::from_value(json!(value)).unwrap();
            assert_eq!(serde_json::to_value(parsed).unwrap(), json!(value));
        }
    )+ }; }
    check!(
        Verdict,
        RuleMode,
        RuleClass,
        PetitionOutcome,
        CliProvider,
        BridgeState,
        Action,
        DecisionKind,
        Tier,
        RoomMode,
        DrawContent,
        CheckResult,
        RandomnessSource,
        DesignStage,
        Operator,
        EngineLane,
        ErrorCode
    );
    assert_eq!(ErrorCode::VALUES.len(), 10);
    assert!(serde_json::from_value::<ErrorCode>(json!("eleventh_code")).is_err());
    assert_eq!(
        serde_json::to_value(schema_for!(ChatDelay)).unwrap()["enum"],
        json!([0, 2, 4, 6])
    );
    for delay in [0, 2, 4, 6] {
        assert!(ChatDelay::try_from(delay).is_ok());
    }
    assert!(ChatDelay::try_from(3).is_err());
}

#[test]
fn optional_values_are_omitted_and_explicit_null_is_refused() {
    let error = ErrorEnvelope::new(ErrorCode::Invalid, "simulated input");
    assert_eq!(
        serde_json::to_value(error).unwrap(),
        json!({"code": "invalid", "message": "simulated input"})
    );
    for field in ["detail", "retry_after_ms"] {
        let mut value = json!({"code": "invalid", "message": "simulated input"});
        value[field] = Value::Null;
        assert!(serde_json::from_value::<ErrorEnvelope>(value).is_err());
    }
    assert!(serde_json::from_value::<DataValue>(json!({"simulated": [null]})).is_err());
    let schema = serde_json::to_value(schema_for!(ErrorEnvelope)).unwrap();
    assert_eq!(schema["required"], json!(["code", "message"]));
    assert_eq!(schema["properties"]["retry_after_ms"]["type"], "integer");
}

#[test]
fn branded_ids_and_utc_timestamps_have_validating_doors() {
    macro_rules! slug { ($($ty:ty),+) => { $(
        assert!(<$ty>::try_from("simulated-rule-1".to_owned()).is_ok());
        for invalid in ["", "MixedCase", "two--parts", "-leading", "trailing-"] {
            assert!(<$ty>::try_from(invalid.to_owned()).is_err());
        }
    )+ }; }
    slug!(RuleId, DrawId, VisualId, DesignId);
    let decision = DecisionId::mint();
    assert!(DecisionId::try_from(decision.as_str().to_owned()).is_ok());
    assert_ne!(decision, DecisionId::mint());
    assert!(WritId::try_from(WritId::mint().as_str().to_owned()).is_ok());
    assert!(DrawRunId::try_from(DrawRunId::mint().as_str().to_owned()).is_ok());
    assert!(DecisionId::try_from("ZZZZZZZZZZZZZZZZZZZZZZZZZZ".to_owned()).is_err());
    assert!(MessageId::try_from("simulated-message-1".to_owned()).is_ok());
    for invalid in ["", "has spaces", "not\na-message"] {
        assert!(MessageId::try_from(invalid.to_owned()).is_err());
    }
    for invalid in [
        "yesterday",
        "2026-02-30T12:00:00Z",
        "2026-10-25T12:00:00+01:00",
    ] {
        assert!(Timestamp::try_from(invalid.to_owned()).is_err());
    }
    assert!(Timestamp::try_from("2026-10-25T12:00:00Z".to_owned()).is_ok());
}

#[test]
fn generated_request_dispatch_parses_core_and_refuses_unowned_shapes() {
    let request = parse_request(br#"{"method":"status.get","params":{}}"#).unwrap();
    assert_eq!(request.method(), "status.get");
    for invalid in [
        br#"{"method":"unknown.method","params":{}}"#.as_slice(),
        br#"{"method":"status.get","params":{"extra":true}}"#,
        br#"{"method":"lots.cast","params":{}}"#,
    ] {
        assert_eq!(parse_request(invalid).unwrap_err().code, ErrorCode::Invalid);
    }
    let valid = json!({"at": Timestamp::now(), "version":"0.1.0", "uptime_ms":0,
        "twitch_connected":false,"obs_connected":false,"simulated":true});
    assert!(request.validate_result(valid).is_ok());
    assert_eq!(
        request.validate_result(json!({})).unwrap_err().code,
        ErrorCode::Internal
    );
}

#[test]
fn twitch_ids_cross_as_strings_and_missing_auth_values_stay_absent() {
    let value = json!({"connected": false, "pending": false, "scopes": []});
    let status: TwitchAuthStatus = serde_json::from_value(value.clone()).unwrap();
    assert_eq!(serde_json::to_value(status).unwrap(), value);
    for id in [
        json!(null),
        json!(""),
        json!("not-an-id"),
        json!("123\n"),
        json!(123),
    ] {
        let mut invalid = value.clone();
        invalid["user_id"] = id;
        assert!(serde_json::from_value::<TwitchAuthStatus>(invalid).is_err());
    }
    let mut valid = value;
    valid["user_id"] = json!("9007199254740993");
    assert!(serde_json::from_value::<TwitchAuthStatus>(valid).is_ok());
}
