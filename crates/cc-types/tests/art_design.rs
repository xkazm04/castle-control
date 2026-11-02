use cc_types::*;
use serde_json::{Value, json};

// Fabricated, simulated values only; no provider, keychain or engine calls.
const HASH: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
fn rect() -> Value {
    json!({"x":0.1,"y":0.2,"w":0.5,"h":0.25})
}
fn url(path: &str) -> String {
    format!("/assets/simulated-design/{HASH}/{path}")
}
fn anchors() -> Value {
    json!({"core_rect":rect(),"window_rect":rect(),"track_rect":rect(),"track_radius":0.5,
        "chamber_rect":rect(),"mouth":{"x":0.5,"y":0.0},"segments":["#AABBCC","#00ff00","#123abc"]})
}
fn direct() -> Value {
    json!({"kind":"beacon","request":"Simulated stormy lighthouse","width":1024,"height":512,
        "answer":"Warm"})
}
fn direction() -> Value {
    json!({"kind":"frame","interpretation":"Simulated stone frame","style_name":"Simulated",
        "palette":["#112233"],"assumptions":["Simulated"],
        "question":{"text":"Simulated?","options":["Warm","Cool"],"assumed":"Warm"},
        "master_prompt":"A simulated stone frame","width":1024,"height":1024})
}
fn package() -> Value {
    json!({"design_id":"simulated-design","content_hash":HASH,"layers":[{"kind":"image",
        "asset":"assets/base.png","properties":{"x":0.0,"y":0.0,"width":64,"height":64,"scale":1.0,
        "opacity":1.0},"bindings":[{"property":"opacity","output_range":{"at_zero":0.0,"at_one":1.0}}]}]})
}
fn layers() -> Value {
    json!({"design_id":"simulated-design","base":"assets/base.png","effect":"assets/effect.png",
        "anchors":anchors(),"package":package(),"costs":[{"call_id":"01ARZ3NDEKTSV4RRFFQ69G5FAV",
        "model":"simulated-model","charge":{"micro_usd":40000}}]})
}
fn vote_art() -> Value {
    json!({"asset_url":url("assets/housing.png"),"track_rect":rect(),"track_radius":0.4,
        "segments":["#ff0000","#00ff00","#0000ff"]})
}
fn vessel() -> Value {
    json!({"asset_url":url("assets/vessel.png"),"token_url":url("assets/token.png"),
        "chamber_rect":rect(),"mouth":{"x":0.5,"y":0.1}})
}
fn round_trip<T: serde::de::DeserializeOwned + serde::Serialize>(value: Value) {
    let typed: T = serde_json::from_value(value.clone()).unwrap();
    assert_eq!(serde_json::to_value(typed).unwrap(), value);
}
fn rejects<T: serde::de::DeserializeOwned>(value: Value) -> bool {
    serde_json::from_value::<T>(value).is_err()
}
fn request(method: &str, params: Value) -> Result<RpcRequest, ErrorEnvelope> {
    parse_request(&serde_json::to_vec(&json!({"method":method,"params":params})).unwrap())
}
/// Every key (and "extra") set to null, and "extra" set to a value, is refused.
fn strict<T: serde::de::DeserializeOwned>(value: &Value) {
    for key in value
        .as_object()
        .unwrap()
        .keys()
        .map(String::as_str)
        .chain(["extra"])
    {
        let mut bad = value.clone();
        bad[key] = Value::Null;
        assert!(rejects::<T>(bad), "accepted null {key}");
    }
    let mut bad = value.clone();
    bad["extra"] = json!(true);
    assert!(rejects::<T>(bad));
}

