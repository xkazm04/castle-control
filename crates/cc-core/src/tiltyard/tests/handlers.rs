use super::*;
use crate::Registry;

async fn call(registry: &Registry, method: &str, params: Value) -> Result<Value, ErrorEnvelope> {
    let request =
        parse_request(&serde_json::to_vec(&json!({"method":method,"params":params})).unwrap())?;
    registry.dispatch(&request).await
}
#[tokio::test]
async fn turn_stage_persist_restart_and_emit_invalidation() {
    let root = tempfile::tempdir().unwrap();
    let events = Arc::new(EventHub::new(64).unwrap());
    let registry = Registry::with_fixture_root(root.path(), events.clone()).unwrap();
    assert!(
        call(&registry, "maproom.stage.get", json!({}))
            .await
            .unwrap()
            .get("session")
            .is_none()
    );
    let started = call(
        &registry,
        "maproom.turn.run",
        json!({"action":fixture()["actions"][0]}),
    )
    .await
    .unwrap();
    assert_eq!(started["session"]["phase"], "live");
    call(
        &registry,
        "maproom.turn.run",
        json!({"action":{"kind":"pick","side":"right"}}),
    )
    .await
    .unwrap();
    call(
        &registry,
        "maproom.turn.run",
        json!({"action":{"kind":"cancel"}}),
    )
    .await
    .unwrap();
    let before = call(&registry, "maproom.stage.get", json!({}))
        .await
        .unwrap();
    assert_eq!(before["session"]["champion"], "simulated-b");
    assert_eq!(before["session"]["phase"], "called_off");
    assert!(
        events
            .since(0)
            .unwrap()
            .iter()
            .any(|e| e.kind == EventKind::Turn)
    );
    for event in events
        .since(0)
        .unwrap()
        .iter()
        .filter(|e| e.kind == EventKind::Turn)
    {
        assert_eq!(
            serde_json::to_value(event)
                .unwrap()
                .as_object()
                .unwrap()
                .len(),
            3
        );
    }
    drop(registry);
    tokio::task::yield_now().await;
    let restarted = Registry::with_fixture_root(root.path(), events).unwrap();
    let after = call(&restarted, "maproom.stage.get", json!({}))
        .await
        .unwrap();
    assert_eq!(before["session"], after["session"]);
    assert_eq!(
        call(&restarted, "tiltyard.source.url", json!({}))
            .await
            .unwrap_err()
            .code,
        ErrorCode::Unavailable
    );
}
#[tokio::test]
async fn invalid_actions_and_corrupted_persistence_are_rejected() {
    let root = tempfile::tempdir().unwrap();
    let events = Arc::new(EventHub::new(64).unwrap());
    let registry = Registry::with_fixture_root(root.path(), events.clone()).unwrap();
    assert_eq!(
        call(
            &registry,
            "maproom.turn.run",
            json!({"action":{"kind":"enter"}})
        )
        .await
        .unwrap_err()
        .code,
        ErrorCode::Conflict
    );
    for action in [
        json!({"kind":"tick","ms":-1}),
        json!({"kind":"pick","side":"middle"}),
        json!({"kind":"enter","counted":{"left":1,"right":0}}),
    ] {
        assert_eq!(
            call(&registry, "maproom.turn.run", json!({"action":action}))
                .await
                .unwrap_err()
                .code,
            ErrorCode::Invalid
        );
    }
    for defect in ["duplicate", "seed-order"] {
        let mut action = fixture()["actions"][0].clone();
        if defect == "duplicate" {
            action["list"]["items"][1]["id"] = action["list"]["items"][0]["id"].clone();
        } else {
            action["list"]["items"][0]["seed"] = "9".into();
        }
        assert_eq!(
            call(&registry, "maproom.turn.run", json!({"action":action}))
                .await
                .unwrap_err()
                .code,
            ErrorCode::Invalid
        );
    }
    call(
        &registry,
        "maproom.turn.run",
        json!({"action":fixture()["actions"][0]}),
    )
    .await
    .unwrap();
    drop(registry);
    tokio::task::yield_now().await;
    let file = root.path().join("tiltyard/session.json");
    let mut saved: Value = serde_json::from_slice(&std::fs::read(&file).unwrap()).unwrap();
    saved["session"]["bracket"]["rounds"][0][0]["b"] = "missing".into();
    std::fs::write(file, serde_json::to_vec(&saved).unwrap()).unwrap();
    assert!(Registry::with_fixture_root(root.path(), events).is_err());
}
#[tokio::test(start_paused = true)]
async fn native_clock_runs_live_and_theatre_but_stops_elapsed_while_paused() {
    let root = tempfile::tempdir().unwrap();
    let module = TiltyardModule::open(
        root.path().join("tiltyard"),
        Arc::new(
            GatehouseModule::open(
                root.path().join("gatehouse"),
                Arc::new(cc_store::SystemClock),
            )
            .unwrap(),
        ),
        Arc::new(EventHub::new(64).unwrap()),
        None,
    )
    .unwrap();
    let action = serde_json::from_value(fixture()["actions"][0].clone()).unwrap();
    module.turn(&action).await.unwrap();
    tokio::task::yield_now().await;
    tokio::time::advance(Duration::from_millis(1000)).await;
    tokio::task::yield_now().await;
    assert_eq!(
        module.stage().await.unwrap().session.unwrap().elapsed_ms,
        1000
    );
    module.turn(&TiltyardAction::Cancel {}).await.unwrap();
    tokio::time::advance(Duration::from_secs(10)).await;
    assert_eq!(
        module.stage().await.unwrap().session.unwrap().elapsed_ms,
        1000
    );
    module.turn(&TiltyardAction::Enter {}).await.unwrap();
    module
        .turn(&TiltyardAction::Pick {
            side: TiltyardWinner::Right,
        })
        .await
        .unwrap();
    module.turn(&TiltyardAction::Speed {}).await.unwrap();
    tokio::time::advance(Duration::from_millis(2999)).await;
    tokio::task::yield_now().await;
    assert_eq!(
        module.stage().await.unwrap().session.unwrap().phase,
        TiltyardSessionPhase::Verdict
    );
    tokio::time::advance(Duration::from_millis(1)).await;
    tokio::task::yield_now().await;
    assert_eq!(
        module.stage().await.unwrap().session.unwrap().phase,
        TiltyardSessionPhase::Done
    );
}

