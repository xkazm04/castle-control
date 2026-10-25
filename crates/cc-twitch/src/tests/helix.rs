// Adapted from Shadowrunr OS @ 7e4b6f8,
// crates/shadowrunr-daemon/src/platform/twitch/tests.rs.
//! Simulated Helix action and bucket tests.
use super::{
    fixtures::*,
    harness::*,
    mock::{Call, get},
};
use crate::BridgeError;
use crate::store::CredentialStore;
use serde_json::json;
use std::sync::atomic::Ordering;

#[tokio::test]
async fn actions_hit_the_right_method_path_query_and_body() {
    let mut h = harness().await;
    let (p, _ws, _rx) = h.connected().await;
    p.delete("simulated-message").await.expect("delete");
    p.timeout("simulated-u2", 600, "simulated spam")
        .await
        .expect("timeout");
    p.ban("simulated-u3", "simulated reason")
        .await
        .expect("ban");
    p.unban("simulated-u3").await.expect("unban");
    p.say(&"é".repeat(600)).await.expect("say");
    let base = |c: &Call| {
        assert!(c.auth == format!("Bearer {ACCESS}"));
        assert_eq!(get(&c.query, "broadcaster_id"), Some(BROADCASTER_ID));
        assert_eq!(get(&c.query, "moderator_id"), Some(BOT_ID));
    };
    let delete = h.mock.calls_to("DELETE", "/helix/moderation/chat");
    assert_eq!(delete.len(), 1);
    base(&delete[0]);
    assert_eq!(
        get(&delete[0].query, "message_id"),
        Some("simulated-message")
    );
    let bans = h.mock.calls_to("POST", "/helix/moderation/bans");
    assert_eq!(bans.len(), 2);
    base(&bans[0]);
    base(&bans[1]);
    assert_eq!(
        bans[0].json(),
        json!({"data": {"user_id": "simulated-u2", "duration": 600, "reason": "simulated spam"}})
    );
    assert_eq!(
        bans[1].json(),
        json!({"data": {"user_id": "simulated-u3", "reason": "simulated reason"}})
    );
    let unbans = h.mock.calls_to("DELETE", "/helix/moderation/bans");
    base(&unbans[0]);
    assert_eq!(get(&unbans[0].query, "user_id"), Some("simulated-u3"));
    let say = h.mock.calls_to("POST", "/helix/chat/messages");
    assert_eq!(
        say[0].json()["message"]
            .as_str()
            .expect("message")
            .chars()
            .count(),
        500
    );
    assert!(p.delete("").await.is_err());
    assert!(p.ban(" ", "simulated").await.is_err());
    assert!(p.unban("").await.is_err());
    assert!(p.say(" ").await.is_err());
    assert_eq!(h.mock.calls_to("DELETE", "/helix/moderation/chat").len(), 1);
    p.timeout("simulated-u4", 0, &"é".repeat(501))
        .await
        .expect("clamped timeout");
    let bans = h.mock.calls_to("POST", "/helix/moderation/bans");
    assert_eq!(bans[2].json()["data"]["duration"], 1);
    assert_eq!(
        bans[2].json()["data"]["reason"]
            .as_str()
            .expect("reason")
            .chars()
            .count(),
        500
    );
}

#[tokio::test]
async fn a_401_refreshes_once_then_retries() {
    let mut h = harness().await;
    let (p, _ws, _rx) = h.connected().await;
    h.mock.reject.store(true, Ordering::SeqCst);
    p.ban("simulated-u9", "simulated reason")
        .await
        .expect("refreshed ban");
    let bans = h.mock.calls_to("POST", "/helix/moderation/bans");
    assert_eq!(bans.len(), 2);
    assert!(bans[0].auth == format!("Bearer {ACCESS}"));
    assert!(bans[1].auth == format!("Bearer {ACCESS2}"));
    assert_eq!(h.mock.refresh_count(), 1);
    let saved = h.store.load().expect("store").expect("grant");
    assert!(saved.access_token.expose() == ACCESS2);
}

#[tokio::test]
async fn a_429_fails_fast_until_the_reset() {
    let mut h = harness().await;
    let (p, _ws, _rx) = h.connected().await;
    let bucket = p.rate_limit().await;
    assert_eq!(bucket.limit, Some(800));
    assert_eq!(bucket.remaining, Some(799));
    h.mock.rate_limit.store(true, Ordering::SeqCst);
    assert!(
        matches!(p.delete("simulated-m1").await, Err(BridgeError::RateLimited { retry_after_ms }) if retry_after_ms > 0)
    );
    let before = h.mock.calls.lock().expect("simulated calls").len();
    assert!(matches!(
        p.say("simulated hello").await,
        Err(BridgeError::RateLimited { .. })
    ));
    assert_eq!(h.mock.calls.lock().expect("simulated calls").len(), before);
    assert!(p.rate_limit().await.reset_at_s.is_some());
}

#[tokio::test]
async fn dropped_and_malformed_chat_responses_fail_closed() {
    let mut h = harness().await;
    let (p, _ws, _rx) = h.connected().await;
    h.mock.drop_chat.store(true, Ordering::SeqCst);
    assert!(p.say("simulated dropped").await.is_err());
    h.mock.malformed_chat.store(true, Ordering::SeqCst);
    assert!(p.say("simulated malformed").await.is_err());
}

#[test]
fn truncation_keeps_char_boundaries() {
    assert_eq!(crate::types::truncate_chars("héllo", 2), "hé");
    assert_eq!(crate::types::truncate_chars("hi", 500), "hi");
}
