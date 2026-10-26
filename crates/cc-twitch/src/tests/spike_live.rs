//! Owner-operated live twins. Ignored in CI; guard runs before keychain/network.
use super::{
    spike_checks as check,
    spike_session::{ACTIONS, Session},
};

#[tokio::test]
#[ignore = "live: CC_LIVE_TWITCH=1"]
async fn live_automod_hold_v2() {
    let mut s = Session::open().await;
    // Run once for each reason; neither a denied nor a held line is released here.
    for reason in ["automod", "blocked_term"] {
        let instruction = format!(
            "From the target test account send a simulated line that Twitch holds for {reason}; use the channel's existing AutoMod/blocked-term settings"
        );
        let n = s
            .observe(
                "automod.message.hold",
                true,
                |e| e["reason"] == reason,
                &instruction,
            )
            .await;
        check::hold(&n.event);
    }
}

#[tokio::test]
#[ignore = "live: CC_LIVE_TWITCH=1"]
async fn live_automod_update_v2() {
    let mut s = Session::open().await;
    for status in ["Approved", "Denied", "Expired"] {
        let instruction = format!(
            "Cause a new target-account AutoMod hold and resolve it in Twitch UI as {status} (for Expired, arrange a pending hold near expiry before starting); no payload will be recorded"
        );
        let n = s
            .observe(
                "automod.message.update",
                true,
                |e| e["status"] == status,
                &instruction,
            )
            .await;
        check::update(&n.event);
        eprintln!(
            "observed AutoMod status {status}; optional details validated only when supplied"
        );
    }
}

#[tokio::test]
#[ignore = "live: CC_LIVE_TWITCH=1"]
async fn live_suspicious_v1() {
    let mut s = Session::open().await;
    let n = s.observe("channel.suspicious_user.message", true, |_| true,
        "Have the target test account send a simulated line under its existing suspicious-user classification").await;
    check::suspicious(&n.event);
    eprintln!(
        "observed status={}, evaluation={}; only observed enum variants are live evidence",
        n.event["low_trust_status"], n.event["ban_evasion_evaluation"]
    );
}

#[tokio::test]
#[ignore = "live: CC_LIVE_TWITCH=1"]
async fn live_channel_moderate_v2() {
    let mut s = Session::open().await;
    let action = std::env::var("CC_LIVE_TWITCH_ACTION").expect(
        "live setup: CC_LIVE_TWITCH_ACTION must select one vocabulary entry; repeat per action",
    );
    assert!(
        ACTIONS.contains(&action.as_str()),
        "live setup: unknown action selection"
    );
    let target_only = matches!(
        action.as_str(),
        "ban"
            | "timeout"
            | "unban"
            | "untimeout"
            | "unraid"
            | "delete"
            | "vip"
            | "unvip"
            | "raid"
            | "mod"
            | "unmod"
            | "approve_unban_request"
            | "deny_unban_request"
            | "warn"
    );
    let instruction = format!(
        "Perform {action} in Twitch UI, using only the named test target for user actions; restore reversible changes in Twitch UI afterwards"
    );
    let n = s
        .observe(
            "channel.moderate",
            target_only,
            |e| e["action"] == action,
            &instruction,
        )
        .await;
    check::moderate(&n.event);
    eprintln!(
        "observed selected action {action}; unobserved vocabulary entries remain unverified live"
    );
}

#[tokio::test]
#[ignore = "live: CC_LIVE_TWITCH=1"]
async fn live_shield_timestamps() {
    let mut s = Session::open().await;
    let initial = s
        .read("/moderation/shield_mode")
        .await
        .expect("live Shield read");
    check::response("/moderation/shield_mode", &initial);
    let active = initial["data"][0]["is_active"]
        .as_bool()
        .expect("Shield bool");
    for desired in [!active, active] {
        let kind = if desired {
            "channel.shield_mode.begin"
        } else {
            "channel.shield_mode.end"
        };
        let instruction = if desired == active {
            "Restore Shield Mode to its initial state in Twitch UI"
        } else {
            "Toggle Shield Mode in Twitch UI"
        };
        let n = s.observe(kind, false, |_| true, instruction).await;
        check::shield(kind, &n.event);
        let state = s
            .read("/moderation/shield_mode")
            .await
            .expect("live Shield state read");
        check::response("/moderation/shield_mode", &state);
        assert_eq!(state["data"][0]["is_active"], desired);
    }
}

