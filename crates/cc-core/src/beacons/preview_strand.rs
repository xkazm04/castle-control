//! A failed preview tick must not strand previews or block live handoff.
use super::*;
use cc_types::{BeaconsIntensity, SimulatedBurst, Visual};

#[tokio::test]
async fn tick_error_drains_previews_and_live_intensity_flows_again() {
    let h = Harness::new().await;
    h.save(
        "frame",
        Some(json!({"source":"gift","unit":"count"})),
        json!({"kind":"none"}),
    )
    .await;
    // The session belongs to a visual the overlay never learned, so the first
    // tick fails inside accept_beacons_simulation after the preview exists.
    let ghost: Visual =
        serde_json::from_value(json!({"visual_id":"ghost","name":"Simulated ghost",
        "curve":{"ranges":[{"total":0,"intensity":0.0},{"total":100,"intensity":1.0}],
        "decay":{"kind":"none"}}}))
        .unwrap();
    let burst: SimulatedBurst =
        serde_json::from_value(json!({"source":"gift","amount":50})).unwrap();
    let inputs =
        cc_beacons::intake::InputSelection::new(vec![(ContributionSource::Gift, 1)]).unwrap();
    let session = cc_beacons::preview::PreviewSession::new(
        &ghost,
        &inputs,
        &burst,
        super::routing::HostClock::default(),
    )
    .unwrap();
    let last: BeaconsIntensity =
        serde_json::from_value(json!({"visual_id":"frame","intensity":0.0})).unwrap();
    h.module
        .start_preview(&mut h.module.state.lock().unwrap(), session, last);
    tokio::time::timeout(Duration::from_secs(4), async {
        // Unfixed, the finished task keeps its handle; fixed, it is cleared.
        while h
            .module
            .state
            .lock()
            .unwrap()
            .preview_task
            .as_ref()
            .is_some_and(|task| !task.is_finished())
        {
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    })
    .await
    .unwrap();
    assert!(h.module.state.lock().unwrap().previews.is_empty());
    assert!(
        h.module
            .intake(input(ContributionSource::Gift, "after-error", 25))
            .unwrap()
    );
    assert_eq!(h.intensity("frame").await, 0.25);
}
