//! Library import details and the engine-backed art director, over fixture
//! registries and a simulated engine endpoint. Data is SIMULATED.
#[allow(dead_code)]
mod steward_support;

use cc_core::{EventHub, Registry};
use cc_types::{ErrorCode, ErrorEnvelope, parse_request};
use serde_json::{Value, json};
use std::{path::Path, sync::Arc};

async fn dispatch(
    registry: &Registry,
    method: &str,
    params: Value,
) -> Result<Value, ErrorEnvelope> {
    let request =
        parse_request(&serde_json::to_vec(&json!({"method": method, "params": params})).unwrap())?;
    registry.dispatch(&request).await
}

fn fixture_registry(root: &Path) -> Registry {
    Registry::with_fixture_root(root, Arc::new(EventHub::new(16).unwrap())).unwrap()
}

#[tokio::test]
async fn library_beacon_with_effect_imports_both_layers_at_the_core() {
    let root = tempfile::tempdir().unwrap();
    let registry = fixture_registry(root.path());
    dispatch(
        &registry,
        "beacons.library.import",
        json!({"library_id":"beacon-05","kind":"beacon"}),
    )
    .await
    .unwrap();
    let record: Value = serde_json::from_slice(
        &std::fs::read(
            root.path()
                .join("beacons/designs/library-beacon-05/design.json"),
        )
        .unwrap(),
    )
    .unwrap();
    let layers = record["package"]["layers"].as_array().unwrap();
    // effect_blend "behind": the effect paints first, then the body.
    assert_eq!(layers[0]["asset"], "effect.webp");
    assert_eq!(layers[1]["asset"], "base.webp");
    // core_rect {x:0.29,y:0.352,w:0.42,h:0.315} on 576x768.
    assert_eq!(layers[0]["properties"]["x"], json!(167.0));
    assert_eq!(layers[0]["properties"]["width"], json!(242));
    assert_eq!(record["anchors"]["core_rect"]["x"], json!(0.29));
    // A vessel without catalogued anchors gets the v1 heuristic anchors.
    dispatch(
        &registry,
        "beacons.library.import",
        json!({"library_id":"vessel-02","kind":"draw_vessel"}),
    )
    .await
    .unwrap();
    let vessel: Value = serde_json::from_slice(
        &std::fs::read(
            root.path()
                .join("beacons/designs/library-vessel-02/design.json"),
        )
        .unwrap(),
    )
    .unwrap();
    assert!(
        vessel["anchors"]["chamber_rect"].is_object() && vessel["anchors"]["mouth"].is_object()
    );
}

#[tokio::test]
async fn art_director_parses_strictly_through_the_steward_engine() {
    let direction = json!({"kind":"frame","interpretation":"SIMULATED cozy cabin","style_name":"Cabin Glow",
        "palette":["#C2742F","#2B1A12","#F2D7A0"],"assumptions":["Warm wood"],
        "question":{"text":"Which mood?","options":["Warm","Snowy","Rainy"],"assumed":"Warm"},
        "master_prompt":"SIMULATED wooden facecam frame","width":512,"height":512});
    let h =
        steward_support::Harness::with_texts(vec![direction.to_string(), "not json".into()]).await;
    let params = json!({"kind":"frame","request":"SIMULATED cozy","width":768,"height":432});
    let result = dispatch(&h.registry, "beacons.art.direct", params.clone())
        .await
        .unwrap();
    assert_eq!(result["style_name"], "Cabin Glow");
    assert_eq!(
        (result["width"].clone(), result["height"].clone()),
        (json!(768), json!(432))
    );
    assert_eq!(
        dispatch(&h.registry, "beacons.art.direct", params)
            .await
            .unwrap_err()
            .code,
        ErrorCode::Invalid
    );
}
