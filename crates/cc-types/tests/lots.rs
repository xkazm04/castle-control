use cc_types::*;
use serde_json::{Value, json};

const ID: &str = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const AT: &str = "2026-10-25T12:00:00Z";

fn fixture() -> Value {
    serde_json::from_str(include_str!(
        "../../../packages/verifier-web/src/simulated-writs.json"
    ))
    .unwrap()
}

fn draw() -> Value {
    json!({"draw_id":"simulated-draw", "name":"Simulated draw", "policy":{
        "content":"question", "paid_entry":false, "paid_weight":false,
        "subscriber_only":false, "channel_points":false, "free_entry_equal_odds":true,
        "regions":[], "prize_value_usd_cents":0, "registration_confirmed":false,
        "official_rules":true, "twitch_disclaimer":true}, "rules":{
        "pool":{"kind":"chatters"}, "winner_count":1, "cooldown_s":0,
        "cohort_caps":[], "weight_curve":{"kind":"equal"}, "free_join_equal_odds":true}})
}

fn cases() -> Vec<(&'static str, Value, Value)> {
    let draw = draw();
    let writ = fixture()["cases"][0]["writ"].clone();
    vec![
        ("lots.draw.list", json!({}), json!({"draws":[draw]})),
        ("lots.draw.upsert", json!({"draw":draw}), draw.clone()),
        (
            "lots.draw.check",
            json!({"policy":draw["policy"]}),
            json!({"result":"ok","reasons":[]}),
        ),
        (
            "lots.roll.lookup",
            json!({"draw_id":"simulated-draw","user_id":"9007199254740993"}),
            json!({"draw_id":"simulated-draw"}),
        ),
        (
            "lots.roll.seal",
            json!({"draw_id":"simulated-draw","source":"drand_quicknet","margin_s":6}),
            json!({"draw_id":"simulated-draw","draw_run_id":ID,"sealed":{"roll":writ["roll"],"seal":writ["seal"]}}),
        ),
        (
            "lots.cast",
            json!({"draw_run_id":ID}),
            json!({"draw_run_id":ID,"writ_id":ID,
            "cast":{"seal":writ["seal"],"winners":writ["winners"],"label":"drand-quicknet"}}),
        ),
        ("lots.writ.get", json!({"writ_id":ID}), writ),
    ]
}

#[test]
fn all_seven_methods_are_typed_and_keep_their_owners() {
    for (method, params, result) in cases() {
        let request =
            parse_request(&serde_json::to_vec(&json!({"method":method,"params":params})).unwrap())
                .unwrap();
        assert_eq!(request.method(), method);
        assert_eq!(request.validate_result(result.clone()).unwrap(), result);
        let schema = method_schemas()
            .into_iter()
            .find(|s| s["name"] == method)
            .unwrap();
        let owner = if method.starts_with("lots.draw.") || method == "lots.roll.lookup" {
            "WP 2.1"
        } else {
            "WP 2.2"
        };
        assert_eq!(schema["owner"], owner);
        assert!(schema["params"].get("not").is_none());
        assert!(schema["result"].get("not").is_none());
        for key in params.as_object().unwrap().keys() {
            let mut bad = params.clone();
            bad[key] = Value::Null;
            assert!(
                parse_request(&serde_json::to_vec(&json!({"method":method,"params":bad})).unwrap())
                    .is_err()
            );
        }
        let mut bad = params;
        bad["extra"] = json!(true);
        assert!(
            parse_request(&serde_json::to_vec(&json!({"method":method,"params":bad})).unwrap())
                .is_err()
        );
        let mut bad = result;
        bad["extra"] = json!(true);
        assert!(request.validate_result(bad).is_err());
    }
}

#[test]
fn original_cc_verify_fixture_round_trips_without_a_second_writ_format() {
    let fixture = fixture();
    assert_eq!(fixture["label"], "simulated");
    let cases = fixture["cases"].as_array().unwrap();
    assert_eq!(cases.len(), 1000);
    for case in cases {
        let parsed: LotsWrit = serde_json::from_value(case["writ"].clone()).unwrap();
        assert_eq!(serde_json::to_value(parsed).unwrap(), case["writ"]);
    }
}

