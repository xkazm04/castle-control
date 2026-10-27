//! Generated simulated visuals only; no Twitch, OBS or model adapters.
use cc_core::{EventHub, Registry};
use cc_types::{ErrorCode, ErrorEnvelope, parse_request};
use serde_json::{Value, json};
use std::sync::Arc;

fn visual() -> Value {
    json!({
        "visual_id":"simulated-frame", "name":"Simulated gift frame",
        "design_id":"simulated-design",
        "curve":{
            "ranges":[{"total":0,"intensity":0.0},{"total":100,"intensity":1.0}],
            "decay":{"kind":"exponential","half_life_s":60}
        }
    })
}

async fn call(registry: &Registry, method: &str, params: Value) -> Result<Value, ErrorEnvelope> {
    let request = parse_request(
        json!({"method":method,"params":params})
            .to_string()
            .as_bytes(),
    )
    .unwrap();
    registry.dispatch(&request).await
}

fn open(root: &std::path::Path) -> Registry {
    Registry::with_fixture_root(root, Arc::new(EventHub::new(64).unwrap())).unwrap()
}

#[tokio::test]
async fn upsert_list_and_update_survive_reopening() {
    let root = tempfile::tempdir().unwrap();
    let registry = open(root.path());
    assert_eq!(
        call(&registry, "beacons.visual.list", json!({}))
            .await
            .unwrap(),
        json!({"visuals":[]})
    );
    let mut expected = visual();
    assert_eq!(
        call(
            &registry,
            "beacons.visual.upsert",
            json!({"visual":expected})
        )
        .await
        .unwrap(),
        expected
    );
    expected["name"] = json!("Updated simulated gift frame");
    call(
        &registry,
        "beacons.visual.upsert",
        json!({"visual":expected}),
    )
    .await
    .unwrap();
    assert_eq!(
        call(&registry, "beacons.visual.list", json!({}))
            .await
            .unwrap(),
        json!({"visuals":[expected]})
    );
    drop(registry);
    let registry = open(root.path());
    assert_eq!(
        call(&registry, "beacons.visual.list", json!({}))
            .await
            .unwrap(),
        json!({"visuals":[expected]})
    );
    expected["curve"]["ranges"][1]["total"] = json!(50);
    assert_eq!(
        call(
            &registry,
            "beacons.curve.set",
            json!({
                "visual_id":expected["visual_id"],"curve":expected["curve"]
            })
        )
        .await
        .unwrap(),
        expected
    );
    drop(registry);
    let registry = open(root.path());
    assert_eq!(
        call(&registry, "beacons.visual.list", json!({}))
            .await
            .unwrap(),
        json!({"visuals":[expected]})
    );
    assert!(root.path().join("beacons/store/store.sqlite3").is_file());
}

#[tokio::test]
async fn invalid_curves_are_refused_without_changing_saved_visual() {
    let root = tempfile::tempdir().unwrap();
    let registry = open(root.path());
    let expected = visual();
    call(
        &registry,
        "beacons.visual.upsert",
        json!({"visual":expected}),
    )
    .await
    .unwrap();
    for ranges in [
        json!([{"total":10,"intensity":0.0},{"total":10,"intensity":1.0}]),
        json!([{"total":100,"intensity":0.0},{"total":0,"intensity":1.0}]),
    ] {
        let mut invalid = visual();
        invalid["curve"]["ranges"] = ranges;
        assert_eq!(
            call(
                &registry,
                "beacons.curve.set",
                json!({
                    "visual_id":invalid["visual_id"],"curve":invalid["curve"]
                })
            )
            .await
            .unwrap_err()
            .code,
            ErrorCode::Invalid
        );
        assert_eq!(
            call(
                &registry,
                "beacons.visual.upsert",
                json!({"visual":invalid})
            )
            .await
            .unwrap_err()
            .code,
            ErrorCode::Invalid
        );
    }
    drop(registry);
    let registry = open(root.path());
    assert_eq!(
        call(&registry, "beacons.visual.list", json!({}))
            .await
            .unwrap(),
        json!({"visuals":[expected]})
    );
}

#[tokio::test]
async fn unknown_visual_is_not_found_for_curve_and_simulation() {
    let root = tempfile::tempdir().unwrap();
    let registry = open(root.path());
    assert_eq!(
        call(
            &registry,
            "beacons.curve.set",
            json!({
                "visual_id":"missing","curve":visual()["curve"]
            })
        )
        .await
        .unwrap_err()
        .code,
        ErrorCode::NotFound
    );
    assert_eq!(
        call(
            &registry,
            "beacons.simulate",
            json!({
                "visual_id":"missing","burst":{"source":"gift","amount":50}
            })
        )
        .await
        .unwrap_err()
        .code,
        ErrorCode::NotFound
    );
}

#[tokio::test]
async fn gift_fifty_is_an_isolated_labelled_preview_without_live_events() {
    let root = tempfile::tempdir().unwrap();
    let events = Arc::new(EventHub::new(64).unwrap());
    let registry = Registry::with_fixture_root(root.path(), events.clone()).unwrap();
    call(
        &registry,
        "beacons.visual.upsert",
        json!({"visual":visual()}),
    )
    .await
    .unwrap();
    for amount in [0, 50, 50, 0] {
        let result = call(
            &registry,
            "beacons.simulate",
            json!({
                "visual_id":"simulated-frame","burst":{"source":"gift","amount":amount}
            }),
        )
        .await
        .unwrap();
        assert_eq!(
            result,
            json!({
                "label":"simulated", "intensity":{
                    "visual_id":"simulated-frame","intensity":f64::from(amount) / 100.0
                }
            })
        );
    }
    assert!(events.since(0).unwrap().is_empty());
    assert_eq!(
        call(&registry, "beacons.visual.list", json!({}))
            .await
            .unwrap(),
        json!({"visuals":[visual()]})
    );
}

#[test]
fn registry_registers_all_five_beacons_methods_without_starting_an_overlay() {
    let root = tempfile::tempdir().unwrap();
    let registry = open(root.path());
    let methods: Vec<_> = registry
        .methods()
        .into_iter()
        .filter(|method| method.starts_with("beacons."))
        .collect();
    assert_eq!(
        methods,
        [
            "beacons.curve.set",
            "beacons.simulate",
            "beacons.source.url",
            "beacons.visual.list",
            "beacons.visual.upsert"
        ]
    );
    assert!(registry.methods().contains(&"beacons.source.url"));
}

#[tokio::test]
async fn offline_source_url_checks_visual_before_reporting_missing_overlay() {
    let registry = Registry::with_status();
    assert_eq!(
        call(
            &registry,
            "beacons.source.url",
            json!({"visual_id":"missing"})
        )
        .await
        .unwrap_err()
        .code,
        ErrorCode::NotFound
    );
    call(
        &registry,
        "beacons.visual.upsert",
        json!({"visual":visual()}),
    )
    .await
    .unwrap();
    assert_eq!(
        call(
            &registry,
            "beacons.source.url",
            json!({"visual_id":"simulated-frame"})
        )
        .await
        .unwrap_err()
        .code,
        ErrorCode::Unavailable
    );
}
