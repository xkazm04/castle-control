//! Opt-in observation harness. Never prints payloads, stores chat, or mutates Twitch.
use crate::{
    BridgeError, BridgeEvent, BridgeState, Notification, RevocationHandler, TwitchBridge,
    TwitchConfig,
};
use reqwest::Method;
use serde_json::Value;
use std::{sync::Arc, time::Duration};
use tokio::sync::mpsc;

pub(super) const WAIT: Duration = Duration::from_secs(90);
pub(super) const ACTIONS: &[&str] = &[
    "ban",
    "timeout",
    "unban",
    "untimeout",
    "clear",
    "emoteonly",
    "emoteonlyoff",
    "followers",
    "followersoff",
    "uniquechat",
    "uniquechatoff",
    "slow",
    "slowoff",
    "subscribers",
    "subscribersoff",
    "unraid",
    "delete",
    "vip",
    "unvip",
    "raid",
    "mod",
    "unmod",
    "add_blocked_term",
    "add_permitted_term",
    "remove_blocked_term",
    "remove_permitted_term",
    "approve_unban_request",
    "deny_unban_request",
    "warn",
];

pub(super) fn guard(flag: Option<&str>) {
    assert!(
        flag == Some("1"),
        "live guard: CC_LIVE_TWITCH must be exactly 1; no keychain or network access attempted"
    );
}

pub(super) fn ownership(authenticated: &str, broadcaster: &str, target: &str) {
    assert!(
        !authenticated.is_empty() && authenticated == broadcaster,
        "live refusal: authenticated broadcaster must equal CC_LIVE_TWITCH_CHANNEL"
    );
    assert!(
        !target.is_empty() && target != broadcaster,
        "live refusal: target must be a distinct owner-controlled test account"
    );
}

fn required(name: &str) -> String {
    let value = std::env::var(name).unwrap_or_else(|_| panic!("live setup: {name} is required"));
    assert!(
        !value.trim().is_empty(),
        "live setup: {name} must not be blank"
    );
    value
}

struct NoLivePurge;
#[async_trait::async_trait]
impl RevocationHandler for NoLivePurge {
    async fn purge_all(&self) -> Result<(), BridgeError> {
        // This test does not own the application's data. Never report a fake purge.
        Err(BridgeError::Unavailable(
            "live observation cannot purge application data; reconnect through the app",
        ))
    }
}

pub(super) struct Session {
    pub bridge: Arc<TwitchBridge>,
    pub channel: String,
    pub target: String,
    pub broadcaster: String,
    pub target_id: String,
    rx: mpsc::Receiver<BridgeEvent>,
}

impl Drop for Session {
    fn drop(&mut self) {
        // disconnect() would revoke credentials: stop sockets only.
        self.bridge.abort_tasks();
    }
}

impl Session {
    pub async fn open() -> Self {
        guard(std::env::var("CC_LIVE_TWITCH").ok().as_deref());
        let channel = required("CC_LIVE_TWITCH_CHANNEL");
        let target = required("CC_LIVE_TWITCH_TARGET");
        for login in [&channel, &target] {
            assert!(
                login
                    .bytes()
                    .all(|c| c.is_ascii_alphanumeric() || c == b'_'),
                "live setup: channel and target must be Twitch logins"
            );
        }
        // Client ID is public app configuration, never an OAuth token.
        let bridge = TwitchBridge::new(
            TwitchConfig {
                client_id: required("CC_LIVE_TWITCH_CLIENT_ID"),
                channel: channel.clone(),
                modules: vec!["gatehouse".into()],
            },
            Arc::new(NoLivePurge),
        )
        .expect("live bridge configuration");
        assert!(
            bridge.vault.load().await.expect("live keychain load"),
            "live setup: sign in through the app first (castlecontrol-twitch / streamer)"
        );
        let (_, authenticated) = bridge
            .vault
            .validate()
            .await
            .expect("live identity/scope validation");
        let broadcaster = bridge
            .user_id(&channel)
            .await
            .expect("live channel lookup")
            .expect("channel exists");
        let target_id = bridge
            .user_id(&target)
            .await
            .expect("live target lookup")
            .expect("target exists");
        ownership(&authenticated, &broadcaster, &target_id);
        let (tx, rx) = mpsc::channel(128);
        let session = Self {
            bridge,
            channel,
            target,
            broadcaster,
            target_id,
            rx,
        };
        session.bridge.start(tx);
        tokio::time::timeout(Duration::from_secs(45), async {
            loop {
                match session.bridge.status().state {
                    BridgeState::Connected => break,
                    BridgeState::Error => {
                        panic!("live EventSub connection failed; verify scopes and app login")
                    }
                    _ => tokio::time::sleep(Duration::from_millis(100)).await,
                }
            }
        })
        .await
        .expect("live EventSub setup exceeded 45 seconds");
        session
    }

    pub async fn observe(
        &mut self,
        kind: &str,
        target_only: bool,
        matches: impl Fn(&Value) -> bool,
        instruction: &str,
    ) -> Notification {
        // A queued event from before the instruction is not evidence of the
        // requested owner operation (particularly when verifying restoration).
        while self.rx.try_recv().is_ok() {}
        eprintln!(
            "OWNER: {instruction} (channel {}, target {}; 90 s).",
            self.channel, self.target
        );
        tokio::time::timeout(WAIT, async {
            loop {
                let item = self.rx.recv().await.expect("live observer closed");
                if let BridgeEvent::Notification(n) = item {
                    if n.subscription_type != kind
                        || n.event["broadcaster_user_id"] != self.broadcaster
                    {
                        continue;
                    }
                    let target_matches = n.event["user_id"] == self.target_id
                        || n.event.as_object().is_some_and(|fields| {
                            fields
                                .values()
                                .any(|v| v.is_object() && v["user_id"] == self.target_id)
                        });
                    if (!target_only || target_matches) && matches(&n.event) {
                        return n;
                    }
                }
            }
        })
        .await
        .expect("live observation timed out after 90 seconds; assumption NOT verified")
    }

    pub async fn read(&self, path: &str) -> Result<Value, BridgeError> {
        self.bridge
            .vault
            .call(
                Method::GET,
                path,
                &[
                    ("broadcaster_id", &self.broadcaster),
                    ("moderator_id", &self.broadcaster),
                ],
                None,
            )
            .await
    }

    pub async fn observation_window(&mut self) {
        // Absence of owner activity is not a measured cap or a failure.
        let _ = tokio::time::timeout(WAIT, async { while self.rx.recv().await.is_some() {} }).await;
    }
}

#[test]
fn fixture_live_guard_and_ownership() {
    for flag in [
        None,
        Some(""),
        Some("0"),
        Some("true"),
        Some(" 1"),
        Some("1 "),
    ] {
        assert!(std::panic::catch_unwind(|| guard(flag)).is_err());
    }
    guard(Some("1")); // Pure argument only; never sets the process environment.
    ownership("111", "111", "222");
    assert!(std::panic::catch_unwind(|| ownership("999", "111", "222")).is_err());
    assert!(std::panic::catch_unwind(|| ownership("111", "111", "111")).is_err());
}
