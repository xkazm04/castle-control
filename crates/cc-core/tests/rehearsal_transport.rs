//! Generated SIMULATED chat/OBS only. Real quicknet schedule, without a round fetch.
#[allow(dead_code)]
mod obs_rehearsal_support;
use cc_core::{AppState, NativeConfig, NativeServices, bind};
use cc_types::{ErrorCode, EventKind, StatusResult, StreamEvent, parse_request};
use futures::StreamExt;
use obs_rehearsal_support::{LABEL, Passwords, Peer, SENTINEL};
use serde_json::{Value, json};
use std::{sync::Arc, time::Duration};
use tokio_tungstenite::{connect_async, tungstenite::client::IntoClientRequest};

async fn rpc(app: &AppState, method: &str, params: Value) -> Value {
    let request =
        parse_request(&serde_json::to_vec(&json!({"method":method,"params":params})).unwrap())
            .unwrap();
    app.registry.dispatch(&request).await.unwrap()
}

#[tokio::test]
async fn rehearsal_http_status_events_and_quicknet_seal_work_without_native_opt_in() {
    let root = tempfile::tempdir().unwrap();
    // A native opt-in must never be read or rewritten by rehearsal composition.
    let marker = "SIMULATED unused native opt-in";
    std::fs::write(root.path().join("live-quicknet"), marker).unwrap();
    let peer = Peer::start().await;
    let services = NativeServices::new_with_obs_password_store(
        NativeConfig {
            twitch: Default::default(),
            obs: cc_obs::Config {
                port: 0,
                password_label: LABEL.into(),
            },
            overlay_port: 0,
        },
        cc_store::Store::open(root.path().join("native")).unwrap(),
        Arc::new(|_| panic!("no SIMULATED Twitch login")),
        Arc::new(Passwords::default()),
    )
    .await
    .unwrap();
    let app = services.app_rehearsal(256, root.path()).unwrap();
    let (address, server) = bind(app.clone(), ([127, 0, 0, 1], 0).into()).await.unwrap();
    let server = tokio::spawn(server);
    let mut request = format!("ws://{address}/events?since_seq=0")
        .into_client_request()
        .unwrap();
    request
        .headers_mut()
        .insert("origin", "http://tauri.localhost".parse().unwrap());
    request.headers_mut().insert(
        "sec-websocket-protocol",
        format!("cc-events, cc-session.{}", app.session_token())
            .parse()
            .unwrap(),
    );
    let mut socket = connect_async(request)
        .await
        .map_err(|_| "rehearsal event handshake failed")
        .unwrap()
        .0;
    rpc(
        &app,
        "obs.connect",
        json!({"host":"127.0.0.1","port":peer.port,"password":SENTINEL,"remember":false}),
    )
    .await;
    rpc(&app, "rehearsal.start", json!({})).await;
    let client = reqwest::Client::builder().no_proxy().build().unwrap();
    let status: StatusResult = client
        .post(format!("http://{address}/rpc"))
        .header("origin", "http://tauri.localhost")
        .bearer_auth(app.session_token())
        .json(&json!({"method":"status.get","params":{}}))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    assert!(status.simulated && status.obs_connected && !status.twitch_connected);
    // Only generation uses virtual time; HTTP/WS and the UTC seal cutoff below
    // keep their normal clocks.
    tokio::time::pause();
    rpc(
        &app,
        "rehearsal.scenario.run",
        json!({"scenario":"lots_fill"}),
    )
    .await;
    let draw = tokio::time::timeout(Duration::from_secs(3), async {
        loop {
            let list = rpc(&app, "lots.draw.list", json!({})).await;
            if let Some(id) = list["draws"]
                .as_array()
                .unwrap()
                .first()
                .and_then(|draw| draw["draw_id"].as_str())
            {
                let entry = rpc(
                    &app,
                    "lots.roll.lookup",
                    json!({"draw_id":id,"user_id":"1"}),
                )
                .await;
                if entry.get("entry").is_some() {
                    break id.to_owned();
                }
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    })
    .await
    .unwrap();
    tokio::time::resume();
    // Include the first admitted viewer before the domain's whole-second cutoff.
    tokio::time::sleep(Duration::from_millis(1100)).await;
    let sealed = rpc(
        &app,
        "lots.roll.seal",
        json!({"draw_id":draw,"source":"drand_quicknet","margin_s":6}),
    )
    .await;
    let sealed_at: chrono::DateTime<chrono::Utc> = sealed["sealed"]["roll"]["sealed_at"]
        .as_str()
        .unwrap()
        .parse()
        .unwrap();
    assert!((chrono::Utc::now() - sealed_at).num_seconds().abs() < 10);
    assert_eq!(
        sealed["sealed"]["roll"]["randomness"]["chain_hash"],
        "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971"
    );
    let cast = parse_request(
        &serde_json::to_vec(
            &json!({"method":"lots.cast","params":{"draw_run_id":sealed["draw_run_id"]}}),
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(
        app.registry.dispatch(&cast).await.unwrap_err().code,
        ErrorCode::Conflict
    );
    let mut kinds = Vec::new();
    tokio::time::timeout(Duration::from_secs(3), async {
        while !kinds.contains(&EventKind::Sealed) {
            let message = socket
                .next()
                .await
                .unwrap()
                .map_err(|_| "rehearsal event stream failed")
                .unwrap();
            let event: StreamEvent = serde_json::from_str(message.to_text().unwrap()).unwrap();
            kinds.push(event.kind);
        }
    })
    .await
    .unwrap();
    assert!(kinds.contains(&EventKind::RehearsalStatus));
    assert!(kinds.contains(&EventKind::ObsStatus));
    let status = rpc(&app, "status.get", json!({})).await;
    assert_eq!(status["simulated"], true);
    assert_eq!(status["obs_connected"], true);
    let url = rpc(&app, "lots.source.url", json!({"draw_id":draw})).await;
    let html = client
        .get(url["url"].as_str().unwrap())
        .send()
        .await
        .unwrap()
        .text()
        .await
        .unwrap();
    assert!(html.contains("SIMULATED"));
    assert_eq!(
        std::fs::read_to_string(root.path().join("live-quicknet")).unwrap(),
        marker
    );
    rpc(&app, "rehearsal.stop", json!({})).await;
    app.shutdown();
    drop(socket);
    tokio::time::timeout(Duration::from_secs(3), server)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    drop(app);
    drop(services);
    drop(peer);
    tokio::task::yield_now().await;
}