#[tokio::test(start_paused = true)]
async fn live_session_resumes_after_restart_with_its_logical_clock_and_speed() {
    let root = tempfile::tempdir().unwrap();
    let events = Arc::new(EventHub::new(64).unwrap());
    let registry = Registry::with_fixture_root(root.path(), events.clone()).unwrap();
    call(
        &registry,
        "maproom.turn.run",
        json!({"action":fixture()["actions"][0]}),
    )
    .await
    .unwrap();
    call(
        &registry,
        "maproom.turn.run",
        json!({"action":{"kind":"tick","ms":1234}}),
    )
    .await
    .unwrap();
    call(
        &registry,
        "maproom.turn.run",
        json!({"action":{"kind":"speed"}}),
    )
    .await
    .unwrap();
    let before = call(&registry, "maproom.stage.get", json!({}))
        .await
        .unwrap();
    drop(registry);
    tokio::task::yield_now().await;
    let registry = Registry::with_fixture_root(root.path(), events).unwrap();
    let after = call(&registry, "maproom.stage.get", json!({}))
        .await
        .unwrap();
    for key in [
        "phase",
        "bracket",
        "history",
        "match_key",
        "elapsed_ms",
        "speed",
        "calls",
        "counted",
        "simulated",
    ] {
        assert_eq!(before["session"][key], after["session"][key], "{key}");
    }
    assert_eq!(after["session"]["elapsed_ms"], 1234);
    assert_eq!(after["session"]["speed"], 3);
    assert!(after["session"]["window_ends_at"].is_string());
}
