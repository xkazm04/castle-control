use cc_types::*;
use serde_json::{Value, json};

// Fabricated, simulated assets and receipts only; no provider or keychain calls.
fn params() -> Value {
    json!({"design_id":"simulated-design","prompt":"A simulated gold frame",
        "model_id":"simulated-model","width":512,"height":768,"quantity":1,
        "remove_background":true})
}
fn asset() -> Value {
    json!({"asset":"assets/simulated-frame.png","generated":true,
        "provenance":"leonardo_background_removed"})
}
fn cost() -> Value {
    json!({"call_id":"01ARZ3NDEKTSV4RRFFQ69G5FAV","model":"simulated-model",
        "charge":{"credits":"1.250000"}})
}
fn result() -> Value {
    json!({"design_id":"simulated-design","assets":[asset()],"costs":[cost()]})
}
fn request(method: &str, params: Value) -> Result<RpcRequest, ErrorEnvelope> {
    parse_request(&serde_json::to_vec(&json!({"method":method,"params":params})).unwrap())
}
fn round_trip<T: serde::de::DeserializeOwned + serde::Serialize>(value: Value) {
    let typed: T = serde_json::from_value(value.clone()).unwrap();
    assert_eq!(serde_json::to_value(typed).unwrap(), value);
}

#[test]
fn art_methods_round_trip_anchor_matching_set_and_local_results() {
    for available in [false, true] {
        let status = request("beacons.art.status", json!({})).unwrap();
        assert_eq!(
            status
                .validate_result(json!({"available":available}))
                .unwrap(),
            json!({"available":available})
        );
    }
    for reference in [None, Some("assets/simulated-anchor.png")] {
        let mut input = params();
        if let Some(path) = reference {
            input["reference"] = json!(path);
            input["quantity"] = json!(8);
        }
        round_trip::<ArtGenerateParams>(input.clone());
        let req = request("beacons.art.generate", input).unwrap();
        assert_eq!(req.validate_result(result()).unwrap(), result());
    }
    round_trip::<GeneratedArtAsset>(asset());
    round_trip::<ArtCostReceipt>(cost());
    round_trip::<ArtCostReceipt>(json!({"call_id":"01ARZ3NDEKTSV4RRFFQ69G5FAV",
        "model":"remove-bg","charge":{"micro_usd":1234567}}));
    for charge in [
        json!({"credits":"0"}),
        json!({"credits":"999999999999.999999"}),
        json!({"micro_usd":0}),
        json!({"micro_usd":9007199254740991_u64}),
    ] {
        let mut receipt = cost();
        receipt["charge"] = charge;
        round_trip::<ArtCostReceipt>(receipt);
    }
    let call_id = ArtCallId::mint();
    assert_eq!(
        ArtCallId::try_from(call_id.as_str().to_owned()).unwrap(),
        call_id
    );
    let mut empty = result();
    empty["assets"] = json!([]);
    round_trip::<ArtGenerateResult>(empty);
    for method in ["beacons.art.status", "beacons.art.generate"] {
        assert_eq!(
            method_schemas()
                .iter()
                .find(|m| m["name"] == method)
                .unwrap()["owner"],
            "WP 3.4"
        );
    }
}

#[test]
fn art_records_deny_unknown_fields_and_null_and_omit_absent_reference() {
    round_trip::<ArtGenerateParams>(params());
    for (method, input, output) in [
        ("beacons.art.status", json!({}), json!({"available":false})),
        ("beacons.art.generate", params(), result()),
    ] {
        let req = request(method, input.clone()).unwrap();
        for key in input
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .chain(["extra", "reference", "public", "key_label"])
        {
            let mut bad = input.clone();
            bad[key] = Value::Null;
            assert!(request(method, bad).is_err(), "accepted input {key}");
        }
        for key in output
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .chain(["extra", "key_label"])
        {
            let mut bad = output.clone();
            bad[key] = Value::Null;
            assert!(req.validate_result(bad).is_err(), "accepted output {key}");
        }
    }
    for mut bad in [asset(), cost()] {
        bad["extra"] = json!(true);
        assert!(serde_json::from_value::<GeneratedArtAsset>(bad.clone()).is_err());
        assert!(serde_json::from_value::<ArtCostReceipt>(bad).is_err());
    }
    for field in ["asset", "generated", "provenance"] {
        let mut bad = asset();
        bad[field] = Value::Null;
        assert!(serde_json::from_value::<GeneratedArtAsset>(bad).is_err());
    }
    for field in ["call_id", "model", "charge"] {
        let mut bad = cost();
        bad[field] = Value::Null;
        assert!(serde_json::from_value::<ArtCostReceipt>(bad).is_err());
    }
    let req = request("beacons.art.generate", params()).unwrap();
    for extra in [json!(true), json!(false)] {
        let mut bad = params();
        bad["public"] = extra;
        assert!(request("beacons.art.generate", bad).is_err());
    }
    let mut bad = result();
    bad["assets"][0]["generated"] = json!(false);
    assert!(req.validate_result(bad).is_err());
}

