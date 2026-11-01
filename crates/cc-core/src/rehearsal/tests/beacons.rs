use super::*;

async fn snapshot(h: &Harness) -> cc_types::BeaconsRenderSnapshot {
    let client = reqwest::Client::builder().no_proxy().build().unwrap();
    let mut response = client
        .get(format!(
            "{}push/beacons?visual_id=simulated-rehearsal",
            h.services.overlay_url()
        ))
        .send()
        .await
        .unwrap();
    tokio::time::timeout(Duration::from_secs(3), async {
        let mut bytes = Vec::new();
        loop {
            bytes.extend_from_slice(&response.chunk().await.unwrap().unwrap());
            let text = String::from_utf8_lossy(&bytes);
            if let Some((event, _)) = text.split_once("\n\n") {
                let data = event
                    .lines()
                    .find_map(|line| line.strip_prefix("data: "))
                    .unwrap();
                return serde_json::from_str(data).unwrap();
            }
        }
    })
    .await
    .unwrap()
}

#[tokio::test]
async fn beacon_fire_reuses_simulate_and_stop_clears_its_preview() {
    let h = Harness::new().await;
    h.app
        .registry
        .dispatch(&request(
            "beacons.visual.upsert",
            json!({"visual":{
                "visual_id":"simulated-rehearsal","name":"SIMULATED rehearsal beacon",
                "curve":{"ranges":[{"total":0,"intensity":0.0},{"total":100,"intensity":1.0}],
                    "decay":{"kind":"none"}}
            }}),
        ))
        .await
        .unwrap();
    assert!(!snapshot(&h).await.simulated);
    assert_eq!(
        call(
            &h.module,
            "rehearsal.scenario.run",
            json!({"scenario":"beacon_fire",
        "visual_id":"simulated-rehearsal"})
        )
        .await,
        json!({"accepted":false})
    );
    call(&h.module, "rehearsal.start", json!({})).await;
    assert_eq!(
        call(
            &h.module,
            "rehearsal.scenario.run",
            json!({"scenario":"beacon_fire",
        "visual_id":"simulated-rehearsal"})
        )
        .await,
        json!({"accepted":true})
    );
    finish_scenarios(&h.module).await;
    let fired = snapshot(&h).await;
    assert!(fired.simulated);
    assert_eq!(f64::from(fired.intensity.intensity), 1.0);
    call(&h.module, "rehearsal.stop", json!({})).await;
    let stopped = snapshot(&h).await;
    assert!(!stopped.simulated);
    assert_eq!(f64::from(stopped.intensity.intensity), 0.0);
    h.close().await;
}
