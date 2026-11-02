// Adapted from Shadowrunr OS @ 7e4b6f8,
// crates/shadowrunr-daemon/src/platform/twitch/tests.rs.
//! Simulated OAuth, lifecycle and refresh tests.
use super::{fixtures::*, harness::*, mock::get};
use crate::store::{Credential, CredentialStore};
use crate::types::Endpoints;
use crate::{BridgeError, BridgeState, TwitchBridge, TwitchConfig};
use std::{
    sync::{Arc, atomic::Ordering},
    time::Duration,
};
use tokio::sync::mpsc;

#[tokio::test]
async fn device_login_polls_through_pending_and_stores_the_token() {
    let mut h = harness().await;
    let p = h.platform();
    let (tx, _rx) = mpsc::channel(16);
    p.start(tx);
    until(|| p.status().state == BridgeState::Disconnected && p.status().detail.is_some()).await;
    let code = p
        .begin_device_login()
        .await
        .expect("simulated device login");
    assert_eq!(code.user_code, "SIMULATED");
    assert_eq!(code.expires_s, 1800);
    assert!(
        code.verification_uri
            .starts_with("https://www.twitch.tv/activate")
    );
    assert_eq!(p.status().state, BridgeState::Connecting);
    let mut ws = h.accept().await;
    send(&mut ws, welcome("S1")).await;
    until(|| p.status().state == BridgeState::Connected).await;
    let device = h.mock.calls_to("POST", "/oauth2/device");
    assert_eq!(get(&device[0].form(), "client_id"), Some("cid"));
    assert_eq!(
        get(&device[0].form(), "scopes"),
        Some("user:read:chat user:write:chat")
    );
    assert!(h.mock.device_polls.load(Ordering::SeqCst) >= 2);
    let polls = h.mock.calls_to("POST", "/oauth2/token");
    let form = polls[0].form();
    assert_eq!(
        get(&form, "grant_type"),
        Some("urn:ietf:params:oauth:grant-type:device_code")
    );
    assert!(get(&form, "device_code") == Some("simulated-device-secret"));
    assert!(get(&form, "client_secret").is_none());
    let saved = h
        .store
        .load()
        .expect("simulated load")
        .expect("simulated credential");
    assert!(saved.access_token.expose() == ACCESS);
    assert!(saved.refresh_token.expose() == REFRESH);
    assert!(saved.expires_at > chrono::Utc::now().timestamp());
    assert_eq!(p.status().bot_login.as_deref(), Some("simulated-bot"));
}

#[tokio::test]
async fn device_login_obeys_slow_down_denial_and_expiry() {
    let h = harness().await;
    h.mock.slow_down.store(true, Ordering::SeqCst);
    let p = h.platform();
    let (tx, _rx) = mpsc::channel(16);
    p.start(tx);
    until(|| p.status().detail.is_some()).await;
    let started = tokio::time::Instant::now();
    p.begin_device_login().await.expect("simulated login");
    until(|| h.store.load().expect("store").is_some()).await;
    assert!(started.elapsed() >= Duration::from_millis(700));
    p.disconnect().await.expect("simulated disconnect");
    h.mock.deny_device.store(true, Ordering::SeqCst);
    p.begin_device_login()
        .await
        .expect("simulated denied login");
    until(|| p.status().state == BridgeState::Error).await;
    assert!(h.store.load().expect("store").is_none());
    h.mock.deny_device.store(false, Ordering::SeqCst);
    h.mock.expire_device.store(true, Ordering::SeqCst);
    p.begin_device_login()
        .await
        .expect("simulated expired login");
    until(|| p.status().detail.as_deref() == Some("Twitch device code expired")).await;
}

#[tokio::test]
async fn status_names_a_missing_client_id() {
    let h = harness().await;
    let p = TwitchBridge::with_endpoints(
        TwitchConfig {
            client_id: String::new(),
            channel: "simulated-channel".into(),
            modules: vec![],
        },
        Endpoints::default(),
        h.store.clone(),
        h.purge.clone(),
        300,
    )
    .expect("simulated bridge");
    let (tx, _rx) = mpsc::channel(1);
    p.start(tx);
    assert_eq!(p.status().state, BridgeState::Disconnected);
    assert_eq!(
        p.status().detail.as_deref(),
        Some("no Twitch client_id configured")
    );
    assert_eq!(p.status().channel.as_deref(), Some("simulated-channel"));
    assert!(p.begin_device_login().await.is_err());
}

#[tokio::test]
async fn disconnect_deletes_the_credential_and_goes_disconnected() {
    let mut h = harness().await;
    let (p, mut ws, _rx) = h.connected().await;
    p.disconnect().await.expect("simulated disconnect");
    assert!(h.store.load().expect("simulated store").is_none());
    assert_eq!(p.status().state, BridgeState::Disconnected);
    assert_eq!(p.status().bot_login, None);
    let revoke = h.mock.calls_to("POST", "/oauth2/revoke");
    assert_eq!(revoke.len(), 1);
    assert!(get(&revoke[0].form(), "token") == Some(ACCESS));
    assert!(p.say("simulated hello").await.is_err());
    assert_eq!(h.purge.completed.load(Ordering::SeqCst), 1);
    use futures::StreamExt;
    let closed = tokio::time::timeout(Duration::from_secs(2), ws.next()).await;
    assert!(closed.is_ok(), "simulated socket survived shutdown");
}

