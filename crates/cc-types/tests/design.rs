use cc_types::*;
use serde_json::{Value, json};

// Synthetic design data only; no assets are loaded or scripts executed.
fn properties() -> Value {
    json!({"x":0.0,"y":10.0,"width":1920,"height":1080,"scale":1.0,"opacity":1.0})
}
fn layer(kind: &str) -> Value {
    let mut v = json!({"kind":kind,"properties":properties(),"bindings":[
        {"property":"opacity","output_range":{"at_zero":0.0,"at_one":1.0}},
        {"property":"scale","output_range":{"at_zero":1.0,"at_one":2.0}},
        {"property":"x","output_range":{"at_zero":-10.0,"at_one":10.0}},
        {"property":"y","output_range":{"at_zero":0.0,"at_one":20.0}}
    ]});
    match kind {
        "image" => v["asset"] = json!("assets/simulated-frame.png"),
        "shape" => v["shape"] = json!("rectangle"),
        "text" => v["text"] = json!("Simulated design"),
        "particle_preset" => v["preset"] = json!("simulated-sparks"),
        _ => unreachable!(),
    }
    v
}
fn package() -> Value {
    json!({"design_id":"simulated-design","content_hash":"a".repeat(64),
        "layers":[layer("image"),layer("shape"),layer("text"),layer("particle_preset")],
        "privileges":{"kind":"data_only"}})
}
fn rejects(v: Value) {
    assert!(
        serde_json::from_value::<DesignPackage>(v.clone()).is_err(),
        "accepted {v}"
    );
}

#[test]
fn packages_round_trip_in_layer_order_and_default_to_data_only() {
    let v = package();
    let parsed: DesignPackage = serde_json::from_value(v.clone()).unwrap();
    assert_eq!(serde_json::to_value(parsed).unwrap(), v);
    let mut omitted = v.clone();
    omitted.as_object_mut().unwrap().remove("privileges");
    let parsed: DesignPackage = serde_json::from_value(omitted.clone()).unwrap();
    assert_eq!(
        parsed.privileges.clone().unwrap_or_default(),
        DesignPrivileges::default()
    );
    assert_eq!(serde_json::to_value(parsed).unwrap(), omitted);
    let mut scripted = package();
    scripted["privileges"] = json!({"kind":"scripts","scripts":["scripts/simulated.js"]});
    let parsed: DesignPackage = serde_json::from_value(scripted.clone()).unwrap();
    assert_eq!(serde_json::to_value(parsed).unwrap(), scripted);
}

#[test]
fn image_and_script_assets_cannot_address_remote_or_parent_paths() {
    for asset in [
        "https://example.invalid/a.png",
        "http://localhost/a",
        "//example.invalid/a",
        "/absolute.png",
        "C:/asset.png",
        "file:///asset.png",
        "data:image/png;base64,AA",
        "../asset.png",
        "assets/../asset.png",
        "assets/./asset.png",
        "assets//a.png",
        "assets\\a.png",
        "assets/%2e%2e/a.png",
        "a.png?host=remote",
        "a.png\n",
        "",
    ] {
        let mut v = package();
        v["layers"][0]["asset"] = json!(asset);
        rejects(v.clone());
        v["layers"][0] = layer("image");
        v["privileges"] = json!({"kind":"scripts","scripts":[asset]});
        rejects(v);
    }
    for asset in ["frame.png", "assets/frame-2.png", "assets/_local/frame.PNG"] {
        assert!(LocalAssetPath::try_from(asset.to_owned()).is_ok());
    }
}

#[test]
fn unknown_fields_nulls_and_undeclared_scripts_are_rejected_at_each_record() {
    for path in [
        "",
        "/layers/0",
        "/layers/0/properties",
        "/layers/0/bindings/0",
        "/layers/0/bindings/0/output_range",
        "/privileges",
    ] {
        let base = package();
        let object = base.pointer(path).unwrap().as_object().unwrap();
        for key in object.keys().map(String::as_str).chain(["extra"]) {
            let mut v = base.clone();
            v.pointer_mut(path).unwrap()[key] = Value::Null;
            rejects(v);
        }
        let mut v = base;
        v.pointer_mut(path).unwrap()["extra"] = json!(true);
        rejects(v);
    }
    for index in 0..4 {
        let mut v = package();
        v["layers"][index]["script"] = json!("simulated.js");
        rejects(v);
    }
    for privileges in [
        json!({"kind":"data_only","scripts":["a.js"]}),
        json!({"kind":"scripts","scripts":[]}),
        json!({"kind":"scripts"}),
        json!({"kind":"unknown"}),
        json!({"scripts":["a.js"]}),
    ] {
        let mut v = package();
        v["privileges"] = privileges;
        rejects(v);
    }
    let mut v = package();
    v.as_object_mut().unwrap().remove("privileges");
    v["scripts"] = json!(["simulated.js"]);
    rejects(v);
}

#[test]
fn closed_kinds_nonempty_layers_hashes_and_numeric_domains_are_enforced() {
    for (path, bad) in [
        ("/design_id", json!("Bad Id")),
        ("/content_hash", json!("A".repeat(64))),
        ("/content_hash", json!("a".repeat(63))),
        ("/layers", json!([])),
        ("/layers/0/kind", json!("video")),
        ("/layers/1/shape", json!("arbitrary")),
        ("/layers/2/text", json!(" \n")),
        ("/layers/3/preset", json!(" \t")),
        ("/layers/0/bindings/0/property", json!("arbitrary_css")),
        ("/layers/0/bindings/0/output_range/at_one", json!(1.01)),
        ("/layers/0/bindings/0/output_range/at_zero", json!(-0.01)),
        ("/layers/0/bindings/1/output_range/at_zero", json!(-1)),
        ("/layers/0/properties/opacity", json!(1.01)),
        ("/layers/0/properties/scale", json!(-1)),
        ("/layers/0/properties/width", json!(0)),
        ("/layers/0/properties/width", json!(1.5)),
        ("/layers/0/properties/width", json!(4294967296_u64)),
        ("/layers/0/properties/height", json!("1080")),
    ] {
        let mut v = package();
        *v.pointer_mut(path).unwrap() = bad;
        rejects(v);
    }
    for value in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
        assert!(DesignNumber::try_from(value).is_err());
        assert!(DesignScale::try_from(value).is_err());
    }
    for (path, value) in [
        ("/layers/0/properties/x", "1e400"),
        ("/layers/0/bindings/0/output_range/at_one", "1e400"),
    ] {
        let mut v = package();
        *v.pointer_mut(path).unwrap() = json!("REPLACE_NUMBER");
        let raw = v.to_string().replace("\"REPLACE_NUMBER\"", value);
        assert!(serde_json::from_str::<DesignPackage>(&raw).is_err());
    }
}
