//! Simulated local integration only: no Twitch account, keychain or live chat.
use cc_core::{
    AppState, EventHub, NativeConfig, NativeServices, Registry, bind, bridge_status,
    forward_bridge_event,
};
use cc_store::{
    DataStore, EngineClass, EngineProvider, LedgerEvent, LedgerKind, ModelName, Store, StoredItem,
    Timestamp as StoreTime,
};
use cc_twitch::{BridgeEvent, BridgeState, BridgeStatus, ConnectionGap, TwitchConfig};
use cc_types::{ErrorCode, EventKind, StreamEvent, parse_request};
use futures::StreamExt;
use serde_json::{Value, json};
use std::{sync::Arc, time::Duration};
use tokio_tungstenite::{connect_async, tungstenite::client::IntoClientRequest};

#[tokio::test]
async fn twitch_gap_surfaces_on_authenticated_events_without_payload_leakage() {
    let app = AppState::new(Registry::with_status(), 16).unwrap();
    let (address, server) = bind(app.clone(), ([127, 0, 0, 1], 0).into()).await.unwrap();
    let server = tokio::spawn(server);
    let mut request = format!("ws://{address}/events?since_seq=0")
        .into_client_request()
        .unwrap();
    request.headers_mut().insert(
        "authorization",
        format!("Bearer {}", app.session_token()).parse().unwrap(),
    );
    let (mut socket, _) = connect_async(request).await.unwrap();
    let event = BridgeEvent::Gap {
        from: "2026-10-25T10:00:00.000Z".into(),
        to: "2026-10-25T10:00:01.000Z".into(),
    };
    forward_bridge_event(&app.events, &event).unwrap();
    let text = tokio::time::timeout(Duration::from_secs(2), socket.next())
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    let wire: StreamEvent = serde_json::from_str(text.to_text().unwrap()).unwrap();
    assert_eq!(wire.kind, EventKind::BridgeGap);
    assert_eq!(wire.seq, 1);
    let fields: Value = serde_json::from_str(text.to_text().unwrap()).unwrap();
    assert_eq!(fields.as_object().unwrap().len(), 3);
    assert!(fields.get("from").is_none());
    assert!(fields.get("to").is_none());
    app.shutdown();
    drop(socket);
    server.abort();
}

#[test]
fn authoritative_bridge_mapping_preserves_last_gap_and_rejects_invalid_times() {
    let status = BridgeStatus {
        state: BridgeState::Connected,
        last_gap: Some(ConnectionGap {
            from: "2026-10-25T10:00:00.000Z".into(),
            to: "2026-10-25T10:00:01.000Z".into(),
        }),
        ..Default::default()
    };
    let mapped = bridge_status(status.clone()).unwrap();
    assert_eq!(mapped.state, cc_types::BridgeState::Connected);
    let value = serde_json::to_value(mapped).unwrap();
    assert_eq!(value["last_gap"]["from"], "2026-10-25T10:00:00.000Z");
    let mut invalid = status;
    invalid.last_gap.as_mut().unwrap().to = "invalid simulated time".into();
    assert_eq!(
        bridge_status(invalid).unwrap_err().code,
        ErrorCode::Upstream
    );
    let absent = serde_json::to_value(bridge_status(BridgeStatus::default()).unwrap()).unwrap();
    assert!(absent.get("last_gap").is_none());
}

