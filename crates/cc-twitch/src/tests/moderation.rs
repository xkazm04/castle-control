//! Only the existing loopback fake is used, never Twitch or the OS keychain.
use super::{fixtures::*, harness::*, mock::get};
use crate::{BridgeError, ChatDelay, HeldMessageAction, TwitchBridge};
use serde_json::json;
use std::sync::atomic::Ordering;

async fn call(p: &TwitchBridge, index: usize) -> Result<(), BridgeError> {
    match index {
        0 => p.warn("222", "simulated reason").await,
        1 => {
            p.resolve_held_message("simulated-message", HeldMessageAction::Allow)
                .await
        }
        2 => {
            p.resolve_held_message("simulated-message", HeldMessageAction::Deny)
                .await
        }
        3 => p.set_shield_mode(true).await,
        4 => p.set_shield_mode(false).await,
        5 => p.set_chat_delay(ChatDelay::Disabled).await,
        6 => p.set_chat_delay(ChatDelay::TwoSeconds).await,
        7 => p.set_chat_delay(ChatDelay::FourSeconds).await,
        8 => p.set_chat_delay(ChatDelay::SixSeconds).await,
        9 => p.ban("222", "simulated reason").await,
        _ => p.unban("222").await,
    }
}

fn endpoint(index: usize) -> (&'static str, &'static str) {
    match index {
        0 => ("POST", "/helix/moderation/warnings"),
        1 | 2 => ("POST", "/helix/moderation/automod/message"),
        3 | 4 => ("PUT", "/helix/moderation/shield_mode"),
        5..=8 => ("PATCH", "/helix/chat/settings"),
        9 => ("POST", "/helix/moderation/bans"),
        _ => ("DELETE", "/helix/moderation/bans"),
    }
}

#[tokio::test]
async fn moderation_request_fixtures_match_successful_helix_calls() {
    let bodies = [
        json!({"data": {"user_id": "222", "reason": "simulated reason"}}),
        json!({"user_id": BOT_ID, "msg_id": "simulated-message", "action": "allow"}),
        json!({"user_id": BOT_ID, "msg_id": "simulated-message", "action": "deny"}),
        json!({"is_active": true}),
        json!({"is_active": false}),
        json!({"non_moderator_chat_delay": false}),
        json!({"non_moderator_chat_delay": true, "non_moderator_chat_delay_duration": 2}),
        json!({"non_moderator_chat_delay": true, "non_moderator_chat_delay_duration": 4}),
        json!({"non_moderator_chat_delay": true, "non_moderator_chat_delay_duration": 6}),
    ];
    let mut h = harness().await;
    let (p, _ws, _rx) = h.connected().await;
    for (index, expected) in bodies.into_iter().enumerate() {
        call(&p, index).await.expect("simulated moderation success");
        let (method, path) = endpoint(index);
        let calls = h.mock.calls_to(method, path);
        let sent = calls.last().expect("simulated request");
        assert!(sent.auth == format!("Bearer {ACCESS}"));
        assert_eq!(sent.json(), expected);
        if matches!(index, 1 | 2) {
            assert!(sent.query.is_empty());
        } else {
            assert_eq!(get(&sent.query, "broadcaster_id"), Some(BROADCASTER_ID));
            assert_eq!(get(&sent.query, "moderator_id"), Some(BOT_ID));
        }
    }
    assert!(p.warn("", "simulated").await.is_err());
    assert!(p.warn("222", " ").await.is_err());
    assert!(
        p.resolve_held_message(" ", HeldMessageAction::Deny)
            .await
            .is_err()
    );
}

#[tokio::test]
async fn every_action_returns_reset_based_429_without_retrying() {
    for index in 0..11 {
        let mut h = harness().await;
        let (p, _ws, _rx) = h.connected().await;
        h.mock.rate_limit.store(true, Ordering::SeqCst);
        let before = chrono::Utc::now().timestamp_millis();
        let error = call(&p, index).await.expect_err("simulated 429");
        let after = chrono::Utc::now().timestamp_millis();
        let reset = p.rate_limit().await.reset_at_s.expect("reset header") * 1000;
        let BridgeError::RateLimited { retry_after_ms } = error else {
            panic!("rate error")
        };
        assert!((reset - after..=reset - before).contains(&(retry_after_ms as i64)));
        let (method, path) = endpoint(index);
        assert_eq!(h.mock.calls_to(method, path).len(), 1);
        assert!(matches!(
            call(&p, index).await,
            Err(BridgeError::RateLimited { .. })
        ));
        assert_eq!(h.mock.calls_to(method, path).len(), 1);
    }
}

#[tokio::test]
async fn exhausted_success_bucket_blocks_ban_unban_warn_before_transport() {
    for index in [0, 9, 10] {
        let mut h = harness().await;
        let (p, _ws, _rx) = h.connected().await;
        h.mock.exhaust_bucket.store(true, Ordering::SeqCst);
        p.set_shield_mode(false)
            .await
            .expect("last bucket request succeeds");
        let count = h.mock.calls.lock().expect("calls").len();
        assert!(matches!(call(&p, index).await,
            Err(BridgeError::RateLimited { retry_after_ms }) if retry_after_ms > 0));
        assert_eq!(h.mock.calls.lock().expect("calls").len(), count);
    }
}

#[tokio::test]
async fn rate_limit_reset_is_authoritative_and_missing_reset_does_not_reuse_old_bucket() {
    let mut h = harness().await;
    let (p, _ws, _rx) = h.connected().await;
    h.mock
        .reset_at_s
        .store(chrono::Utc::now().timestamp() + 300, Ordering::SeqCst);
    p.warn("222", "simulated seed bucket")
        .await
        .expect("seed old reset");
    h.mock.omit_reset.store(true, Ordering::SeqCst);
    h.mock.rate_limit.store(true, Ordering::SeqCst);
    assert!(matches!(p.warn("222", "simulated 429").await,
        Err(BridgeError::RateLimited { retry_after_ms }) if (1..=1000).contains(&retry_after_ms)));

    let mut h = harness().await;
    let (p, _ws, _rx) = h.connected().await;
    // A reset at the current second is already elapsed: return the 1ms error
    // floor, not the unrelated one-second fallback used for missing headers.
    h.mock
        .reset_at_s
        .store(chrono::Utc::now().timestamp(), Ordering::SeqCst);
    h.mock.rate_limit.store(true, Ordering::SeqCst);
    assert_eq!(
        p.warn("222", "simulated elapsed reset").await,
        Err(BridgeError::RateLimited { retry_after_ms: 1 })
    );
}
