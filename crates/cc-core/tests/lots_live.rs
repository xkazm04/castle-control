//! Simulated chat, recorded transport and loopback OBS only; no Twitch/drand calls.
#[path = "lots_support/live.rs"]
mod support;
use cc_core::{EventHub, lots::LotsModule, overlay::RenderHost};
use cc_types::{ErrorCode, EventKind};
use serde_json::json;
use std::sync::Arc;
use support::*;

#[tokio::test]
async fn live_seal_is_on_obs_and_events_before_round_then_cast_exports_verified_writ() {
    let root = tempfile::tempdir().unwrap();
    let events = Arc::new(EventHub::new(64).unwrap());
    let render = Arc::new(RenderHost::default());
    let clock = Arc::new(Clock::new());
    let transport = Arc::new(RecordedTransport::new(
        render.clone(),
        events.clone(),
        false,
    ));
    let source = cc_core::lots::live_beacon::LiveBeacon::with_transport(
        cc_core::lots::live_beacon::official_chain(),
        transport.clone(),
    );
    let module = LotsModule::open(
        root.path(),
        events.clone(),
        Arc::new(source),
        clock.clone(),
        true,
    )
    .unwrap()
    .with_render_host(render.clone());
    prepare(&module).await;
    let overlay = cc_obs::Overlay::start_with_routes(0, render.routes())
        .await
        .unwrap();
    let url = format!("{}lots/simulated-draw", overlay.url());
    let seal = call(
        &module,
        "lots.roll.seal",
        json!({"draw_id":"simulated-draw","source":"drand_quicknet","margin_s":1}),
    )
    .await
    .unwrap();
    assert_eq!(transport.calls(), 0);
    let page = reqwest::get(&url).await.unwrap().text().await.unwrap();
    assert!(page.contains("Seal announced"));
    assert!(page.contains(seal["sealed"]["seal"].as_str().unwrap()));
    assert!(page.contains("Target round · 2"));
    assert!(!page.contains("Winners"));
    let params = json!({"draw_run_id":seal["draw_run_id"]});
    assert_eq!(
        call(&module, "lots.cast", params.clone())
            .await
            .unwrap_err()
            .code,
        ErrorCode::Conflict
    );
    assert_eq!(transport.calls(), 0);
    clock.advance();
    let cast = call(&module, "lots.cast", params).await.unwrap();
    let page = reqwest::get(&url).await.unwrap().text().await.unwrap();
    assert!(page.contains("Winners"));
    assert!(page.contains(cast["cast"]["winners"][0].as_str().unwrap()));
    assert!(page.contains("Simulated"));
    assert_eq!(transport.calls(), 1);
    let writ = call(&module, "lots.writ.get", json!({"writ_id":cast["writ_id"]}))
        .await
        .unwrap();
    verify_export(root.path(), &writ, &cast["cast"]);
    let history = events.since(0).unwrap();
    assert!(
        history
            .iter()
            .position(|e| e.kind == EventKind::Sealed)
            .unwrap()
            < history
                .iter()
                .position(|e| e.kind == EventKind::Cast)
                .unwrap()
    );
    assert_eq!(
        reqwest::get(format!("{}rpc", overlay.url()))
            .await
            .unwrap()
            .status(),
        404
    );
}

#[tokio::test]
async fn bad_live_signature_never_reaches_obs_or_writ() {
    let root = tempfile::tempdir().unwrap();
    let events = Arc::new(EventHub::new(64).unwrap());
    let render = Arc::new(RenderHost::default());
    let clock = Arc::new(Clock::new());
    let transport = Arc::new(RecordedTransport::new(render.clone(), events.clone(), true));
    let module = LotsModule::open(
        root.path(),
        events.clone(),
        Arc::new(cc_core::lots::live_beacon::LiveBeacon::with_transport(
            cc_core::lots::live_beacon::official_chain(),
            transport,
        )),
        clock.clone(),
        true,
    )
    .unwrap()
    .with_render_host(render.clone());
    prepare(&module).await;
    let seal = call(
        &module,
        "lots.roll.seal",
        json!({"draw_id":"simulated-draw","source":"drand_quicknet","margin_s":1}),
    )
    .await
    .unwrap();
    clock.advance();
    assert_eq!(
        call(
            &module,
            "lots.cast",
            json!({"draw_run_id":seal["draw_run_id"]})
        )
        .await
        .unwrap_err()
        .code,
        ErrorCode::Invalid
    );
    assert!(
        render
            .lots_cast(&"simulated-draw".to_owned().try_into().unwrap())
            .unwrap()
            .is_none()
    );
    assert!(
        !events
            .since(0)
            .unwrap()
            .iter()
            .any(|e| e.kind == EventKind::Cast)
    );
    drop(module);
    let store = cc_store::Store::open(root.path().join("store")).unwrap();
    assert!(store.items(cc_store::DataStore::Writs).unwrap().is_empty());
}

