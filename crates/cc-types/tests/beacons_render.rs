use cc_types::{BEACONS_RENDER_SNAPSHOT_EVENT, BeaconsRenderSnapshot, EventKind};
use serde_json::{Value, json};

// Fabricated, simulated design data only; no asset loading or hash verification.
fn snapshot(with_package: bool) -> Value {
    let mut value = json!({
        "visual": {"visual_id":"simulated-frame","name":"Simulated frame",
            "curve":{"ranges":[{"total":0,"intensity":0.0}],"decay":{"kind":"none"}}},
        "intensity":{"visual_id":"simulated-frame","intensity":0.5},
        "simulated": true
    });
    if with_package {
        value["visual"]["design_id"] = json!("simulated-design");
        value["package"] = json!({"design_id":"simulated-design","content_hash":"a".repeat(64),
            "layers":[{"kind":"shape","shape":"rectangle","bindings":[],
                "properties":{"x":0.0,"y":0.0,"width":1920,"height":1080,"scale":1.0,"opacity":1.0}}]});
    }
    value
}

#[test]
fn accepted_snapshot_round_trips_with_package_or_neutral_placeholder() {
    for with_package in [true, false] {
        let value = snapshot(with_package);
        let parsed: BeaconsRenderSnapshot = serde_json::from_value(value.clone()).unwrap();
        assert_eq!(parsed.package.is_some(), with_package);
        assert_eq!(serde_json::to_value(parsed).unwrap(), value);
    }
    assert_eq!(BEACONS_RENDER_SNAPSHOT_EVENT, "beacons.render.snapshot");
    assert!(!EventKind::NAMES.contains(&BEACONS_RENDER_SNAPSHOT_EVENT));
    assert!(
        include_str!("../../../docs/plan/03-implementation-plan.md")
            .contains(&format!("| `{BEACONS_RENDER_SNAPSHOT_EVENT}`"))
    );
}

#[test]
fn snapshot_requires_boolean_simulated_provenance() {
    for with_package in [true, false] {
        let mut missing = snapshot(with_package);
        missing.as_object_mut().unwrap().remove("simulated");
        assert!(serde_json::from_value::<BeaconsRenderSnapshot>(missing).is_err());
        for invalid in [Value::Null, json!("true"), json!(1)] {
            let mut bad = snapshot(with_package);
            bad["simulated"] = invalid;
            assert!(serde_json::from_value::<BeaconsRenderSnapshot>(bad).is_err());
        }
    }
}

#[test]
fn snapshot_round_trips_true_and_false_simulated_provenance() {
    for with_package in [true, false] {
        for simulated in [true, false] {
            let mut value = snapshot(with_package);
            value["simulated"] = json!(simulated);
            let parsed: BeaconsRenderSnapshot = serde_json::from_value(value.clone()).unwrap();
            assert_eq!(serde_json::to_value(parsed).unwrap(), value);
        }
    }
}

#[test]
fn snapshot_rejects_mismatched_intensity_visual_id_with_or_without_package() {
    for with_package in [true, false] {
        let mut bad = snapshot(with_package);
        bad["intensity"]["visual_id"] = json!("simulated-other-frame");
        assert!(serde_json::from_value::<BeaconsRenderSnapshot>(bad).is_err());
    }
}

#[test]
fn snapshot_requires_package_if_and_only_if_visual_names_a_design() {
    let mut missing_package = snapshot(true);
    missing_package.as_object_mut().unwrap().remove("package");
    assert!(serde_json::from_value::<BeaconsRenderSnapshot>(missing_package).is_err());
    let mut unexpected_package = snapshot(true);
    unexpected_package["visual"]
        .as_object_mut()
        .unwrap()
        .remove("design_id");
    assert!(serde_json::from_value::<BeaconsRenderSnapshot>(unexpected_package).is_err());
}

#[test]
fn snapshot_rejects_mismatched_package_design_id() {
    let mut bad = snapshot(true);
    bad["package"]["design_id"] = json!("simulated-other-design");
    assert!(serde_json::from_value::<BeaconsRenderSnapshot>(bad).is_err());
}

#[test]
fn snapshot_rejects_unknown_fields_and_present_null_package() {
    for with_package in [true, false] {
        let mut bad = snapshot(with_package);
        bad["extra"] = json!(true);
        assert!(serde_json::from_value::<BeaconsRenderSnapshot>(bad).is_err());
        let mut bad = snapshot(with_package);
        bad["package"] = Value::Null;
        assert!(serde_json::from_value::<BeaconsRenderSnapshot>(bad).is_err());
    }
    for field in ["visual", "package", "intensity"] {
        let mut bad = snapshot(true);
        bad[field]["extra"] = json!(true);
        assert!(serde_json::from_value::<BeaconsRenderSnapshot>(bad).is_err());
    }
}
