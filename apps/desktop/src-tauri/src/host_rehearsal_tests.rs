use super::*;
use serde_json::{Value, json};

async fn rpc(host: &CoreHost, method: &str, params: Value) -> Result<Value, Value> {
    let request = serde_json::from_value(json!({"method":method,"params":params})).unwrap();
    host.state
        .registry
        .dispatch(&request)
        .await
        .map_err(|e| serde_json::to_value(e).unwrap())
}

#[tokio::test(flavor = "current_thread")]
async fn rehearsal_has_native_rendering_no_twitch_session_and_registry_auth_refusals() {
    let root = host_test_root::Root::new("cc-simulated-rehearsal-host");
    let mut options = Options::parse(["--rehearsal"].map(String::from)).unwrap();
    // No test connection reaches the owner's OBS or keychain.
    options.native.as_mut().unwrap().obs_port = 0;
    let mut host = CoreHost::start(options, &root).await.unwrap();
    assert!(host.login.is_none());
    let services = host._services.as_ref().unwrap();
    assert!(services.bridge.connections().is_empty());
    assert!(services.bridge.begin_device_login().await.is_err());
    assert_eq!(
        rpc(&host, "auth.twitch.status", json!({})).await.unwrap(),
        json!({"connected":false,"pending":false,"scopes":[]})
    );
    for method in ["auth.twitch.start", "auth.twitch.revoke"] {
        let error = rpc(&host, method, json!({})).await.unwrap_err();
        assert_eq!(error["code"], "blocked_by_policy");
    }
    assert!(services.bridge.connections().is_empty());
    let methods = host.state.registry.methods();
    for name in cc_core::rehearsal::RehearsalModule::METHODS {
        assert!(methods.contains(name));
    }
    for name in [
        "obs.status.get",
        "obs.connect",
        "obs.scene.ensure",
        "obs.rehearsal.clear",
        "obs.source.create",
        "lots.source.url",
    ] {
        assert!(methods.contains(&name));
    }
    let status = rpc(&host, "status.get", json!({})).await.unwrap();
    assert_eq!(status["simulated"], true);
    assert_eq!(status["twitch_connected"], false);
    assert_eq!(
        rpc(&host, "rehearsal.start", json!({})).await.unwrap()["active"],
        true
    );
    let accepted = rpc(
        &host,
        "rehearsal.scenario.run",
        json!({"scenario":"duel_round"}),
    )
    .await
    .unwrap();
    assert_eq!(accepted, json!({"accepted":true}));
    assert_eq!(
        rpc(&host, "rehearsal.stop", json!({})).await.unwrap()["active"],
        false
    );
    let client = reqwest::Client::builder().no_proxy().build().unwrap();
    assert_eq!(
        client
            .get(services.overlay_url())
            .send()
            .await
            .unwrap()
            .status(),
        200
    );
    let launch = serde_json::to_value(host.launch().unwrap()).unwrap();
    assert_eq!(launch.as_object().unwrap().len(), 3);
    assert_eq!(launch["mode"], "core");
    assert!(root.join("rehearsal/native/store.sqlite3").is_file());
    assert!(!root.join("native").exists());
    host.shutdown();
    tokio::time::timeout(std::time::Duration::from_secs(3), &mut host.server)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    drop(host);
    tokio::task::yield_now().await;
}

#[tokio::test]
async fn rehearsal_overrides_public_twitch_settings_and_does_not_start_login() {
    let root = host_test_root::Root::new("cc-simulated-rehearsal-inert");
    let host = CoreHost::start(
        Options {
            rehearsal: true,
            login: true,
            native: Some(crate::options::NativeOptions {
                client_id: "simulatedPublicId".into(),
                test_channel: "simulated_owner".into(),
                obs_port: 0,
                ..crate::options::NativeOptions::default()
            }),
            ..Options::default()
        },
        &root,
    )
    .await
    .unwrap();
    assert!(host.login.is_none());
    assert!(
        host._services
            .as_ref()
            .unwrap()
            .bridge
            .begin_device_login()
            .await
            .is_err()
    );
    host.shutdown();
    drop(host);
    tokio::task::yield_now().await;
}

#[tokio::test]
async fn relaunch_waits_for_the_previous_overlay_port_to_be_released() {
    let root = host_test_root::Root::new("cc-simulated-rehearsal-relaunch");
    let reservation = std::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0)).unwrap();
    let port = reservation.local_addr().unwrap().port();
    let release = tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(150)).await;
        drop(reservation);
    });
    let host = CoreHost::start(
        Options {
            rehearsal: true,
            relaunch: true,
            native: Some(crate::options::NativeOptions {
                obs_port: 0,
                overlay_port: port,
                ..crate::options::NativeOptions::default()
            }),
            ..Options::default()
        },
        &root,
    )
    .await
    .unwrap();
    release.await.unwrap();
    assert_eq!(
        host._services.as_ref().unwrap().overlay_url(),
        format!("http://localhost:{port}/")
    );
    host.shutdown();
    drop(host);
    tokio::task::yield_now().await;
}