#[test]
fn art_paths_reject_remote_urls_and_reuse_slug_validation() {
    for path in [
        "https://example.invalid/generated.png",
        "http://localhost:4312/image.png",
        "//example.invalid/a.png",
        "data:image/png;base64,AAAA",
        "../a.png",
        "/a.png",
        "assets/%2e%2e/a.png",
        "assets\\a.png",
        "assets/a.png?x=1",
        "assets/a.png#x",
    ] {
        let mut bad = params();
        bad["reference"] = json!(path);
        assert!(
            request("beacons.art.generate", bad).is_err(),
            "accepted reference {path}"
        );
        let mut bad = result();
        bad["assets"][0]["asset"] = json!(path);
        assert!(
            request("beacons.art.generate", params())
                .unwrap()
                .validate_result(bad)
                .is_err()
        );
    }
    for id in ["", "Bad Id", "bad--slug", "trailing-", "simulated\n"] {
        let mut bad = params();
        bad["design_id"] = json!(id);
        assert!(request("beacons.art.generate", bad).is_err());
    }
}

#[test]
fn art_request_and_exact_cost_domains_match_the_provider() {
    for (key, value) in [
        ("prompt", json!(" \n\t")),
        ("prompt", json!("\u{85}")),
        ("prompt", json!("x".repeat(1501))),
        ("model_id", json!("https://example.invalid/model")),
        ("model_id", json!("x".repeat(129))),
        ("width", json!(31)),
        ("width", json!(33)),
        ("height", json!(1544)),
        ("quantity", json!(0)),
        ("quantity", json!(9)),
        ("quantity", json!(2)),
    ] {
        let mut bad = params();
        bad[key] = value;
        assert!(
            request("beacons.art.generate", bad).is_err(),
            "accepted {key}"
        );
    }
    let mut unicode = params();
    unicode["prompt"] = json!("🔥".repeat(1500));
    assert!(request("beacons.art.generate", unicode).is_ok());
    let mut untrimmed = params();
    untrimmed["prompt"] = json!("\u{feff}");
    assert!(request("beacons.art.generate", untrimmed).is_ok());
    for charge in [
        json!({"credits":"-1"}),
        json!({"credits":"1."}),
        json!({"credits":"1.0000001"}),
        json!({"credits":"1e2"}),
        json!({"credits":1}),
        json!({"credits":"1","extra":true}),
        json!({"credits":"1","micro_usd":1}),
        json!({"micro_usd":-1}),
        json!({"micro_usd":0.5}),
        json!({"micro_usd":9007199254740992_u64}),
    ] {
        let mut bad = cost();
        bad["charge"] = charge;
        assert!(serde_json::from_value::<ArtCostReceipt>(bad).is_err());
    }
    for id in [
        "not-a-ulid",
        "01arz3ndektsv4rrffq69g5fav",
        "ZZZZZZZZZZZZZZZZZZZZZZZZZZ",
    ] {
        let mut bad = cost();
        bad["call_id"] = json!(id);
        assert!(serde_json::from_value::<ArtCostReceipt>(bad).is_err());
    }
    let mut bad = result();
    bad["costs"] = json!([]);
    assert!(
        request("beacons.art.generate", params())
            .unwrap()
            .validate_result(bad)
            .is_err()
    );
}
