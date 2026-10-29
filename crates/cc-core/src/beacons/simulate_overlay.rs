//! Generated bursts exercise the RPC and native SSE host, without OBS or Twitch.
use super::*;

async fn event(response: &mut reqwest::Response) -> (BeaconsRenderSnapshot, bool) {
    tokio::time::timeout(Duration::from_secs(3), async {
        let mut bytes = Vec::new();
        loop {
            bytes.extend_from_slice(&response.chunk().await.unwrap().unwrap());
            if let Some((event, _)) = String::from_utf8_lossy(&bytes).split_once("\n\n") {
                let data = event
                    .lines()
                    .find_map(|line| line.strip_prefix("data: "))
                    .unwrap();
                return (
                    serde_json::from_str(data).unwrap(),
                    event.lines().any(|line| line == ": SIMULATED"),
                );
            }
        }
    })
    .await
    .unwrap()
}

#[tokio::test]
async fn gift_burst_pushes_only_its_visual_with_simulated_provenance_and_no_live_writes() {
    let h = Harness::new().await;
    for id in ["gift", "other"] {
        h.save(
            id,
            Some(json!({"source":"gift","unit":"count"})),
            json!({"kind":"none"}),
        )
        .await;
    }
    h.module
        .intake(input(ContributionSource::Gift, "before", 10))
        .unwrap();
    let before = h
        .call("beacons.contribution.list", json!({"limit":100}))
        .await;
    let retained = h.module.contributions().unwrap();
    let configuration = h.call("beacons.visual.list", json!({})).await;
    let event_count = h.events.since(0).unwrap().len();
    let mut target = h.stream("gift").await;
    let mut other = h.stream("other").await;
    assert!(!event(&mut target).await.1);
    assert!(!event(&mut other).await.1);
    let result = h
        .call(
            "beacons.simulate",
            json!({"visual_id":"gift",
        "burst":{"source":"gift","amount":50}}),
        )
        .await;
    assert_eq!(result["label"], "simulated");
    assert_eq!(result["intensity"]["intensity"], 0.5);
    let (pushed, simulated) = event(&mut target).await;
    assert_eq!(pushed.visual.visual_id.as_str(), "gift");
    assert_eq!(f64::from(pushed.intensity.intensity), 0.5);
    assert!(simulated);
    // Reconnects retain provenance and no-op live ticks do not relabel a preview.
    h.module.snapshot_live().unwrap();
    assert!(event(&mut h.stream("gift").await).await.1);
    assert_eq!(h.intensity("other").await, 0.1);
    assert!(
        tokio::time::timeout(Duration::from_millis(100), other.chunk())
            .await
            .is_err()
    );
    assert_eq!(
        h.call("beacons.contribution.list", json!({"limit":100}))
            .await,
        before
    );
    assert_eq!(h.module.contributions().unwrap(), retained);
    assert_eq!(
        h.call("beacons.visual.list", json!({})).await,
        configuration
    );
    assert_eq!(h.events.since(0).unwrap().len(), event_count);
    // The next real intake is based on 10 + 10, never the simulated 50.
    h.module
        .intake(input(ContributionSource::Gift, "after", 10))
        .unwrap();
    let (live, simulated) = event(&mut target).await;
    assert_eq!(f64::from(live.intensity.intensity), 0.2);
    assert!(!simulated);
    assert_eq!(h.intensity("other").await, 0.2);
}

#[tokio::test]
async fn simulation_without_native_or_with_expired_weak_returns_without_live_state() {
    for expired in [false, true] {
        let root = tempfile::tempdir().unwrap();
        let mut module = BeaconsModule::open(root.path()).unwrap();
        if expired {
            module.native = Some(Weak::new());
        }
        let visual = json!({"visual_id":"gift","name":"Simulated gift","curve":{
            "ranges":[{"total":0,"intensity":0.0},{"total":100,"intensity":1.0}],
            "decay":{"kind":"none"}}});
        for (method, params) in [
            ("beacons.visual.upsert", json!({"visual":visual})),
            (
                "beacons.simulate",
                json!({"visual_id":"gift","burst":{"source":"gift","amount":50}}),
            ),
        ] {
            let request = parse_request(
                &serde_json::to_vec(&json!({"method":method,"params":params})).unwrap(),
            )
            .unwrap();
            let result = module.call(&request).await.unwrap();
            if method == "beacons.simulate" {
                assert_eq!(result["intensity"]["intensity"], 0.5);
                assert_eq!(result["label"], "simulated");
            }
        }
        assert!(module.state.lock().unwrap().engines.is_empty());
        assert!(module.contributions().unwrap().is_empty());
    }
}

#[tokio::test]
async fn equal_intensity_still_updates_provenance_and_config_clears_only_its_preview() {
    let h = Harness::new().await;
    for id in ["gift", "other"] {
        h.save(id, None, json!({"kind":"none"})).await;
        h.call(
            "beacons.simulate",
            json!({"visual_id":id,
            "burst":{"source":"gift","amount":50}}),
        )
        .await;
    }
    let mut target = h.stream("gift").await;
    let (simulated, tagged) = event(&mut target).await;
    assert!(tagged);
    // A real value equal to a simulated value must still replace its source tag.
    h.native
        .accept_beacons_intensity(simulated.intensity)
        .unwrap();
    let (live, tagged) = event(&mut target).await;
    assert_eq!(f64::from(live.intensity.intensity), 0.5);
    assert!(!tagged);
    h.call(
        "beacons.simulate",
        json!({"visual_id":"gift",
        "burst":{"source":"gift","amount":100}}),
    )
    .await;
    assert!(event(&mut target).await.1);
    h.save("gift", None, json!({"kind":"none"})).await;
    let (reset, tagged) = event(&mut target).await;
    assert_eq!(f64::from(reset.intensity.intensity), 0.5);
    assert!(!tagged);
    assert!(event(&mut h.stream("other").await).await.1);
}
