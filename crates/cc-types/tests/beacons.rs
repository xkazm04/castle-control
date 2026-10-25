use cc_types::*;
use serde_json::{Value, json};

// Generated simulated fixtures only; no service or real viewer data.
fn curve() -> Value {
    json!({"ranges":[{"total":0,"intensity":0.0},{"total":50,"intensity":1.0}],
        "decay":{"kind":"exponential","half_life_s":300}})
}
fn visual() -> Value {
    json!({"visual_id":"simulated-frame","name":"Simulated frame",
        "design_id":"simulated-design","curve":curve()})
}
fn intensity() -> Value {
    json!({"visual_id":"simulated-frame","intensity":0.5})
}
fn contribution() -> Value {
    json!({"source":"cheer","broadcaster_id":"9007199254740993",
        "user_id":"9007199254740994","event_id":"simulated-event",
        "amount":100,"dedupe_key":"simulated-cheer-1"})
}
fn request(method: &str, params: Value) -> Result<RpcRequest, ErrorEnvelope> {
    parse_request(&serde_json::to_vec(&json!({"method":method,"params":params})).unwrap())
}
fn cases() -> Vec<(&'static str, Value, Value, &'static str)> {
    vec![
        (
            "beacons.visual.list",
            json!({}),
            json!({"visuals":[visual()]}),
            "WP 3.1",
        ),
        (
            "beacons.visual.upsert",
            json!({"visual":visual()}),
            visual(),
            "WP 3.1",
        ),
        (
            "beacons.curve.set",
            json!({"visual_id":"simulated-frame","curve":curve()}),
            visual(),
            "WP 3.1",
        ),
        (
            "beacons.simulate",
            json!({"visual_id":"simulated-frame","burst":{"source":"gift","amount":50}}),
            json!({"label":"simulated","intensity":intensity()}),
            "WP 3.1",
        ),
        (
            "beacons.source.url",
            json!({"visual_id":"simulated-frame"}),
            json!({"url":"http://localhost:4312/visuals/simulated-frame?hash=abc"}),
            "WP 3.2",
        ),
    ]
}

#[test]
fn five_methods_are_typed_and_keep_owners() {
    for (method, params, result, owner) in cases() {
        let req = request(method, params.clone()).unwrap();
        assert_eq!(req.validate_result(result.clone()).unwrap(), result);
        let schema = method_schemas()
            .into_iter()
            .find(|m| m["name"] == method)
            .unwrap();
        assert_eq!(schema["owner"], owner);
        for key in params
            .as_object()
            .unwrap()
            .keys()
            .chain(std::iter::once(&"extra".to_owned()))
        {
            let mut bad = params.clone();
            bad[key] = Value::Null;
            assert!(request(method, bad).is_err());
        }
        for key in result
            .as_object()
            .unwrap()
            .keys()
            .chain(std::iter::once(&"extra".to_owned()))
        {
            let mut bad = result.clone();
            bad[key] = Value::Null;
            assert!(req.validate_result(bad).is_err());
        }
    }
}

fn closed<T: serde::de::DeserializeOwned>(base: Value, optional: &[&str]) {
    assert!(serde_json::from_value::<T>(base.clone()).is_ok());
    let mut bad = base.clone();
    bad["extra"] = json!(true);
    assert!(serde_json::from_value::<T>(bad).is_err());
    for key in base
        .as_object()
        .unwrap()
        .keys()
        .map(String::as_str)
        .chain(optional.iter().copied())
    {
        let mut bad = base.clone();
        bad[key] = Value::Null;
        assert!(
            serde_json::from_value::<T>(bad).is_err(),
            "accepted null {key}"
        );
    }
}

#[test]
fn nested_records_are_closed_and_absence_is_omitted() {
    closed::<Visual>(visual(), &[]);
    closed::<IntensityCurve>(curve(), &[]);
    closed::<IntensityRange>(json!({"total":50,"intensity":1}), &[]);
    closed::<IntensityDecay>(json!({"kind":"exponential","half_life_s":300}), &[]);
    closed::<IntensityDecay>(json!({"kind":"none"}), &[]);
    closed::<SimulatedBurst>(json!({"source":"gift","amount":50}), &[]);
    closed::<Contribution>(contribution(), &[]);
    closed::<BeaconsIntensity>(intensity(), &[]);
    let mut v = visual();
    v.as_object_mut().unwrap().remove("design_id");
    let typed: Visual = serde_json::from_value(v.clone()).unwrap();
    assert_eq!(serde_json::to_value(typed).unwrap(), v);
    closed::<Visual>(v, &["design_id"]);
    let mut c = contribution();
    c.as_object_mut().unwrap().remove("user_id");
    let typed: Contribution = serde_json::from_value(c.clone()).unwrap();
    assert_eq!(serde_json::to_value(typed).unwrap(), c);
    closed::<Contribution>(c, &["user_id"]);
}

