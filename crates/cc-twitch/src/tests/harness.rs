// Adapted from Shadowrunr OS @ 7e4b6f8,
// crates/shadowrunr-daemon/src/platform/twitch/tests.rs.
//! Simulated loopback servers and private in-memory credentials; no real keychain.
use super::{
    fixtures::*,
    mock::{Mock, handle},
};
use crate::store::{Credential, CredentialStore, MemoryStore, Secret};
use crate::types::Endpoints;
use crate::{
    BridgeError, BridgeEvent, BridgeState, ChatMessage, RevocationHandler, TwitchBridge,
    TwitchConfig,
};
use axum::Router;
use std::{
    sync::{
        Arc,
        atomic::{AtomicU32, Ordering},
    },
    time::Duration,
};
use tokio::{net::TcpListener, sync::mpsc, task::JoinHandle};

#[derive(Default)]
pub(super) struct Purge {
    pub started: AtomicU32,
    pub completed: AtomicU32,
}

#[async_trait::async_trait]
impl RevocationHandler for Purge {
    async fn purge_all(&self) -> Result<(), BridgeError> {
        self.started.fetch_add(1, Ordering::SeqCst);
        // A real purge yields on disk I/O: notification must not cancel this future.
        tokio::time::sleep(Duration::from_millis(20)).await;
        self.completed.fetch_add(1, Ordering::SeqCst);
        Ok(())
    }
}

pub(super) struct Harness {
    pub mock: Arc<Mock>,
    pub http: String,
    pub ws_url: String,
    conns: mpsc::Receiver<Conn>,
    pub store: Arc<MemoryStore>,
    pub purge: Arc<Purge>,
    tasks: Vec<JoinHandle<()>>,
    bridges: std::sync::Mutex<Vec<Arc<TwitchBridge>>>,
}

impl Drop for Harness {
    fn drop(&mut self) {
        for bridge in self.bridges.lock().expect("simulated bridges").iter() {
            bridge.abort_tasks();
        }
        for task in &self.tasks {
            task.abort();
        }
    }
}

pub(super) async fn harness() -> Harness {
    let mock = Arc::new(Mock::default());
    let app = Router::new().fallback(handle).with_state(mock.clone());
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("simulated HTTP bind");
    let http = format!("http://{}", listener.local_addr().expect("HTTP address"));
    let http_task = tokio::spawn(async move {
        axum::serve(listener, app)
            .await
            .expect("simulated HTTP server");
    });
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("simulated WS bind");
    let ws_url = format!("ws://{}/ws", listener.local_addr().expect("WS address"));
    let (tx, conns) = mpsc::channel(8);
    let ws_task = tokio::spawn(async move {
        while let Ok((socket, _)) = listener.accept().await {
            if let Ok(ws) = tokio_tungstenite::accept_async(socket).await
                && tx.send(ws).await.is_err()
            {
                return;
            }
        }
    });
    Harness {
        mock,
        http,
        ws_url,
        conns,
        store: Arc::new(MemoryStore::default()),
        purge: Arc::new(Purge::default()),
        tasks: vec![http_task, ws_task],
        bridges: Default::default(),
    }
}

impl Harness {
    pub fn platform(&self) -> Arc<TwitchBridge> {
        self.configured(vec![], 300)
    }

    pub fn configured(&self, modules: Vec<String>, capacity: usize) -> Arc<TwitchBridge> {
        let bridge = TwitchBridge::with_endpoints(
            TwitchConfig {
                client_id: "cid".into(),
                channel: "simulated-channel".into(),
                modules,
            },
            Endpoints {
                id_base: self.http.clone(),
                helix_base: format!("{}/helix", self.http),
                eventsub_url: self.ws_url.clone(),
                time_unit: Duration::from_millis(100),
                validate_every: Duration::from_secs(3600),
            },
            self.store.clone(),
            self.purge.clone(),
            capacity,
        )
        .expect("simulated bridge");
        self.bridges
            .lock()
            .expect("simulated bridges")
            .push(bridge.clone());
        bridge
    }

    pub fn store_login(&self) {
        self.store
            .save(&Credential {
                access_token: Secret::new(ACCESS),
                refresh_token: Secret::new(REFRESH),
                expires_at: chrono::Utc::now().timestamp() + 3600,
            })
            .expect("simulated save");
    }

    pub async fn accept(&mut self) -> Conn {
        tokio::time::timeout(Duration::from_secs(5), self.conns.recv())
            .await
            .expect("simulated connection timeout")
            .expect("simulated listener closed")
    }

    pub async fn connected(&mut self) -> (Arc<TwitchBridge>, Conn, mpsc::Receiver<BridgeEvent>) {
        self.store_login();
        let bridge = self.platform();
        let (tx, rx) = mpsc::channel(128);
        bridge.start(tx);
        let mut ws = self.accept().await;
        send(&mut ws, welcome("S1")).await;
        until(|| bridge.status().state == BridgeState::Connected).await;
        (bridge, ws, rx)
    }
}

pub(super) async fn until(f: impl Fn() -> bool) {
    tokio::time::timeout(Duration::from_secs(5), async {
        while !f() {
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    })
    .await
    .expect("simulated condition timeout");
}

pub(super) async fn recv(rx: &mut mpsc::Receiver<BridgeEvent>) -> BridgeEvent {
    tokio::time::timeout(Duration::from_secs(5), rx.recv())
        .await
        .expect("simulated event timeout")
        .expect("simulated inbox closed")
}

pub(super) async fn chat(rx: &mut mpsc::Receiver<BridgeEvent>) -> ChatMessage {
    loop {
        if let BridgeEvent::Notification(notification) = recv(rx).await
            && let Some(chat) = notification.chat
        {
            return chat;
        }
    }
}