#[test]
fn new_records_round_trip_and_deny_unknown_or_null() {
    round_trip::<ArtAnchors>(anchors());
    round_trip::<ArtAnchors>(json!({}));
    round_trip::<ArtDirectParams>(direct());
    round_trip::<ArtDirection>(direction());
    round_trip::<ArtLayers>(layers());
    round_trip::<VoteBarArt>(vote_art());
    round_trip::<VesselArt>(vessel());
    round_trip::<LotsPlateSnapshot>(json!({"vessel":vessel()}));
    round_trip::<LotsPlateSnapshot>(json!({}));
    round_trip::<ArtProviderStatus>(json!({"provider":"openai","available":true}));
    round_trip::<VoteBarDesignSetParams>(json!({}));
    round_trip::<VoteBarDesignSetParams>(json!({"design_id":"simulated-design"}));
    strict::<ArtAnchors>(&anchors());
    strict::<ArtDirectParams>(&direct());
    strict::<ArtDirection>(&direction());
    strict::<ArtQuestion>(&direction()["question"]);
    strict::<ArtLayers>(&layers());
    strict::<VoteBarArt>(&vote_art());
    strict::<VesselArt>(&vessel());
    strict::<ArtRect>(&rect());
    strict::<ArtProviderStatus>(&json!({"provider":"openai","available":true}));
    strict::<LotsPlateSnapshot>(&json!({"vessel":vessel()}));
    strict::<VoteBarDesignSetParams>(&json!({"design_id":"simulated-design"}));
    for all_optional in [json!([]), json!(null), json!("")] {
        assert!(rejects::<ArtAnchors>(all_optional.clone()));
        assert!(rejects::<LotsPlateSnapshot>(all_optional.clone()));
        assert!(rejects::<VoteBarDesignSetParams>(all_optional));
    }
    for (kind, wire) in [
        ("beacon", ArtAssetKind::Beacon),
        ("frame", ArtAssetKind::Frame),
        ("vote_bar", ArtAssetKind::VoteBar),
        ("draw_vessel", ArtAssetKind::DrawVessel),
    ] {
        assert_eq!(
            serde_json::from_value::<ArtAssetKind>(json!(kind)).unwrap(),
            wire
        );
    }
    assert!(rejects::<ArtAssetKind>(json!("map")));
    assert!(rejects::<ArtProvider>(json!("open_ai")));
    assert!(rejects::<ArtBackground>(json!("auto")));
    round_trip::<ArtProvider>(json!("leonardo"));
    round_trip::<ArtBackground>(json!("transparent"));
    round_trip::<ArtProvenance>(json!("openai_generated"));
}

#[test]
fn scalars_and_bounds_are_enforced() {
    for ok in ["#000000", "#ABCdef"] {
        round_trip::<HexColor>(json!(ok));
    }
    for bad in [
        "000000",
        "#00000",
        "#0000000",
        "#00000g",
        "#000000\n",
        "red",
    ] {
        assert!(rejects::<HexColor>(json!(bad)), "{bad}");
    }
    round_trip::<LibraryAssetId>(json!("storm-lighthouse-01"));
    round_trip::<LibraryAssetId>(json!("-"));
    for bad in ["", "Storm", "storm_1", "a/b", &"a".repeat(65)] {
        assert!(rejects::<LibraryAssetId>(json!(bad)), "{bad}");
    }
    for bad in [-0.1, 1.01] {
        let mut r = rect();
        r["w"] = json!(bad);
        assert!(rejects::<ArtRect>(r));
        assert!(rejects::<ArtPoint>(json!({"x":bad,"y":0})));
    }
    for segments in [json!(["#000000", "#000000"]), json!(vec!["#000000"; 4])] {
        let mut a = anchors();
        a["segments"] = segments.clone();
        assert!(rejects::<ArtAnchors>(a));
        let mut v = vote_art();
        v["segments"] = segments;
        assert!(rejects::<VoteBarArt>(v));
    }
    let mut p = direct();
    for (key, ok, bad) in [("request", 500, 501), ("answer", 120, 121)] {
        p[key] = json!("\u{e9}".repeat(ok));
        assert!(serde_json::from_value::<ArtDirectParams>(p.clone()).is_ok());
        p[key] = json!("\u{e9}".repeat(bad));
        assert!(rejects::<ArtDirectParams>(p.clone()));
        p[key] = json!(" \u{3000} ");
        assert!(rejects::<ArtDirectParams>(p.clone()));
        p[key] = json!("Simulated");
    }
    let mut d = direction();
    d["master_prompt"] = json!("m".repeat(1400));
    assert!(serde_json::from_value::<ArtDirection>(d.clone()).is_ok());
    for (key, bad) in [
        ("master_prompt", json!("m".repeat(1401))),
        ("palette", json!(vec!["#000000"; 7])),
        ("assumptions", json!(["a", "b", "c", "d"])),
        ("assumptions", json!([" "])),
        ("interpretation", json!(" ")),
    ] {
        let mut b = d.clone();
        b[key] = bad;
        assert!(rejects::<ArtDirection>(b), "{key}");
    }
    for options in [
        json!(["Warm"]),
        json!(["a", "b", "c", "d", "e"]),
        json!(["a", ""]),
    ] {
        let mut b = d.clone();
        b["question"]["options"] = options;
        assert!(rejects::<ArtDirection>(b));
    }
    let mut no_effect = layers();
    no_effect.as_object_mut().unwrap().remove("effect");
    no_effect["costs"] = json!([]);
    round_trip::<ArtLayers>(no_effect);
}

