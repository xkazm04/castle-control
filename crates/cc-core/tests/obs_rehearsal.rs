//! Simulated D3a RPC evidence. No live OBS, Twitch or OS credential access.
mod obs_rehearsal_support;
use cc_core::{AppState, EventHub, NativeConfig, NativeServices, Registry};
use cc_store::Store;
use cc_types::{ErrorCode, ErrorEnvelope, EventKind, RpcRequest, parse_request};
use obs_rehearsal_support::*;
use serde_json::{Value, json};
use std::{
    io::Write,
    sync::{Arc, Mutex, atomic::Ordering},
};
use zeroize::Zeroizing;

#[derive(Clone, Default)]
struct Captured(Arc<Mutex<Vec<u8>>>);
impl Write for Captured {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        self.0.lock().unwrap().extend_from_slice(bytes);
        Ok(bytes.len())
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}
fn request(method: &str, params: Value) -> RpcRequest {
    parse_request(&serde_json::to_vec(&json!({"method":method,"params":params})).unwrap()).unwrap()
}
async fn rpc(app: &AppState, method: &str, params: Value) -> Result<Value, ErrorEnvelope> {
    app.registry.dispatch(&request(method, params)).await
}
async fn service(root: &std::path::Path, passwords: Arc<Passwords>) -> Arc<NativeServices> {
    NativeServices::new_with_obs_password_store(
        NativeConfig {
            twitch: Default::default(),
            obs: cc_obs::Config {
                port: 0,
                password_label: LABEL.into(),
            },
            overlay_port: 0,
        },
        Store::open(root.join("native")).unwrap(),
        Arc::new(|_| panic!("no live login")),
        passwords,
    )
    .await
    .unwrap()
}
fn connect(port: u16, remember: bool) -> RpcRequest {
    request(
        "obs.connect",
        json!({"host":"127.0.0.1", "port":port, "password":SENTINEL, "remember":remember}),
    )
}
fn source(url: String) -> Value {
    json!({"scene_name":"simulated-scene", "source_name":"simulated-source", "url":url, "width":1280, "height":720})
}

#[tokio::test]
async fn memory_connect_reconnect_and_owned_cleanup_exclude_password_from_all_outputs() {
    let output = Captured::default();
    let writer = output.clone();
    let _guard = tracing::subscriber::set_default(
        tracing_subscriber::fmt()
            .with_writer(move || writer.clone())
            .finish(),
    );
    let root = tempfile::tempdir().unwrap();
    let passwords = Arc::new(Passwords::default());
    let peer = Peer::start().await;
    let service = service(root.path(), passwords.clone()).await;
    let app = service.app_with_data_dir(64, root.path()).unwrap();
    let input = connect(peer.port, false);
    assert!(!format!("{input:?}").contains(SENTINEL));
    let result = app.registry.dispatch(&input).await.unwrap();
    assert_eq!(result, json!({"connected":true}));
    assert!(!format!("{result:?}").contains(SENTINEL));
    assert!(!serde_json::to_string(&result).unwrap().contains(SENTINEL));
    assert_eq!(
        rpc(&app, "obs.status.get", json!({})).await.unwrap(),
        result
    );
    assert_eq!(
        rpc(&app, "status.get", json!({})).await.unwrap()["obs_connected"],
        true
    );
    assert_eq!(
        rpc(
            &app,
            "obs.scene.ensure",
            json!({"scene_name":"simulated-scene"})
        )
        .await
        .unwrap(),
        json!({"created":true})
    );
    assert_eq!(
        rpc(
            &app,
            "obs.scene.ensure",
            json!({"scene_name":"simulated-scene"})
        )
        .await
        .unwrap(),
        json!({"created":false})
    );

    // A hostile rejection cannot echo its comment; it also forces a reconnect.
    peer.seen.fail_source.store(true, Ordering::SeqCst);
    let error = rpc(&app, "obs.source.create", source(service.overlay_url()))
        .await
        .unwrap_err();
    assert_eq!(error.code, ErrorCode::Unavailable);
    assert!(!serde_json::to_string(&error).unwrap().contains(SENTINEL));
    assert!(!format!("{error:?} {}", error.message).contains(SENTINEL));
    assert_eq!(
        rpc(&app, "obs.source.create", source(service.overlay_url()))
            .await
            .unwrap(),
        json!({"source_name":"simulated-source"})
    );
    assert!(peer.seen.connects.load(Ordering::SeqCst) >= 2);
    assert_eq!(passwords.reads.load(Ordering::SeqCst), 0);
    assert!(passwords.writes.lock().unwrap().is_empty());
    let saved = std::fs::read_to_string(root.path().join("obs/ownership.json")).unwrap();
    let ledger: Value = serde_json::from_str(&saved).unwrap();
    let endpoint = format!("ws://127.0.0.1:{}", peer.port);
    assert_eq!(
        ledger["endpoints"][&endpoint]["inputs"][0]["input_uuid"],
        "simulated-input-uuid"
    );
    assert_eq!(
        ledger["endpoints"][&endpoint]["inputs"][0]["scene_item_id"],
        17
    );
    assert!(!saved.contains(SENTINEL));
    assert!(!saved.contains("password"));
    assert_eq!(
        rpc(&app, "obs.rehearsal.clear", json!({})).await.unwrap(),
        json!({"removed":1})
    );
    assert_eq!(
        rpc(&app, "obs.rehearsal.clear", json!({})).await.unwrap(),
        json!({"removed":0})
    );
    {
        let seen = peer.seen.requests.lock().unwrap();
        let removed: Vec<_> = seen
            .iter()
            .filter(|r| r["d"]["requestType"] == "RemoveInput")
            .collect();
        assert_eq!(removed.len(), 1);
        assert_eq!(
            removed[0]["d"]["requestData"],
            json!({"inputUuid":"simulated-input-uuid"})
        );
    }
    let events = app.events.since(0).unwrap();
    assert!(events.iter().any(|e| e.kind == EventKind::ObsStatus));
    assert!(!serde_json::to_string(&events).unwrap().contains(SENTINEL));
    assert!(!format!("{events:?}").contains(SENTINEL));
    let status = rpc(&app, "status.get", json!({})).await.unwrap();
    assert!(!serde_json::to_string(&status).unwrap().contains(SENTINEL));
    assert!(
        !String::from_utf8(output.0.lock().unwrap().clone())
            .unwrap()
            .contains(SENTINEL)
    );
    app.shutdown();
}

