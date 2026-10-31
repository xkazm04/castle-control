//! Generated bursts exercise the RPC and native SSE host, without OBS or Twitch.
use super::*;

async fn event(response: &mut reqwest::Response) -> (BeaconsRenderSnapshot, bool) {
    tokio::time::timeout(Duration::from_secs(3), async {
        let mut bytes = Vec::new();
        loop {
            bytes.extend_from_slice(&response.chunk().await.unwrap().unwrap());
            while let Some(end) = bytes.windows(2).position(|pair| pair == b"\n\n") {
                let frame = String::from_utf8(bytes.drain(..end + 2).collect()).unwrap();
                // Advancing fake time also wakes SSE keepalive comments.
                if let Some(data) = frame.lines().find_map(|line| line.strip_prefix("data: ")) {
                    return (
                        serde_json::from_str(data).unwrap(),
                        frame.lines().any(|line| line == ": SIMULATED"),
                    );
                }
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
    assert!(pushed.simulated);
    assert!(simulated);
    // Reconnects retain provenance and no-op live ticks do not relabel a preview.
    h.module.snapshot_live().unwrap();
    let (reconnected, tagged) = event(&mut h.stream("gift").await).await;
    assert!(reconnected.simulated);
    assert!(tagged);
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
    assert!(!live.simulated);
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
    assert!(simulated.simulated);
    assert!(tagged);
    // A real value equal to a simulated value must still replace its source tag.
    h.native
        .accept_beacons_intensity(simulated.intensity)
        .unwrap();
    let (live, tagged) = event(&mut target).await;
    assert_eq!(f64::from(live.intensity.intensity), 0.5);
    assert!(!live.simulated);
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
    assert!(!reset.simulated);
    assert!(!tagged);
    assert!(event(&mut h.stream("other").await).await.1);
}

// Keep Tokio's paused clock fixed while real loopback I/O makes progress.
// The yield branch prevents the runtime's idle-time automatic advancement.
async fn fixed_time<F: std::future::Future>(future: F) -> F::Output {
    let deadline = std::time::Instant::now() + Duration::from_secs(3);
    tokio::pin!(future);
    loop {
        assert!(
            std::time::Instant::now() < deadline,
            "loopback I/O stalled with paused time"
        );
        tokio::select! {
            biased;
            result = &mut future => return result,
            _ = tokio::task::yield_now() => {}
        }
    }
}

async fn fire(h: &Harness, id: &str) -> Value {
    h.call(
        "beacons.simulate",
        json!({"visual_id":id,
        "burst":{"source":"gift","amount":50}}),
    )
    .await
}

async fn advance_preview(seconds: u64) {
    tokio::time::advance(Duration::from_secs(seconds)).await;
    // Let the independent ticker run at the advanced instant.
    for _ in 0..10 {
        tokio::task::yield_now().await;
    }
}

fn previews_empty(h: &Harness) {
    let state = h.module.state.lock().unwrap();
    assert!(state.previews.is_empty());
    assert!(state.preview_task.is_none());
}

#[tokio::test]
async fn offline_test_fire_decays_then_restores_live_sse_without_ledger_writes() {
    let h = Harness::new().await;
    // Intake is never started. Seed an accepted live intensity on this host.
    let mut visual = h
        .save("gift", None, json!({"kind":"exponential","half_life_s":60}))
        .await;
    visual["curve"]["ranges"][1]["total"] = json!(50);
    h.call("beacons.visual.upsert", json!({"visual":visual}))
        .await;
    h.save("other", None, json!({"kind":"none"})).await;
    let id: cc_types::VisualId = "gift".to_owned().try_into().unwrap();
    h.native
        .accept_beacons_intensity(cc_types::BeaconsIntensity {
            visual_id: id,
            intensity: 0.2.try_into().unwrap(),
        })
        .unwrap();
    h.module
        .intake(input(ContributionSource::Gift, "before-session", 10))
        .unwrap();
    let before = h
        .call("beacons.contribution.list", json!({"limit":100}))
        .await;
    let retained = h.module.contributions().unwrap();
    let ledger = || {
        serde_json::to_value(
            h.module
                .state
                .lock()
                .unwrap()
                ._store
                .read_ledger(cc_store::LedgerKind::Engine)
                .unwrap(),
        )
        .unwrap()
    };
    let engine_before = ledger();
    let mut target = h.stream("gift").await;
    let mut other = h.stream("other").await;
    assert!(!event(&mut target).await.1);
    assert!(!event(&mut other).await.1);
    tokio::time::pause();
    let result = fire(&h, "gift").await;
    assert_eq!(result["intensity"]["intensity"], 1.0);
    let (initial, tagged) = fixed_time(event(&mut target)).await;
    assert_eq!(f64::from(initial.intensity.intensity), 1.0);
    assert!(initial.simulated && tagged);
    advance_preview(60).await;
    let (half, tagged) = fixed_time(event(&mut target)).await;
    assert_eq!(f64::from(half.intensity.intensity), 0.5);
    assert!(half.simulated && tagged);
    // 459 seconds is the first whole-second floor tick for a 60 s half-life.
    advance_preview(399).await;
    let (ended, tagged) = fixed_time(event(&mut target)).await;
    assert_eq!(f64::from(ended.intensity.intensity), 0.2);
    assert!(!ended.simulated && !tagged);
    previews_empty(&h);
    advance_preview(700).await;
    tokio::time::resume();
    for stream in [&mut target, &mut other] {
        assert!(
            tokio::time::timeout(Duration::from_millis(100), event(stream))
                .await
                .is_err()
        );
    }
    assert_eq!(
        h.call("beacons.contribution.list", json!({"limit":100}))
            .await,
        before
    );
    assert_eq!(h.module.contributions().unwrap(), retained);
    assert_eq!(ledger(), engine_before);
    assert!(h.module.state.lock().unwrap().engines.is_empty());
}

#[tokio::test]
async fn no_decay_ends_and_replaced_preview_uses_a_fresh_hold() {
    let h = Harness::new().await;
    h.save("gift", None, json!({"kind":"none"})).await;
    let mut target = h.stream("gift").await;
    event(&mut target).await;
    tokio::time::pause();
    fire(&h, "gift").await;
    assert!(fixed_time(event(&mut target)).await.0.simulated);
    advance_preview(20).await;
    fire(&h, "gift").await;
    advance_preview(10).await;
    assert_eq!(h.module.state.lock().unwrap().previews.len(), 1);
    advance_preview(20).await;
    let (ended, tagged) = fixed_time(event(&mut target)).await;
    assert!(!ended.simulated && !tagged);
    assert_eq!(f64::from(ended.intensity.intensity), 0.0);
    previews_empty(&h);
    tokio::time::resume();
}

#[tokio::test]
async fn curve_live_contribution_and_purge_cancel_sessions_and_stop_the_ticker() {
    for cause in ["curve", "live", "purge"] {
        let h = Harness::new().await;
        let visual = h
            .save(
                "gift",
                Some(json!({"source":"gift","unit":"count"})),
                json!({"kind":"none"}),
            )
            .await;
        let mut target = h.stream("gift").await;
        event(&mut target).await;
        tokio::time::pause();
        fire(&h, "gift").await;
        assert!(fixed_time(event(&mut target)).await.0.simulated);
        let ticker = h
            .module
            .state
            .lock()
            .unwrap()
            .preview_task
            .as_ref()
            .unwrap()
            .abort_handle();
        match cause {
            "curve" => {
                h.call(
                    "beacons.curve.set",
                    json!({"visual_id":"gift","curve":visual["curve"]}),
                )
                .await;
            }
            "live" => {
                h.module
                    .intake(input(ContributionSource::Gift, "cancel", 10))
                    .unwrap();
            }
            "purge" => {
                h.module.purge_live_data().unwrap();
            }
            _ => unreachable!(),
        }
        let (ended, tagged) = fixed_time(event(&mut target)).await;
        assert!(!ended.simulated && !tagged);
        previews_empty(&h);
        advance_preview(60).await;
        assert!(ticker.is_finished());
        tokio::time::resume();
        assert!(
            tokio::time::timeout(Duration::from_millis(100), event(&mut target))
                .await
                .is_err()
        );
    }
}

#[tokio::test]
async fn live_decay_and_unrelated_contributions_preserve_the_preview() {
    let h = Harness::new().await;
    h.save(
        "gift",
        Some(json!({"source":"gift","unit":"count"})),
        json!({"kind":"exponential","half_life_s":60}),
    )
    .await;
    let mut stream = h.stream("gift").await;
    event(&mut stream).await;
    tokio::time::pause();
    h.module
        .intake(input(ContributionSource::Gift, "seed", 10))
        .unwrap();
    fixed_time(event(&mut stream)).await;
    fire(&h, "gift").await;
    assert!(fixed_time(event(&mut stream)).await.0.simulated);
    advance_preview(60).await;
    h.module.snapshot_live().unwrap();
    h.module
        .intake(input(ContributionSource::Cheer, "unrelated", 10))
        .unwrap();
    let (preview, tagged) = fixed_time(event(&mut stream)).await;
    assert_eq!(f64::from(preview.intensity.intensity), 0.25);
    assert!(preview.simulated && tagged);
    assert_eq!(h.module.state.lock().unwrap().previews.len(), 1);
    h.module.purge_live_data().unwrap();
    previews_empty(&h);
    tokio::time::resume();
}