#[test]
fn three_event_payloads_bind_only_their_existing_names() {
    let samples = cases();
    let roll = json!({"draw_id":"simulated-draw","weight_table":{
        "rows":[],"newcomer_weight":1,"heaviest_weight":0}});
    for (kind, payload) in [
        ("lots.roll", roll),
        ("lots.sealed", samples[4].2.clone()),
        ("lots.cast", samples[5].2.clone()),
    ] {
        let value = json!({"kind":kind,"payload":payload});
        let parsed: LotsEventPayload = serde_json::from_value(value.clone()).unwrap();
        assert_eq!(serde_json::to_value(parsed).unwrap(), value);
        let mut bad = value.clone();
        bad["payload"]["extra"] = json!(true);
        assert!(serde_json::from_value::<LotsEventPayload>(bad).is_err());
        let mut bad = value.clone();
        bad["extra"] = json!(true);
        assert!(serde_json::from_value::<LotsEventPayload>(bad).is_err());
        let mut bad = value;
        bad["payload"] = Value::Null;
        assert!(serde_json::from_value::<LotsEventPayload>(bad).is_err());
    }
}

#[test]
fn round_and_numeric_id_strings_are_validated_without_float_conversion() {
    for round in ["1", "9007199254740993", "18446744073709551615"] {
        assert!(LotsRound::try_from(round.to_owned()).is_ok());
    }
    for round in [
        "",
        "0",
        "01",
        "-1",
        "+1",
        "1.5",
        "1e3",
        "1\n",
        "18446744073709551616",
    ] {
        assert!(LotsRound::try_from(round.to_owned()).is_err(), "{round}");
    }
    for user in ["0", "01", "123\n", "x", &"1".repeat(33)] {
        assert!(TwitchUserId::try_from(user.to_owned()).is_err());
    }
    assert!(TwitchUserId::try_from("9007199254740993".to_owned()).is_ok());
    assert!(LotsUnsigned::try_from(9_007_199_254_740_991).is_ok());
    assert!(LotsUnsigned::try_from(9_007_199_254_740_992).is_err());
}

#[test]
fn optional_keys_reject_null_and_absent_entries_stay_absent() {
    let value = json!({"draw_id":"simulated-draw"});
    let parsed: RollLookupResult = serde_json::from_value(value.clone()).unwrap();
    assert_eq!(serde_json::to_value(parsed).unwrap(), value);
    assert!(
        serde_json::from_value::<RollLookupResult>(
            json!({"draw_id":"simulated-draw","entry":null})
        )
        .is_err()
    );
    let mut policy = draw()["policy"].clone();
    policy["minimum_age"] = Value::Null;
    assert!(serde_json::from_value::<LotsDrawPolicy>(policy).is_err());
    assert!(
        serde_json::from_value::<LotsWeightTable>(json!({"rows":[],"newcomer_weight":1,
        "heaviest_weight":0,"newcomers_to_outweigh_heaviest":null}))
        .is_err()
    );
}

#[test]
fn nested_records_and_scalar_bounds_reject_invalid_shapes() {
    let value = fixture()["cases"][0]["writ"].clone();
    for path in ["", "/roll", "/roll/entries/0", "/roll/randomness", "/proof"] {
        let mut bad = value.clone();
        bad.pointer_mut(path)
            .unwrap()
            .as_object_mut()
            .unwrap()
            .insert("extra".into(), json!(true));
        assert!(serde_json::from_value::<LotsWrit>(bad).is_err(), "{path}");
    }
    for (path, replacement) in [
        ("/roll/version", json!(2)),
        ("/roll/margin_s", json!(0)),
        ("/roll/winner_count", json!(0)),
        ("/roll/entries/0/weight", json!(0)),
        ("/roll/sealed_at", json!(AT.replace('Z', ".123Z"))),
        ("/roll/randomness/round", json!("01")),
        ("/roll/entries/0/handle", json!("Uppercase")),
        ("/proof/signature", json!("ab")),
        ("/roll/entries", json!([])),
        ("/winners", json!([])),
        ("/roll/sealed_at", json!("1969-12-31T23:59:59Z")),
    ] {
        let mut bad = value.clone();
        *bad.pointer_mut(path).unwrap() = replacement;
        assert!(serde_json::from_value::<LotsWrit>(bad).is_err(), "{path}");
    }
    for count in [0, 65536] {
        let mut bad = draw();
        bad["rules"]["winner_count"] = json!(count);
        assert!(serde_json::from_value::<LotsDraw>(bad).is_err());
    }
    for keyword in ["", "two words", "x\u{0085}y"] {
        assert!(LotsKeyword::try_from(keyword.to_owned()).is_err());
    }
    assert!(LotsKeyword::try_from("x\u{feff}y".to_owned()).is_ok());
    let entry = json!({"user_id":"1","source_message_id":"simulated-message",
        "entered_at":AT,"cohorts":["simulated","simulated"],"weight":1});
    assert!(serde_json::from_value::<LotsRollEntry>(entry).is_err());
}
