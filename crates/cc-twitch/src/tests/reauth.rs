//! Refresh failures and scope shortfalls: only a definitive invalid_grant destroys the login.
//! The server, identities and tokens here are simulated.
use super::{fixtures::*, harness::*};
use crate::store::{Credential, CredentialStore, Secret};
use crate::types::Endpoints;
use crate::{BridgeError, BridgeState, TwitchBridge, TwitchConfig};
use axum::{
    Router,
    extract::State,
    http::{StatusCode, Uri},
    response::{IntoResponse, Response},
};
use serde_json::json;
use std::{sync::Arc, sync::atomic::Ordering, time::Duration};
use tokio::{net::TcpListener, sync::mpsc};

#[derive(Clone)]
struct Script {
    refresh_status: u16,
    refresh_body: &'static str,
    granted_scopes: Vec<&'static str>,
}

async fn serve(State(script): State<Arc<Script>>, uri: Uri) -> Response {
    match uri.path() {
        "/oauth2/token" => (
            StatusCode::from_u16(script.refresh_status).expect("simulated status"),
            [("content-type", "application/json")],
            script.refresh_body,
        )
            .into_response(),
        "/oauth2/validate" => (
            [("content-type", "application/json")],
            json!({"client_id": "cid", "login": "simulated-bot", "user_id": BOT_ID,
                "scopes": script.granted_scopes, "expires_in": 3600})
            .to_string(),
        )
            .into_response(),
        _ => StatusCode::NOT_FOUND.into_response(),
    }
}

/// Start a bridge against a scripted server; `expired` forces a refresh at startup.
async fn run(script: Script, expired: bool) -> (Harness, Arc<TwitchBridge>) {
    let h = harness().await;
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("simulated bind");
    let base = format!("http://{}", listener.local_addr().expect("address"));
    let app = Router::new().fallback(serve).with_state(Arc::new(script));
    tokio::spawn(async move { axum::serve(listener, app).await.expect("simulated server") });
    let expires_at = chrono::Utc::now().timestamp() + if expired { -10 } else { 3600 };
    h.store
        .save(&Credential {
            access_token: Secret::new(ACCESS),
            refresh_token: Secret::new(REFRESH),
            expires_at,
        })
        .expect("simulated save");
    let bridge = TwitchBridge::with_endpoints(
        TwitchConfig {
            client_id: "cid".into(),
            channel: "simulated-channel".into(),
            modules: vec![],
        },
        Endpoints {
            id_base: base.clone(),
            helix_base: format!("{base}/helix"),
            eventsub_url: h.ws_url.clone(),
            time_unit: Duration::from_millis(100),
            validate_every: Duration::from_secs(3600),
        },
        h.store.clone(),
        h.purge.clone(),
        300,
    )
    .expect("simulated bridge");
    let (tx, rx) = mpsc::channel(8);
    std::mem::forget(rx);
    bridge.start(tx);
    until(|| bridge.status().state == BridgeState::Error).await;
    (h, bridge)
}

fn refresh_failure(status: u16, body: &'static str) -> Script {
    Script {
        refresh_status: status,
        refresh_body: body,
        granted_scopes: vec!["user:read:chat", "user:write:chat"],
    }
}

fn assert_reauth(bridge: &TwitchBridge) {
    let detail = bridge.status().detail.expect("re-auth detail");
    assert_eq!(detail, BridgeError::Unauthorized.to_string());
}

#[tokio::test]
async fn invalid_grant_on_refresh_purges_the_login() {
    for body in [
        r#"{"status":400,"error":"invalid_grant"}"#,
        r#"{"status":400,"message":"invalid_grant"}"#,
    ] {
        let (h, bridge) = run(refresh_failure(400, body), true).await;
        assert!(h.store.load().expect("simulated store").is_none());
        assert_eq!(h.purge.completed.load(Ordering::SeqCst), 1);
        assert_reauth(&bridge);
    }
}

#[tokio::test]
async fn other_400_on_refresh_keeps_the_login_and_asks_for_reauth() {
    for body in [
        r#"{"status":400,"message":"simulated other failure"}"#,
        "<html>simulated gateway page</html>",
        "",
    ] {
        let (h, bridge) = run(refresh_failure(400, body), true).await;
        assert!(h.store.load().expect("simulated store").is_some());
        assert_eq!(h.purge.started.load(Ordering::SeqCst), 0);
        assert_reauth(&bridge);
    }
}

#[tokio::test]
async fn scope_shortfall_keeps_the_login_and_asks_for_reauth() {
    let script = Script {
        refresh_status: 200,
        refresh_body: "{}",
        granted_scopes: vec!["user:read:chat"],
    };
    let (h, bridge) = run(script, false).await;
    assert!(h.store.load().expect("simulated store").is_some());
    assert_eq!(h.purge.started.load(Ordering::SeqCst), 0);
    assert_reauth(&bridge);
}
