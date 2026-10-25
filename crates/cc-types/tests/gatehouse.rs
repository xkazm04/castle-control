use cc_types::*;
use serde_json::{Value, json};

const AT: &str = "2026-10-25T12:00:00Z";
const ID: &str = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

fn rule() -> Value {
    json!({"rule_id":"simulated-links", "name":"Simulated links", "rule_class":"pattern",
        "mode":"shadow", "action":"ban", "delivery":"streamer"})
}

fn decision() -> Value {
    json!({"decision_id":ID, "message_id":"simulated-message", "kind":"ban_pending",
        "verdict":"hold", "operator":"human", "at":AT, "simulated":true,
        "reason_codes":["simulated_pattern_match"], "message_text":"Simulated original message"})
}

fn cases() -> Vec<(&'static str, Value, Value)> {
    vec![
        ("gatehouse.rules.list", json!({}), json!({"rules":[rule()]})),
        ("gatehouse.rules.upsert", json!({"rule":rule()}), rule()),
        (
            "gatehouse.rules.setMode",
            json!({"rule_id":"simulated-links", "mode":"armed",
            "acknowledgement":{"at":AT,"reason":"Simulated consent"}}),
            decision(),
        ),
        (
            "gatehouse.ban.confirm",
            json!({"decision_id":ID}),
            decision(),
        ),
        (
            "gatehouse.ban.dismiss",
            json!({"decision_id":ID}),
            decision(),
        ),
        (
            "gatehouse.decision.undo",
            json!({"decision_id":ID}),
            decision(),
        ),
        (
            "gatehouse.petition.resolve",
            json!({"decision_id":ID, "outcome":"upheld"}),
            decision(),
        ),
    ]
}

#[test]
fn seven_wp_1_1_methods_round_trip_params_and_results() {
    for (method, params, result) in cases() {
        let value = json!({"method":method,"params":params});
        let request = parse_request(&serde_json::to_vec(&value).unwrap()).unwrap();
        assert_eq!(serde_json::to_value(&request).unwrap(), value);
        assert_eq!(request.validate_result(result.clone()).unwrap(), result);
    }
}

fn grant() -> Value {
    json!({"expires_at":"2026-10-25T13:00:00Z", "max_bans_per_hour":3,
        "breaker_tripped":false})
}

fn round_trip<T: serde::de::DeserializeOwned + serde::Serialize>(value: Value) {
    let parsed: T = serde_json::from_value(value.clone()).unwrap();
    assert_eq!(serde_json::to_value(parsed).unwrap(), value);
}

#[test]
fn rules_grants_and_decisions_round_trip_with_absent_keys_omitted() {
    round_trip::<Rule>(rule());
    let mut pattern = rule();
    pattern["mode"] = json!("armed");
    pattern["auto_ban_grant"] = grant();
    round_trip::<Rule>(pattern);
    round_trip::<AutoBanGrant>(grant());
    round_trip::<Decision>(decision());
    let mut completed = decision();
    completed["kind"] = json!("would_act");
    completed["rule_id"] = json!("simulated-links");
    completed.as_object_mut().unwrap().remove("message_text");
    round_trip::<Decision>(completed);
    round_trip::<RulesSetModeParams>(json!({"rule_id":"simulated-links","mode":"shadow"}));
    round_trip::<PetitionResolveParams>(json!({"decision_id":ID,"outcome":"overturned"}));
    for class in ["rail", "classifier"] {
        let mut value = rule();
        value["rule_class"] = json!(class);
        value["mode"] = json!("armed");
        round_trip::<Rule>(value);
    }
}

#[test]
fn grants_are_pattern_only_bounded_and_strictly_parsed() {
    for class in ["rail", "classifier", "unknown"] {
        let mut value = rule();
        value["mode"] = json!("armed");
        value["rule_class"] = json!(class);
        value["auto_ban_grant"] = grant();
        assert!(serde_json::from_value::<Rule>(value).is_err());
    }
    for cap in [json!(0), json!(-1), json!(1.5), json!(4294967296_u64)] {
        let mut value = grant();
        value["max_bans_per_hour"] = cap;
        assert!(serde_json::from_value::<AutoBanGrant>(value).is_err());
    }
    let mut value = grant();
    value["expires_at"] = json!("2026-10-25T13:00:00+01:00");
    assert!(serde_json::from_value::<AutoBanGrant>(value).is_err());
    let mut value = rule();
    value["auto_ban_grant"] = grant();
    value["auto_ban_grant"]["breaker_tripped"] = json!(true);
    round_trip::<Rule>(value);
}

