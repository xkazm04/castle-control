// Adapted from Shadowrunr OS @ 7e4b6f8,
// crates/shadowrunr-daemon/src/platform/twitch/mod.rs.
//! Local-first Twitch bridge. Credentials stay inside the private request broker.
mod actions;
mod eventsub;
#[cfg(any(test, feature = "fault-injection"))]
mod fault;
mod handover;
pub mod scopes;
mod store;
#[cfg(test)]
mod tests;
mod types;
mod vault;
mod wire;

use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

use tokio::sync::mpsc;
use tokio::task::JoinHandle;

use scopes::{Topic, module_plan, pack};
use store::{CredentialStore, KeyringStore};
pub use types::{
    BridgeError, BridgeEvent, BridgeState, BridgeStatus, ChatMessage, ConnectionGap, DeviceLogin,
    Notification, RevocationHandler, TwitchConfig, Viewer,
};
use types::{Endpoints, now};
pub use vault::RateLimit;
use vault::Vault;

#[derive(Debug, Clone)]
pub struct ConnectionStatus {
    pub index: usize,
    pub state: BridgeState,
    pub subscriptions: usize,
}

#[derive(Default)]
struct Live {
    status: BridgeStatus,
    user_id: Option<String>,
    broadcaster_id: Option<String>,
    connections: Vec<ConnectionStatus>,
}

/// Fault injection is absent from the default public API.
#[cfg_attr(
    not(feature = "fault-injection"),
    doc = r#"
```compile_fail,E0599
use cc_twitch::TwitchBridge;
fn default_build(bridge: &TwitchBridge) {
    bridge.force_socket_drop();
}
```
"#
)]
#[cfg_attr(
    feature = "fault-injection",
    doc = r#"
```no_run
use cc_twitch::TwitchBridge;
fn spike_build(bridge: &TwitchBridge) {
    bridge.force_socket_drop();
}
```
"#
)]
pub struct TwitchBridge {
    cfg: TwitchConfig,
    ep: Endpoints,
    vault: Arc<Vault>,
    groups: Vec<Vec<Topic>>,
    live: Mutex<Live>,
    inbox: Mutex<Option<mpsc::Sender<BridgeEvent>>>,
    seen: Mutex<VecDeque<String>>,
    session: Mutex<Option<JoinHandle<()>>>,
    login: Mutex<Option<JoinHandle<()>>>,
    #[cfg(any(test, feature = "fault-injection"))]
    socket_drop: tokio::sync::watch::Sender<()>,
}

impl std::fmt::Debug for TwitchBridge {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("TwitchBridge")
            .field("status", &self.status())
            .finish_non_exhaustive()
    }
}

impl TwitchBridge {
    pub fn new(
        cfg: TwitchConfig,
        handler: Arc<dyn RevocationHandler>,
    ) -> Result<Arc<Self>, BridgeError> {
        Self::with_endpoints(
            cfg,
            Endpoints::default(),
            Arc::new(KeyringStore),
            handler,
            300,
        )
    }

    fn with_endpoints(
        cfg: TwitchConfig,
        ep: Endpoints,
        store: Arc<dyn CredentialStore>,
        handler: Arc<dyn RevocationHandler>,
        capacity: usize,
    ) -> Result<Arc<Self>, BridgeError> {
        let (scopes, topics) = module_plan(&cfg.modules)?;
        let groups = pack(&topics, capacity)?;
        let vault = Vault::new(cfg.client_id.clone(), scopes, ep.clone(), store, handler)?;
        Ok(Arc::new(Self {
            cfg,
            ep,
            vault,
            groups,
            live: Mutex::new(Live::default()),
            inbox: Mutex::new(None),
            seen: Mutex::new(VecDeque::new()),
            session: Mutex::new(None),
            login: Mutex::new(None),
            #[cfg(any(test, feature = "fault-injection"))]
            socket_drop: tokio::sync::watch::channel(()).0,
        }))
    }

    pub fn status(&self) -> BridgeStatus {
        let mut status = self.live.lock().expect("bridge state").status.clone();
        status.channel = (!self.cfg.channel.is_empty()).then(|| self.cfg.channel.clone());
        if self.cfg.client_id.is_empty() {
            status.state = BridgeState::Disconnected;
            status.detail = Some("no Twitch client_id configured".into());
        }
        status
    }

    pub fn connections(&self) -> Vec<ConnectionStatus> {
        self.live.lock().expect("bridge state").connections.clone()
    }

    pub async fn rate_limit(&self) -> RateLimit {
        self.vault.rate_limit().await
    }

    /// Retain the Arc and call disconnect on shutdown. No network until start/login.
    pub fn start(self: &Arc<Self>, inbox: mpsc::Sender<BridgeEvent>) {
        *self.inbox.lock().expect("bridge inbox") = Some(inbox);
        if !self.cfg.client_id.is_empty() {
            self.spawn_session();
        }
    }

    pub async fn begin_device_login(self: &Arc<Self>) -> Result<DeviceLogin, BridgeError> {
        if self.cfg.client_id.is_empty() {
            return Err(BridgeError::Invalid("no Twitch client_id configured"));
        }
        let device = self.vault.request_device().await?;
        self.abort_tasks();
        let display = device.display();
        self.set_live(
            BridgeState::Connecting,
            Some("waiting for Twitch device code".into()),
        );
        let me = self.clone();
        let handle = tokio::spawn(async move {
            match me.vault.poll_device(device).await {
                Ok(()) => me.spawn_session(),
                Err(error) => me.set_live(BridgeState::Error, Some(error.to_string())),
            }
        });
        *self.login.lock().expect("login task") = Some(handle);
        Ok(display)
    }