#[tokio::test]
#[ignore = "live: CC_LIVE_TWITCH=1"]
async fn live_chat_delay_restore() {
    let mut s = Session::open().await;
    let initial = s.read("/chat/settings").await.expect("live settings read");
    check::response("/chat/settings", &initial);
    let original = initial["data"][0].clone();
    let enabled = original["non_moderator_chat_delay"]
        .as_bool()
        .expect("delay bool");
    for restoring in [false, true] {
        let desired = if restoring { enabled } else { !enabled };
        let instruction = if restoring {
            format!(
                "Restore non-moderator chat delay to enabled={enabled}, duration={} in Twitch UI",
                original["non_moderator_chat_delay_duration"]
            )
        } else {
            format!(
                "Set non-moderator chat delay to enabled={desired} in Twitch UI (choose 2, 4 or 6 seconds when enabling)"
            )
        };
        let n = s
            .observe(
                "channel.chat_settings.update",
                false,
                |e| {
                    e["non_moderator_chat_delay"] == desired
                        && (!restoring
                            || !enabled
                            || e["non_moderator_chat_delay_duration"]
                                == original["non_moderator_chat_delay_duration"])
                },
                &instruction,
            )
            .await;
        check::delay(&n.event);
        let state = s
            .read("/chat/settings")
            .await
            .expect("live settings restore read");
        check::response("/chat/settings", &state);
        assert_eq!(state["data"][0]["non_moderator_chat_delay"], desired);
        if restoring && enabled {
            assert_eq!(
                state["data"][0]["non_moderator_chat_delay_duration"],
                original["non_moderator_chat_delay_duration"]
            );
        }
    }
}

#[tokio::test]
#[ignore = "live: CC_LIVE_TWITCH=1"]
async fn live_helix_success_shapes() {
    let s = Session::open().await;
    for path in ["/moderation/shield_mode", "/chat/settings"] {
        check::response(
            path,
            &s.read(path).await.expect("live read-only Helix response"),
        );
    }
    eprintln!(
        "mutation Helix success responses (warning, held resolve, Shield PUT, settings PATCH): deferred to integration; no mutations issued"
    );
}

#[tokio::test]
#[ignore = "live: CC_LIVE_TWITCH=1"]
async fn live_warning_reason_limit() {
    let mut s = Session::open().await;
    let n = s.observe("channel.moderate", true, |e| e["action"] == "warn",
        "Issue ONE warning to the target in Twitch UI using a 500-character simulated reason; do not probe caps or repeat warnings").await;
    check::moderate(&n.event);
    let reason = n.event["warn"]["reason"]
        .as_str()
        .expect("warning reason for this scenario");
    assert_eq!(
        reason.chars().count(),
        500,
        "observed warning reason length differs from the 500-character assumption"
    );
    eprintln!(
        "observed reason length=500; server rejection limit and Helix response deferred (UI may enforce its own limit)"
    );
}

#[tokio::test]
#[ignore = "live: CC_LIVE_TWITCH=1"]
async fn live_rate_headers_and_caps() {
    let mut s = Session::open().await;
    eprintln!(
        "OWNER: bounded 90-second observation session; do not generate load or repeat warnings/bans to seek a 429"
    );
    // Exactly one brokered read. No polling/retries to manufacture a cap.
    match s.read("/chat/settings").await {
        Ok(value) => check::response("/chat/settings", &value),
        Err(crate::BridgeError::RateLimited { retry_after_ms }) => {
            eprintln!("natural read-only 429: brokered retry_after_ms={retry_after_ms}");
            assert!(retry_after_ms > 0);
        }
        Err(_) => panic!("live read-only header observation failed"),
    }
    let rate = s.bridge.rate_limit().await;
    eprintln!(
        "brokered bucket: limit={:?}, remaining={:?}, reset_at_s={:?}",
        rate.limit, rate.remaining, rate.reset_at_s
    );
    // UI requests do not cross this broker. Never misattribute a read bucket to
    // unpublished action caps, or infer an exact cap from one 429.
    s.observation_window().await;
    eprintln!(
        "ban/unban/warn unpublished caps: unavailable; no natural action-endpoint 429 visible to this read-only observer. Retry-After raw header: unavailable unless broker reports a natural 429; reset vs retry precedence is fixture evidence"
    );
}

#[tokio::test]
#[ignore = "live: CC_LIVE_TWITCH=1"]
async fn live_scope_sufficiency() {
    let s = Session::open().await;
    eprintln!(
        "observed identity and all requested core/Gatehouse scopes accepted; EventSub subscriptions enabled={}",
        s.bridge
            .connections()
            .iter()
            .map(|connection| connection.subscriptions)
            .sum::<usize>()
    );
    // No claim that scope validation proves permission for every mutation.
}
