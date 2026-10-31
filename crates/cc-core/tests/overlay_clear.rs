//! Simulated packages only; no live OBS or Twitch.
mod overlay_support;
use overlay_support::*;
use serde_json::json;
use std::{collections::BTreeMap, time::Duration};

#[tokio::test]
async fn unverified_design_ends_open_stream_and_reconnect_waits_for_verification() {
    let directory = tempfile::tempdir().unwrap();
    let service = native(&directory.path().join("store")).await;
    let app = app(service.clone());
    let client = client();
    let url = format!(
        "{}push/beacons?visual_id=simulated-frame",
        service.overlay_url()
    );
    let visual = visual(true);
    call(&app, "beacons.visual.upsert", json!({"visual":visual})).await;
    let first = seal(package("Simulated first design"), &BTreeMap::new());
    service
        .accept_beacons_package(first.clone(), directory.path(), false)
        .unwrap();
    let mut response = client.get(&url).send().await.unwrap();
    assert_eq!(snapshot(&mut response).await.package, Some(first));

    let mut replacement = visual;
    replacement.design_id = Some("simulated-unverified".to_owned().try_into().unwrap());
    call(&app, "beacons.visual.upsert", json!({"visual":replacement})).await;
    let end = tokio::time::timeout(Duration::from_secs(1), response.chunk())
        .await
        .expect("unverified design must end the stale stream");
    assert!(end.unwrap().is_none(), "no new contract event is needed");

    let mut reconnect = client.get(&url).send().await.unwrap();
    assert!(
        tokio::time::timeout(Duration::from_millis(50), reconnect.chunk())
            .await
            .is_err(),
        "an unverified design stays silent on first connect"
    );
    let mut next = package("Simulated replacement design");
    next.design_id = replacement.design_id.unwrap();
    let next = seal(next, &BTreeMap::new());
    service
        .accept_beacons_package(next.clone(), directory.path(), false)
        .unwrap();
    assert_eq!(snapshot(&mut reconnect).await.package, Some(next));
    app.shutdown();
}
