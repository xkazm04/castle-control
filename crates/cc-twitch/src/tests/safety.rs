// Adapted from Shadowrunr OS @ 7e4b6f8,
// crates/shadowrunr-daemon/src/platform/twitch/tests.rs.
//! Simulated revocation and actual captured-log scans.
use super::{fixtures::*, harness::*};
use crate::store::CredentialStore;
use crate::{BridgeError, BridgeState};
use serde_json::json;
use std::{
    io::Write,
    sync::{Arc, Mutex, atomic::Ordering},
    time::Duration,
};

#[tokio::test]
async fn tokens_never_reach_debug_or_errors() {
    let mut h = harness().await;
    let (p, _ws, _rx) = h.connected().await;
    assert_no_secret(&format!("{p:?} {:?}", p.status()));
    assert_no_secret(&format!("{:?}", h.store.load().expect("simulated store")));
    h.mock.echo_403.store(true, Ordering::SeqCst);
    let error = p.say("simulated hello").await.expect_err("simulated 403");
    assert_eq!(error, BridgeError::Upstream(403));
    assert_no_secret(&format!("{error:?} {error}"));
    h.mock.echo_403.store(false, Ordering::SeqCst);
    h.mock.reject.store(true, Ordering::SeqCst);
    h.mock.reject_refresh.store(true, Ordering::SeqCst);
    let error = p
        .ban("simulated-user", "simulated")
        .await
        .expect_err("simulated revoked login");
    assert_no_secret(&format!("{error:?} {error} {p:?}"));
    assert_eq!(error, BridgeError::Unauthorized);
    assert!(h.store.load().expect("simulated store").is_none());
    assert_eq!(h.purge.completed.load(Ordering::SeqCst), 1);
}

#[derive(Clone)]
struct Captured(Arc<Mutex<Vec<u8>>>);
impl Write for Captured {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        self.0
            .lock()
            .expect("captured logs")
            .extend_from_slice(bytes);
        Ok(bytes.len())
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

#[tokio::test(flavor = "current_thread")]
async fn log_grep_captured_output_contains_no_tokens() {
    let bytes = Arc::new(Mutex::new(Vec::new()));
    let captured = Captured(bytes.clone());
    let subscriber = tracing_subscriber::fmt()
        .without_time()
        .with_ansi(false)
        .with_max_level(tracing::Level::TRACE)
        .with_writer(move || captured.clone())
        .finish();
    tracing::subscriber::set_global_default(subscriber).expect("simulated global log capture");
    async {
        let mut h = harness().await;
        let (p, _ws, _rx) = h.connected().await;
        h.mock.reject.store(true, Ordering::SeqCst);
        p.say("simulated refresh")
            .await
            .expect("simulated refreshed call");
        h.mock.echo_403.store(true, Ordering::SeqCst);
        let error = p.say("simulated echo").await.expect_err("simulated 403");
        tracing::warn!(%error, ?p, "simulated upstream error");
        p.disconnect().await.expect("simulated retirement");
    }
    .await;
    let logs = String::from_utf8(bytes.lock().expect("logs").clone()).expect("UTF8 logs");
    assert!(logs.contains("credential refreshed"));
    assert!(logs.contains("purge_all requested"));
    assert!(logs.contains("simulated upstream error"));
    assert_no_secret(&logs);
}

#[tokio::test]
async fn revoked_authorization_completes_purge_before_stopping_workers() {
    let mut h = harness().await;
    let (p, mut ws, _rx) = h.connected().await;
    send(
        &mut ws,
        envelope(
            "revocation",
            "simulated-revoke",
            json!({
                "subscription": {"status": "authorization_revoked"}
            }),
        ),
    )
    .await;
    until(|| p.status().state == BridgeState::Error).await;
    assert!(
        p.connections()
            .iter()
            .all(|connection| connection.state == BridgeState::Error)
    );
    // Purge yields: a watch notification must never cancel its disk operation halfway.
    assert_eq!(h.purge.started.load(Ordering::SeqCst), 1);
    assert_eq!(h.purge.completed.load(Ordering::SeqCst), 1);
    assert!(h.store.load().expect("store").is_none());
    assert!(p.say("simulated after revoke").await.is_err());
    tokio::time::sleep(Duration::from_millis(50)).await;
    p.disconnect().await.expect("idempotent simulated revoke");
    assert_eq!(h.purge.completed.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn reconnect_destinations_and_malformed_envelopes_are_rejected() {
    let h = harness().await;
    let p = h.platform();
    assert!(p.check_ws_url("wss://untrusted.invalid/ws").is_err());
    assert!(p.check_ws_url("ws://user:password@127.0.0.1/ws").is_err());
    assert!(crate::wire::parse_frame("{}").is_err());
    let mut invalid = notification("simulated", json!({}));
    invalid["metadata"]["message_timestamp"] = json!("invalid time");
    assert!(crate::wire::parse_frame(&invalid.to_string()).is_err());
    let wire = serde_json::to_value(crate::BridgeStatus::default()).expect("status wire");
    assert!(
        !wire
            .as_object()
            .expect("status")
            .values()
            .any(serde_json::Value::is_null)
    );
}