#[tokio::test]
async fn native_registry_serves_reads_and_revoke_purges_the_real_store() {
    let directory = tempfile::tempdir().unwrap();
    let mut store = Store::open(directory.path()).unwrap();
    let viewer = cc_store::TwitchUserId::parse("123").unwrap();
    store.map_user(viewer.clone(), "simulated_viewer").unwrap();
    store
        .insert(
            DataStore::Recordings,
            &StoredItem {
                id: ulid::Ulid::new(),
                at: StoreTime::now(),
                user_ids: vec![viewer],
                content: "simulated recording".into(),
                simulated: true,
            },
        )
        .unwrap();
    store
        .append_ledger(
            StoreTime::now(),
            StoreTime::now(),
            LedgerEvent::Engine {
                call_id: ulid::Ulid::new(),
                cost_microusd: 0,
                class: EngineClass::Batch,
                provider: EngineProvider::LocalEndpoint,
                model_selected: ModelName::parse("simulated-model").unwrap(),
                model_served: None,
            },
        )
        .unwrap();
    let services = NativeServices::new(
        NativeConfig {
            twitch: TwitchConfig::default(),
            obs: cc_obs::Config {
                port: 0,
                password_label: "simulated-unused".into(),
            },
            overlay_port: 0,
        },
        store,
        Arc::new(|_| panic!("simulated login must not start")),
    )
    .await
    .unwrap();
    let app = services.app(32).unwrap();
    let mut expected = NativeServices::METHODS.to_vec();
    expected.extend(["settings.get", "settings.set"]);
    expected.extend(cc_core::lots::LotsModule::METHODS);
    expected.extend(cc_core::gatehouse::GatehouseModule::METHODS);
    expected.extend(cc_core::beacons::BeaconsModule::METHODS);
    expected.extend(["steward.ask", "steward.writ.seal", "steward.writ.tear"]);
    expected.sort();
    assert_eq!(app.registry.methods(), expected);
    assert_eq!(Registry::with_status().methods(), expected);
    let request = parse_request(
        br#"{"method":"settings.set","params":{"values":{"engine.cli_provider":"codex_cli"}}}"#,
    )
    .unwrap();
    let settings = app.registry.dispatch(&request).await.unwrap();
    assert_eq!(
        settings,
        json!({"values":{"engine.cli_provider":"codex_cli"}})
    );
    assert_eq!(
        serde_json::to_value(services.store.lock().unwrap().engine_settings().unwrap()).unwrap(),
        settings
    );
    let request = parse_request(br#"{"method":"settings.get","params":{}}"#).unwrap();
    assert_eq!(app.registry.dispatch(&request).await.unwrap(), settings);
    assert!(app.registry.methods().contains(&"beacons.source.url"));
    let request = parse_request(br#"{"method":"lots.draw.list","params":{}}"#).unwrap();
    assert_eq!(
        app.registry.dispatch(&request).await.unwrap(),
        json!({"draws":[]})
    );
    let request = parse_request(br#"{"method":"gatehouse.rules.list","params":{}}"#).unwrap();
    let rules = app.registry.dispatch(&request).await.unwrap();
    assert!(
        rules["rules"]
            .as_array()
            .unwrap()
            .iter()
            .all(|rule| { rule["rule_class"] == "rail" || rule["mode"] == "shadow" })
    );
    for (method, expected) in [
        ("bridge.status.get", json!({"state":"disconnected"})),
        (
            "auth.twitch.status",
            json!({"connected":false,"pending":false,"scopes":[]}),
        ),
        ("obs.status.get", json!({"connected":false})),
    ] {
        let request =
            parse_request(&serde_json::to_vec(&json!({"method":method,"params":{}})).unwrap())
                .unwrap();
        assert_eq!(app.registry.dispatch(&request).await.unwrap(), expected);
    }
    let request = parse_request(br#"{"method":"status.get","params":{}}"#).unwrap();
    let status = app.registry.dispatch(&request).await.unwrap();
    assert!(status.get("stream").is_none());
    assert!(status.get("gatehouse").is_none());
    assert_eq!(status["twitch_connected"], false);
    assert_eq!(status["obs_connected"], false);
    let request = parse_request(br#"{"method":"auth.twitch.start","params":{}}"#).unwrap();
    assert_eq!(
        app.registry.dispatch(&request).await.unwrap_err().code,
        ErrorCode::Invalid
    );
    let request = parse_request(br#"{"method":"obs.source.create","params":{"scene_name":"simulated","source_name":"simulated","url":"http://localhost:1/","width":1280,"height":720}}"#).unwrap();
    assert_eq!(
        app.registry.dispatch(&request).await.unwrap_err().code,
        ErrorCode::Invalid
    );
    let request = parse_request(br#"{"method":"auth.twitch.revoke","params":{}}"#).unwrap();
    assert_eq!(app.registry.dispatch(&request).await.unwrap(), json!({}));
    let store = services.store.lock().unwrap();
    assert!(store.items(DataStore::Recordings).unwrap().is_empty());
    assert!(store.read_ledger(LedgerKind::Engine).unwrap().is_empty());
    assert!(store.engine_settings().unwrap().values.is_empty());
    app.shutdown();
}

#[test]
fn simulated_chat_causes_only_an_invalidation() {
    let hub = EventHub::new(4).unwrap();
    let event = BridgeEvent::Notification(cc_twitch::Notification {
        id: "simulated-message".into(),
        at: "2026-10-25T10:00:00.000Z".into(),
        subscription_type: "channel.chat.message".into(),
        event: json!({"simulated":true}),
        chat: Some(cc_twitch::ChatMessage {
            id: "simulated-message".into(),
            at: "2026-10-25T10:00:00.000Z".into(),
            viewer: cc_twitch::Viewer {
                id: "123".into(),
                name: "simulated-viewer".into(),
                is_mod: false,
                sub_tier: None,
            },
            text: "simulated chat text".into(),
        }),
    });
    forward_bridge_event(&hub, &event).unwrap();
    let events = hub.since(0).unwrap();
    assert_eq!(events[0].kind, EventKind::ChatMessage);
    assert!(
        !serde_json::to_string(&events)
            .unwrap()
            .contains("simulated chat text")
    );
}