#[test]
fn rails_cannot_be_shadowed_and_arming_needs_nonblank_timestamped_consent() {
    let mut rail = rule();
    rail["rule_class"] = json!("rail");
    assert!(serde_json::from_value::<Rule>(rail).is_err());
    let base = json!({"rule_id":"simulated-links","mode":"armed"});
    assert!(serde_json::from_value::<RulesSetModeParams>(base.clone()).is_err());
    for acknowledgement in [
        json!(null),
        json!(true),
        json!({"at":AT,"reason":" "}),
        json!({"at":"not-a-time","reason":"Simulated consent"}),
    ] {
        let mut value = base.clone();
        value["acknowledgement"] = acknowledgement;
        assert!(serde_json::from_value::<RulesSetModeParams>(value).is_err());
    }
}

#[test]
fn ban_queue_requires_original_text_and_unknown_enums_are_never_coerced() {
    let mut value = decision();
    value.as_object_mut().unwrap().remove("message_text");
    assert!(serde_json::from_value::<Decision>(value.clone()).is_err());
    value["summary"] = json!("Simulated summary is not the original");
    assert!(serde_json::from_value::<Decision>(value).is_err());
    for key in ["kind", "verdict", "operator"] {
        let mut value = decision();
        value[key] = json!("unknown");
        assert!(serde_json::from_value::<Decision>(value).is_err());
    }
    for key in ["rule_class", "mode", "action"] {
        let mut value = rule();
        value[key] = json!("unknown");
        assert!(serde_json::from_value::<Rule>(value).is_err());
    }
    assert!(serde_json::from_value::<PetitionOutcome>(json!("unknown")).is_err());
}

fn rejects_null_and_unknown<T: serde::de::DeserializeOwned>(base: Value, optional: &[&str]) {
    assert!(serde_json::from_value::<T>(json!(null)).is_err());
    for key in base
        .as_object()
        .unwrap()
        .keys()
        .map(String::as_str)
        .chain(optional.iter().copied())
    {
        let mut value = base.clone();
        value[key] = json!(null);
        assert!(
            serde_json::from_value::<T>(value).is_err(),
            "accepted null {key}"
        );
    }
    let mut value = base;
    value["extra"] = json!(true);
    assert!(serde_json::from_value::<T>(value).is_err());
}

#[test]
fn every_record_rejects_null_and_unknown_fields_including_optional_keys() {
    rejects_null_and_unknown::<Rule>(rule(), &["auto_ban_grant"]);
    rejects_null_and_unknown::<AutoBanGrant>(grant(), &[]);
    rejects_null_and_unknown::<Decision>(decision(), &["rule_id"]);
    rejects_null_and_unknown::<ModeAcknowledgement>(
        json!({"at":AT,"reason":"Simulated consent"}),
        &[],
    );
    rejects_null_and_unknown::<RulesSetModeParams>(
        json!({"rule_id":"simulated-links","mode":"shadow"}),
        &["acknowledgement"],
    );
    rejects_null_and_unknown::<RulesListResult>(json!({"rules":[rule()]}), &[]);
    rejects_null_and_unknown::<RulesUpsertParams>(json!({"rule":rule()}), &[]);
    rejects_null_and_unknown::<DecisionParams>(json!({"decision_id":ID}), &[]);
    rejects_null_and_unknown::<PetitionResolveParams>(
        json!({"decision_id":ID,"outcome":"upheld"}),
        &[],
    );
    let mut value = decision();
    value["reason_codes"] = json!([null]);
    assert!(serde_json::from_value::<Decision>(value).is_err());
}

#[test]
fn later_gatehouse_and_all_lots_payloads_remain_pending() {
    let schemas = method_schemas();
    let pending: Vec<_> = schemas
        .iter()
        .filter(|method| {
            let name = method["name"].as_str().unwrap();
            name.starts_with("lots.")
                || (name.starts_with("gatehouse.") && method["owner"] != "WP 1.1")
        })
        .collect();
    assert_eq!(pending.len(), 15);
    for method in pending {
        assert_eq!(method["params"]["not"], json!({}));
        assert_eq!(method["result"]["not"], json!({}));
        assert_eq!(
            parse_request(
                &serde_json::to_vec(&json!({"method":method["name"],"params":{}})).unwrap()
            )
            .unwrap_err()
            .code,
            ErrorCode::Invalid
        );
    }
}