#[test]
fn scalar_boundaries_and_unknown_enums_are_rejected() {
    for value in [-0.01, 1.01, f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
        assert!(Intensity::try_from(value).is_err());
    }
    for value in [0.0, 0.5, 1.0] {
        assert!(Intensity::try_from(value).is_ok());
    }
    for (key, value) in [
        ("visual_id", json!("Bad Id")),
        ("name", json!(" \n\t")),
        ("design_id", json!("Bad Id")),
        ("name", json!("")),
    ] {
        let mut v = visual();
        v[key] = value;
        assert!(serde_json::from_value::<Visual>(v).is_err());
    }
    for amount in [json!(-1), json!(0.5), json!(4294967296_u64), json!("50")] {
        let mut c = contribution();
        c["amount"] = amount.clone();
        assert!(serde_json::from_value::<Contribution>(c).is_err());
        assert!(
            serde_json::from_value::<SimulatedBurst>(json!({"source":"gift","amount":amount}))
                .is_err()
        );
        assert!(
            serde_json::from_value::<IntensityRange>(json!({"total":amount,"intensity":0.5}))
                .is_err()
        );
    }
    for bad in [
        json!({"kind":"linear","half_life_s":1}),
        json!({"kind":"none","half_life_s":1}),
        json!({"kind":"exponential","half_life_s":0}),
        json!({"kind":"exponential","half_life_s":0.5}),
        json!({"kind":"exponential","half_life_s":4294967296_u64}),
    ] {
        assert!(serde_json::from_value::<IntensityDecay>(bad).is_err());
    }
    assert!(
        serde_json::from_value::<IntensityCurve>(json!({"ranges":[],"decay":{"kind":"none"}}))
            .is_err()
    );
    for (key, bad) in [
        ("source", json!("unknown")),
        ("dedupe_key", json!(" \n")),
        ("broadcaster_id", json!(123)),
        ("user_id", json!("0")),
        ("event_id", json!("")),
    ] {
        let mut c = contribution();
        c[key] = bad;
        assert!(serde_json::from_value::<Contribution>(c).is_err());
    }
    let req = request("beacons.simulate", cases()[3].1.clone()).unwrap();
    assert!(
        req.validate_result(json!({"label":"live","intensity":intensity()}))
            .is_err()
    );
}

#[test]
fn ten_sources_and_overlapping_cheer_identity_bind_only_to_beacons_events() {
    for source in [
        "cheer",
        "bits_use",
        "subscribe",
        "gift",
        "resub",
        "hype_train",
        "channel_points",
        "charity",
        "goal",
        "power_up",
    ] {
        let mut c = contribution();
        c["source"] = json!(source);
        let v = json!({"kind":"beacons.contribution","payload":c});
        let typed: BeaconsEventPayload = serde_json::from_value(v.clone()).unwrap();
        assert_eq!(serde_json::to_value(typed).unwrap(), v);
    }
    let mut bits = contribution();
    bits["source"] = json!("bits_use");
    bits["event_id"] = json!("other-transport-event");
    assert_eq!(bits["dedupe_key"], contribution()["dedupe_key"]);
    for v in [
        json!({"kind":"beacons.intensity","payload":intensity()}),
        json!({"kind":"beacons.contribution","payload":contribution()}),
    ] {
        closed::<BeaconsEventPayload>(v, &[]);
    }
    for kind in ["lots.roll", "gatehouse.verdict", "beacons.unknown"] {
        assert!(
            serde_json::from_value::<BeaconsEventPayload>(
                json!({"kind":kind,"payload":contribution()})
            )
            .is_err()
        );
    }
    // Beacons fields cannot cross existing module boundaries.
    let mut rule = json!({"rule_id":"simulated-rule","name":"Simulated rule","rule_class":"pattern",
        "mode":"shadow","action":"delete","delivery":"simulated","pattern":"example"});
    rule["contribution"] = contribution();
    assert!(serde_json::from_value::<Rule>(rule).is_err());
    let mut entry = json!({"user_id":"123","source_message_id":"simulated-message",
        "entered_at":"2026-10-26T12:00:00Z","cohorts":[],"weight":1});
    entry["contribution"] = contribution();
    assert!(serde_json::from_value::<LotsRollEntry>(entry).is_err());
}

#[test]
fn source_urls_are_canonical_loopback_only() {
    for host in ["localhost", "127.0.0.1", "[::1]"] {
        for port in [1, 4312, 65535] {
            assert!(
                LoopbackSourceUrl::try_from(format!(
                    "http://{host}:{port}/visuals/simulated-frame?hash=abc"
                ))
                .is_ok()
            );
        }
    }
    for url in [
        "https://localhost:4312/",
        "http://example.com:4312/",
        "http://localhost.evil:4312/",
        "http://localhost@evil:4312/",
        "http://localhost:0/",
        "http://localhost:65536/",
        "http://localhost:01/",
        "http://localhost/",
        "http://127.0.0.2:4312/",
        "http://localhost:4312/#fragment",
        "http://localhost:4312/\n",
        "http://localhost:4312/%zz",
    ] {
        assert!(
            LoopbackSourceUrl::try_from(url.to_owned()).is_err(),
            "accepted {url}"
        );
    }
}