#[tokio::test]
async fn remember_stores_only_under_configured_label_and_connection_debug_is_redacted() {
    let peer = Peer::start().await;
    let passwords = Arc::new(Passwords::default());
    let root = tempfile::tempdir().unwrap();
    let service = service(root.path(), passwords.clone()).await;
    let app = AppState::new(Registry::with_native(service), 32).unwrap();
    assert_eq!(
        app.registry
            .dispatch(&connect(peer.port, true))
            .await
            .unwrap(),
        json!({"connected":true})
    );
    {
        let writes = passwords.writes.lock().unwrap();
        assert_eq!(writes.len(), 1);
        assert_eq!(writes[0].0, LABEL);
        assert!(writes[0].1.as_str() == SENTINEL);
    }
    let mut connection = cc_obs::Connection::new(
        cc_obs::Config {
            port: 0,
            password_label: LABEL.into(),
        },
        passwords.clone(),
    );
    connection
        .configure(
            "127.0.0.1",
            peer.port,
            Zeroizing::new(SENTINEL.into()),
            false,
        )
        .await
        .unwrap();
    assert!(!format!("{connection:?}").contains(SENTINEL));
    assert!(format!("{connection:?}").contains("REDACTED"));
    assert_eq!(passwords.writes.lock().unwrap().len(), 1);
    assert_eq!(passwords.reads.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn invalid_endpoint_has_validation_code_and_does_not_touch_credentials() {
    let root = tempfile::tempdir().unwrap();
    let passwords = Arc::new(Passwords::default());
    let service = service(root.path(), passwords.clone()).await;
    let app = AppState::new(Registry::with_native(service), 32).unwrap();
    for host in [
        "",
        "https://localhost",
        "localhost/path",
        "user@localhost",
        "localhost:4455",
        "8.8.8.8",
        "0.0.0.0",
        "2001:4860::1",
        "localhost?x=1",
    ] {
        let input = request(
            "obs.connect",
            json!({"host":host,"port":4455,"password":SENTINEL,"remember":true}),
        );
        let error = app.registry.dispatch(&input).await.unwrap_err();
        assert_eq!(error.code, ErrorCode::Invalid);
        assert!(!serde_json::to_string(&error).unwrap().contains(SENTINEL));
    }
    assert_eq!(
        app.registry
            .dispatch(&connect(0, true))
            .await
            .unwrap_err()
            .code,
        ErrorCode::Invalid
    );
    let invalid_port = json!({"method":"obs.connect","params":{"host":"localhost","port":65536,"password":SENTINEL,"remember":false}});
    assert_eq!(
        parse_request(&serde_json::to_vec(&invalid_port).unwrap())
            .unwrap_err()
            .code,
        ErrorCode::Invalid
    );
    assert!(passwords.writes.lock().unwrap().is_empty());
    assert_eq!(passwords.reads.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn lots_source_url_uses_the_isolated_owned_origin_and_fixtures_refuse_native_methods() {
    let root = tempfile::tempdir().unwrap();
    let service = service(root.path(), Arc::new(Passwords::default())).await;
    let app = AppState::new(Registry::with_native(service.clone()), 32).unwrap();
    let result = rpc(&app, "lots.source.url", json!({"draw_id":"simulated-draw"}))
        .await
        .unwrap();
    assert_eq!(
        result,
        json!({"url":format!("{}lots/simulated-draw", service.overlay_url())})
    );
    assert!(!result.to_string().contains(app.session_token()));
    let fixture = tempfile::tempdir().unwrap();
    for registry in [
        Registry::with_status(),
        Registry::with_fixture_root(fixture.path(), Arc::new(EventHub::new(32).unwrap())).unwrap(),
    ] {
        for input in [
            connect(4455, false),
            request("obs.scene.ensure", json!({"scene_name":"simulated-scene"})),
            request("obs.rehearsal.clear", json!({})),
            request("lots.source.url", json!({"draw_id":"simulated-draw"})),
        ] {
            let error = registry.dispatch(&input).await.unwrap_err();
            assert_eq!(error.code, ErrorCode::Unavailable);
            assert_eq!(error.message, "native adapters have not been configured");
        }
    }
}

#[tokio::test]
async fn failed_connect_retains_previous_target_and_never_remembers_rejected_credentials() {
    let root = tempfile::tempdir().unwrap();
    let passwords = Arc::new(Passwords::default());
    let good = Peer::start().await;
    let refused = Peer::start().await;
    let service = service(root.path(), passwords.clone()).await;
    let app = AppState::new(Registry::with_native(service), 32).unwrap();
    app.registry
        .dispatch(&connect(good.port, false))
        .await
        .unwrap();
    refused.seen.fail_version.store(true, Ordering::SeqCst);
    let error = app
        .registry
        .dispatch(&connect(refused.port, true))
        .await
        .unwrap_err();
    assert_eq!(error.code, ErrorCode::Unavailable);
    assert!(!serde_json::to_string(&error).unwrap().contains(SENTINEL));
    assert!(!format!("{error:?}").contains(SENTINEL));
    assert!(passwords.writes.lock().unwrap().is_empty());
    assert_eq!(
        rpc(&app, "obs.status.get", json!({})).await.unwrap(),
        json!({"connected":true})
    );
    assert_eq!(good.seen.requests.lock().unwrap().len(), 2);
    assert_eq!(refused.seen.requests.lock().unwrap().len(), 1);
    assert_eq!(passwords.reads.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn rehearsal_composition_records_ui_source_path_and_clears_the_configured_endpoint() {
    let root = tempfile::tempdir().unwrap();
    let peer = Peer::start().await;
    let service = service(root.path(), Arc::new(Passwords::default())).await;
    let app = service.app_rehearsal(64, root.path()).unwrap();
    app.registry
        .dispatch(&connect(peer.port, false))
        .await
        .unwrap();
    rpc(
        &app,
        "obs.scene.ensure",
        json!({"scene_name":"simulated-scene"}),
    )
    .await
    .unwrap();
    rpc(&app, "obs.source.create", source(service.overlay_url()))
        .await
        .unwrap();
    // OBS rejects an existing input. That must neither adopt a foreign input
    // nor lose the record of our preceding successful creation.
    assert!(
        rpc(&app, "obs.source.create", source(service.overlay_url()))
            .await
            .is_err()
    );
    let path = root.path().join("obs/ownership.json");
    let ledger: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
    let endpoint = format!("ws://127.0.0.1:{}", peer.port);
    assert_eq!(ledger["endpoints"].as_object().unwrap().len(), 1);
    assert_eq!(
        ledger["endpoints"][&endpoint]["inputs"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert_eq!(
        rpc(&app, "obs.rehearsal.clear", json!({})).await.unwrap(),
        json!({"removed":1})
    );
    let ledger: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
    assert_eq!(
        ledger["endpoints"][&endpoint],
        json!({"inputs":[],"scenes":[]})
    );
    assert_eq!(
        rpc(&app, "obs.rehearsal.clear", json!({})).await.unwrap(),
        json!({"removed":0})
    );
    app.shutdown();
}