#[tokio::test]
async fn concurrent_401s_refresh_as_a_single_flight() {
    let mut h = harness().await;
    let (p, _ws, _rx) = h.connected().await;
    h.mock.reject.store(true, Ordering::SeqCst);
    let callers = (0..24).map(|_| {
        let p = Arc::clone(&p);
        async move { p.say("simulated concurrent call").await }
    });
    for result in futures::future::join_all(callers).await {
        result.expect("simulated broker call");
    }
    assert_eq!(h.mock.refresh_count(), 1);
    let saved = h
        .store
        .load()
        .expect("simulated store")
        .expect("simulated grant");
    assert!(saved.access_token.expose() == ACCESS2);
    assert!(saved.refresh_token.expose() == REFRESH2);
}

#[tokio::test]
async fn proactive_refresh_runs_before_expiry_without_helix_calls() {
    let mut h = harness().await;
    h.store_login();
    let mut credential = h.store.load().expect("store").expect("grant");
    credential.expires_at = chrono::Utc::now().timestamp() + 4;
    h.store
        .save(&credential)
        .expect("simulated near-expiry grant");
    let p = h.platform();
    let (tx, _rx) = mpsc::channel(16);
    p.start(tx);
    let mut ws = h.accept().await;
    send(&mut ws, welcome("short")).await;
    until(|| p.status().state == BridgeState::Connected).await;
    let started = tokio::time::Instant::now();
    // Keep the socket healthy for longer than the refresh window.
    loop {
        if h.mock.refresh_count() == 1 {
            break;
        }
        send(
            &mut ws,
            envelope(
                "session_keepalive",
                "simulated-keepalive",
                serde_json::json!({}),
            ),
        )
        .await;
        tokio::time::sleep(Duration::from_millis(20)).await;
        assert!(started.elapsed() < Duration::from_secs(4));
    }
    assert!(chrono::Utc::now().timestamp_millis() < credential.expires_at * 1000);
}

#[test]
fn refresh_ahead_jitter_is_bounded_and_not_constant() {
    let early = crate::vault::refresh_delay(3600, 0);
    let late = crate::vault::refresh_delay(3600, 100);
    assert!(early < late && late < Duration::from_secs(3600));
    assert_eq!(early, Duration::from_secs(2880));
    assert_eq!(late, Duration::from_secs(3240));
}

#[tokio::test]
async fn a_transient_validate_outage_does_not_kill_the_bridge() {
    let mut h = harness().await;
    h.store_login();
    let p = h.configured_with(vec![], 300, Duration::from_millis(50), h.store.clone());
    let (tx, mut rx) = mpsc::channel(16);
    p.start(tx);
    let mut ws = h.accept().await;
    send(&mut ws, welcome("S1")).await;
    until(|| p.status().state == BridgeState::Connected).await;
    let before = h.mock.calls_to("GET", "/oauth2/validate").len();
    h.mock.validate_503.store(1, Ordering::SeqCst);
    // The failed validation and its retry both reach the server.
    until(|| h.mock.calls_to("GET", "/oauth2/validate").len() >= before + 3).await;
    assert_eq!(p.status().state, BridgeState::Connected);
    let event = chat_event(
        "42",
        "Viewer",
        "m1",
        "simulated after outage",
        serde_json::json!([]),
    );
    send(&mut ws, notification("simulated-after-outage", event)).await;
    assert_eq!(chat(&mut rx).await.text, "simulated after outage");
}

#[tokio::test]
async fn a_rate_limited_startup_user_lookup_still_connects() {
    let mut h = harness().await;
    h.store_login();
    h.mock.users_429.store(1, Ordering::SeqCst);
    let p = h.platform();
    let (tx, _rx) = mpsc::channel(16);
    p.start(tx);
    let mut ws = h.accept().await;
    send(&mut ws, welcome("S1")).await;
    until(|| p.status().state == BridgeState::Connected).await;
    assert!(h.mock.calls_to("GET", "/helix/users").len() >= 2);
}

#[tokio::test]
async fn device_poll_survives_a_plain_text_gateway_error() {
    let mut h = harness().await;
    h.mock.plain_poll_502.store(1, Ordering::SeqCst);
    let p = h.platform();
    let (tx, _rx) = mpsc::channel(16);
    p.start(tx);
    until(|| p.status().detail.is_some()).await;
    p.begin_device_login().await.expect("simulated login");
    let mut ws = h.accept().await;
    send(&mut ws, welcome("S1")).await;
    until(|| p.status().state == BridgeState::Connected).await;
    assert!(h.store.load().expect("store").is_some());
}

struct FailingSave;

impl CredentialStore for FailingSave {
    fn load(&self) -> Result<Option<Credential>, BridgeError> {
        Ok(None)
    }
    fn save(&self, _: &Credential) -> Result<(), BridgeError> {
        Err(BridgeError::Unavailable("simulated keychain write failed"))
    }
    fn delete(&self) -> Result<(), BridgeError> {
        Ok(())
    }
}

#[tokio::test]
async fn a_failed_persist_leaves_no_live_grant_in_memory() {
    let h = harness().await;
    let store = Arc::new(FailingSave);
    let p = h.configured_with(vec![], 300, Duration::from_secs(3600), store);
    let (tx, _rx) = mpsc::channel(16);
    p.start(tx);
    until(|| p.status().detail.is_some()).await;
    p.begin_device_login().await.expect("simulated login");
    until(|| p.status().state == BridgeState::Error).await;
    // A restart must not resurrect the un-persisted grant from memory.
    let (tx, _rx) = mpsc::channel(16);
    p.start(tx);
    until(|| p.status().state == BridgeState::Disconnected && p.status().detail.is_some()).await;
    assert!(h.mock.calls_to("GET", "/oauth2/validate").is_empty());
}
