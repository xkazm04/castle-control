mod overlay_support;
use cc_core::overlay::RenderHost;
use cc_types::{BeaconsIntensity, ErrorCode, parse_request};
use overlay_support::*;
use serde_json::json;

#[tokio::test]
async fn rejected_visual_never_commits_and_simulation_never_changes_live_snapshot() {
    let directory = tempfile::tempdir().unwrap();
    let service = native(directory.path()).await;
    let app = app(service.clone());
    let visual = visual(false);
    call(&app, "beacons.visual.upsert", json!({"visual":visual})).await;
    service
        .accept_beacons_intensity(BeaconsIntensity {
            visual_id: visual.visual_id.clone(),
            intensity: 0.6.try_into().unwrap(),
        })
        .unwrap();
    let mut oversized = visual.clone();
    oversized.name = "x".repeat(70 * 1024);
    let request = parse_request(
        &serde_json::to_vec(
            &json!({"method":"beacons.visual.upsert","params":{"visual":oversized}}),
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(
        app.registry.dispatch(&request).await.unwrap_err().code,
        ErrorCode::Invalid
    );
    let visuals = call(&app, "beacons.visual.list", json!({})).await;
    assert_eq!(visuals["visuals"][0]["name"], visual.name);
    call(
        &app,
        "beacons.simulate",
        json!({"visual_id":"simulated-frame","burst":{"source":"gift","amount":100}}),
    )
    .await;
    let mut renamed = visual.clone();
    renamed.name = "Accepted rename".into();
    call(&app, "beacons.visual.upsert", json!({"visual":renamed})).await;
    let mut response = client()
        .get(format!(
            "{}push/beacons?visual_id=simulated-frame",
            service.overlay_url()
        ))
        .send()
        .await
        .unwrap();
    let result = snapshot(&mut response).await;
    assert!(result.package.is_none());
    assert_eq!(result.visual.name, "Accepted rename");
    assert_eq!(f64::from(result.intensity.intensity), 0.6);
    app.shutdown();
}

#[test]
fn render_inventory_is_bounded_and_unknown_intensity_is_rejected() {
    let host = RenderHost::default();
    let mut visual = visual(false);
    for index in 0..128 {
        visual.visual_id = format!("simulated-{index}").try_into().unwrap();
        host.commit_visual(visual.clone()).unwrap();
    }
    visual.visual_id = "simulated-overflow".to_owned().try_into().unwrap();
    assert_eq!(
        host.commit_visual(visual.clone()).unwrap_err().code,
        ErrorCode::Unavailable
    );
    assert_eq!(
        host.accept_intensity(BeaconsIntensity {
            visual_id: visual.visual_id,
            intensity: 0.1.try_into().unwrap()
        })
        .unwrap_err()
        .code,
        ErrorCode::Invalid
    );
}