    /// Revoke upstream, delete the local credential and request purge_all.
    pub async fn disconnect(&self) -> Result<(), BridgeError> {
        self.abort_tasks();
        let result = self.vault.retire(true).await;
        *self.live.lock().expect("bridge state") = Live::default();
        if let Err(error) = &result {
            self.set_live(BridgeState::Error, Some(error.to_string()));
        }
        result
    }

    fn abort_tasks(&self) {
        for slot in [&self.login, &self.session] {
            if let Some(task) = slot.lock().expect("bridge task").take() {
                task.abort();
            }
        }
    }

    fn spawn_session(self: &Arc<Self>) {
        let me = self.clone();
        let handle = tokio::spawn(async move {
            if let Err(error) = me.run().await {
                tracing::warn!(%error, "Twitch bridge stopped");
                me.set_live(BridgeState::Error, Some(error.to_string()));
            }
        });
        if let Some(old) = self.session.lock().expect("session task").replace(handle) {
            old.abort();
        }
    }

    fn set_live(&self, state: BridgeState, detail: Option<String>) {
        let mut live = self.live.lock().expect("bridge state");
        live.status.state = state;
        live.status.detail = detail;
        if matches!(state, BridgeState::Error | BridgeState::Disconnected) {
            for connection in &mut live.connections {
                connection.state = state;
            }
        } else if state == BridgeState::Connecting {
            for connection in &mut live.connections {
                connection.state = BridgeState::Connecting;
            }
        }
    }

    fn connection_state(&self, index: usize, state: BridgeState) {
        let mut live = self.live.lock().expect("bridge state");
        live.connections[index].state = state;
        live.status.state = if live
            .connections
            .iter()
            .all(|c| c.state == BridgeState::Connected)
        {
            BridgeState::Connected
        } else {
            BridgeState::Connecting
        };
        live.status.detail = None;
    }

    async fn emit(&self, event: BridgeEvent) -> Result<(), BridgeError> {
        let tx = self
            .inbox
            .lock()
            .expect("bridge inbox")
            .clone()
            .ok_or(BridgeError::Unavailable("bridge event consumer missing"))?;
        let permit = tx
            .reserve()
            .await
            .map_err(|_| BridgeError::Unavailable("bridge event consumer closed"))?;
        // Serialize gap recording with delivery, even when several workers recover.
        let mut live = self.live.lock().expect("bridge state");
        if let BridgeEvent::Gap { from, to } = &event {
            live.status.last_gap = Some(ConnectionGap {
                from: from.clone(),
                to: to.clone(),
            });
        }
        permit.send(event);
        Ok(())
    }

    async fn prepare(&self) -> Result<bool, BridgeError> {
        if !self.vault.load().await? {
            self.set_live(
                BridgeState::Disconnected,
                Some("not logged in; reconnect Twitch".into()),
            );
            return Ok(false);
        }
        if self.cfg.channel.trim().is_empty() {
            return Err(BridgeError::Invalid("no Twitch channel configured"));
        }
        self.set_live(BridgeState::Connecting, None);
        let (login, user_id) = self.vault.validate().await?;
        let channel = self.cfg.channel.trim().to_ascii_lowercase();
        let broadcaster_id = self
            .user_id(&channel)
            .await?
            .ok_or(BridgeError::Invalid("Twitch channel not found"))?;
        let mut live = self.live.lock().expect("bridge state");
        live.status.bot_login = Some(login);
        live.user_id = Some(user_id);
        live.broadcaster_id = Some(broadcaster_id);
        live.connections = self
            .groups
            .iter()
            .enumerate()
            .map(|(index, group)| ConnectionStatus {
                index,
                subscriptions: group.len(),
                state: BridgeState::Connecting,
            })
            .collect();
        Ok(true)
    }

    async fn run(self: &Arc<Self>) -> Result<(), BridgeError> {
        let mut backoff = 1;
        loop {
            match self.prepare().await {
                Ok(false) => return Ok(()),
                Ok(true) => break,
                Err(error @ (BridgeError::Unavailable(_) | BridgeError::Upstream(_))) => {
                    tracing::warn!(%error, "Twitch preparation retry");
                    tokio::time::sleep(self.ep.time_unit * backoff).await;
                    backoff = (backoff * 2).min(60);
                }
                Err(error) => return Err(error),
            }
        }
        let mut workers = futures::stream::FuturesUnordered::new();
        for (index, group) in self.groups.iter().enumerate() {
            workers.push(self.worker(index, group));
        }
        use futures::StreamExt;
        // Futures own sockets directly: dropping run cancels every connection and maintenance.
        tokio::select! {
            result = workers.next() => result.unwrap_or(Ok(())),
            result = self.vault.maintain() => result,
        }
    }

    async fn notification(
        &self,
        id: String,
        at: String,
        kind: String,
        event: serde_json::Value,
    ) -> Result<(), BridgeError> {
        {
            let mut seen = self.seen.lock().expect("notification ids");
            if seen.contains(&id) {
                return Ok(());
            }
            seen.push_back(id.clone());
            if seen.len() > 512 {
                seen.pop_front();
            }
        }
        let user_id = self
            .live
            .lock()
            .expect("bridge state")
            .user_id
            .clone()
            .unwrap_or_default();
        let chat = if kind == "channel.chat.message" {
            let Some(chat) = wire::map_chat(&event, &user_id, &at) else {
                return Ok(());
            };
            Some(chat)
        } else {
            None
        };
        self.emit(BridgeEvent::Notification(Notification {
            id,
            at,
            subscription_type: kind,
            event,
            chat,
        }))
        .await
    }
}