#[test]
fn overlay_asset_urls_are_same_origin_paths_only() {
    for bad in [
        "https://example.com/assets/simulated-design/x/a.png".to_owned(),
        "//example.com/assets/a.png".to_owned(),
        format!("assets/simulated-design/{HASH}/a.png"),
        format!("/assets/simulated-design/{HASH}"),
        format!("/assets/Simulated/{HASH}/a.png"),
        format!("/assets/simulated-design/{}/a.png", &HASH[1..]),
        format!("/assets/simulated-design/{HASH}/../a.png"),
        format!("/assets/simulated-design/{HASH}/a.png?x=1"),
        format!("/assets/simulated-design/{HASH}/a%2e.png"),
        format!("/visuals/simulated-design/{HASH}/a.png"),
    ] {
        assert!(rejects::<OverlayAssetUrl>(json!(bad)), "{bad}");
        let mut v = vessel();
        v["token_url"] = json!(bad);
        assert!(rejects::<VesselArt>(v));
    }
    round_trip::<OverlayAssetUrl>(json!(url("assets/sub/a.webp")));
}

#[test]
fn extended_records_keep_existing_values_valid() {
    let generate = json!({"design_id":"simulated-design","prompt":"Simulated","model_id":"simulated-model",
        "width":512,"height":512,"quantity":1,"remove_background":false});
    round_trip::<ArtGenerateParams>(generate.clone());
    let mut openai = generate.clone();
    openai["provider"] = json!("openai");
    openai["background"] = json!("transparent");
    round_trip::<ArtGenerateParams>(openai.clone());
    for provider in [None, Some("leonardo")] {
        let mut bad = openai.clone();
        match provider {
            Some(p) => bad["provider"] = json!(p),
            None => drop(bad.as_object_mut().unwrap().remove("provider")),
        }
        assert!(rejects::<ArtGenerateParams>(bad));
    }
    for key in ["provider", "background"] {
        let mut bad = openai.clone();
        bad[key] = Value::Null;
        assert!(rejects::<ArtGenerateParams>(bad));
    }
    round_trip::<ArtStatusResult>(json!({"available":false}));
    round_trip::<ArtStatusResult>(json!({"available":true,"providers":[
        {"provider":"leonardo","available":false},{"provider":"openai","available":true}]}));
    let snapshot =
        json!({"directions":[{"share":0.5}],"simulated":true,"at":"2026-11-02T12:00:00Z"});
    round_trip::<VoteBarSnapshot>(snapshot.clone());
    let mut art = snapshot.clone();
    art["art"] = vote_art();
    round_trip::<VoteBarSnapshot>(art);
    let mut null = snapshot;
    null["art"] = Value::Null;
    assert!(rejects::<VoteBarSnapshot>(null));
    round_trip::<Display>(json!({"art_style":"pixel","art_design":"simulated-design"}));
    assert!(rejects::<Display>(json!({"art_design":null})));
    assert!(rejects::<Display>(json!({"art_design":"Not A Slug"})));
}

#[test]
fn methods_are_declared_with_typed_params_and_results() {
    let cases = [
        (
            "beacons.design.create",
            json!({"kind":"draw_vessel"}),
            json!({"design_id":"simulated-design"}),
        ),
        ("beacons.art.direct", direct(), direction()),
        (
            "beacons.art.layers",
            json!({"design_id":"simulated-design","asset":"assets/a.png",
            "kind":"beacon"}),
            layers(),
        ),
        (
            "beacons.library.import",
            json!({"library_id":"storm-01","kind":"vote_bar"}),
            json!({"design_id":"simulated-design"}),
        ),
        ("gatehouse.votebar.design.set", json!({}), json!({})),
    ];
    for (method, params, result) in cases {
        let req = request(method, params.clone()).unwrap();
        assert_eq!(req.method(), method);
        assert_eq!(req.validate_result(result.clone()).unwrap(), result);
        let mut bad = params.clone();
        bad["extra"] = json!(true);
        assert!(request(method, bad).is_err());
        assert!(request(method, json!([])).is_err());
        let mut bad = result;
        bad["extra"] = json!(true);
        assert!(req.validate_result(bad).is_err());
        let schema = method_schemas()
            .into_iter()
            .find(|m| m["name"] == method)
            .unwrap();
        assert_eq!(schema["owner"], "Custom design");
    }
    let set = request(
        "gatehouse.votebar.design.set",
        json!({"design_id":"simulated-design"}),
    );
    assert!(set.is_ok());
    assert!(
        request(
            "beacons.library.import",
            json!({"library_id":"Bad","kind":"beacon"})
        )
        .is_err()
    );
}