#[tokio::test]
async fn native_opt_in_is_explicit_and_uses_real_time_not_recorded_round_two() {
    for enabled in [false, true] {
        let root = tempfile::tempdir().unwrap();
        if enabled {
            std::fs::write(root.path().join("live-quicknet"), "enable-live-quicknet\n").unwrap();
        }
        let services = native(root.path()).await;
        let app = services.app_with_data_dir(64, root.path()).unwrap();
        let module = app.registry.simulated_lots().unwrap();
        prepare(&module).await;
        let result = call(
            &module,
            "lots.roll.seal",
            json!({"draw_id":"simulated-draw","source":"drand_quicknet","margin_s":30}),
        )
        .await;
        if enabled {
            let seal = result.unwrap();
            assert_ne!(seal["sealed"]["roll"]["randomness"]["round"], "2");
            let page = reqwest::get(format!("{}lots/simulated-draw", services.overlay_url()))
                .await
                .unwrap()
                .text()
                .await
                .unwrap();
            assert!(page.contains("Live-trusted quicknet"));
            assert!(page.contains(seal["sealed"]["seal"].as_str().unwrap()));
            let round = seal["sealed"]["roll"]["randomness"]["round"]
                .as_str()
                .unwrap()
                .parse::<i64>()
                .unwrap();
            let target = chrono::DateTime::parse_from_rfc3339("2023-08-23T15:09:27Z").unwrap()
                + chrono::Duration::seconds((round - 1) * 3);
            let events = app.events.since(0).unwrap();
            let announcement = events
                .iter()
                .find(|event| event.kind == EventKind::Sealed)
                .unwrap();
            let announced_at =
                chrono::DateTime::parse_from_rfc3339(&String::from(announcement.at.clone()))
                    .unwrap();
            assert!(announced_at < target);
        } else {
            let error = result.unwrap_err();
            assert_eq!(error.code, ErrorCode::Unavailable);
            assert!(error.message.contains("live-quicknet"));
        }
    }
}

#[tokio::test]
async fn malformed_opt_in_never_enables_native_source() {
    let root = tempfile::tempdir().unwrap();
    std::fs::write(root.path().join("live-quicknet"), "simulated wrong opt-in").unwrap();
    let services = native(root.path()).await;
    let error = match services.app_with_data_dir(64, root.path()) {
        Ok(_) => panic!("malformed opt-in enabled native modules"),
        Err(error) => error,
    };
    assert_eq!(error.code, ErrorCode::Invalid);
}

#[tokio::test]
async fn fake_bridge_pool_only_follows_committed_shadow_verdicts() {
    let root = tempfile::tempdir().unwrap();
    let services = native(root.path()).await;
    let app = services.app_with_data_dir(64, root.path()).unwrap();
    let module = app.registry.simulated_lots().unwrap();
    call(&module, "lots.draw.upsert", json!({"draw":draw()}))
        .await
        .unwrap();
    let (sender, receiver) = tokio::sync::broadcast::channel(16);
    let worker = app
        .registry
        .shadow_pipeline()
        .unwrap()
        .unwrap()
        .start(Some(receiver), Arc::new(cc_core::live::RulesOnly))
        .unwrap();
    sender.send(chat(1, "simulated !join")).unwrap();
    sender
        .send(chat(2, "simulated I want to kill myself !join"))
        .unwrap();
    drop(sender);
    worker.await.unwrap().unwrap();
    for (id, included) in [("1", true), ("2", false)] {
        let result = call(
            &module,
            "lots.roll.lookup",
            json!({"draw_id":"simulated-draw","user_id":id}),
        )
        .await
        .unwrap();
        assert_eq!(result.get("entry").is_some(), included);
    }
    let history = app.events.since(0).unwrap();
    let intake = history
        .iter()
        .rposition(|e| e.kind == EventKind::Roll)
        .unwrap();
    assert!(
        history[..intake]
            .iter()
            .any(|e| e.kind == EventKind::Decision)
    );
    drop(module);
    drop(app);
    drop(services);
    tokio::task::yield_now().await;
    let store = cc_store::Store::open(root.path().join("gatehouse/store")).unwrap();
    assert_eq!(
        store
            .read_ledger(cc_store::LedgerKind::Decisions)
            .unwrap()
            .len(),
        2
    );
}
