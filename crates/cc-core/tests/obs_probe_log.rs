//! Simulated loopback OBS peers only; no keychain access or live credentials.
use cc_core::{AppState, NativeConfig, NativeServices};
use cc_store::Store;
use cc_types::EventKind;
use futures::{SinkExt, StreamExt};
use serde_json::{Value, json};
use std::{
    io::Write,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicUsize, Ordering},
    },
    time::Duration,
};
use tokio_tungstenite::tungstenite::Message;

const LABEL: &str = "simulated-obs-label-do-not-log";
const PEER_TEXT: &str = "simulated-peer-frame-do-not-log";
const PEER_URL: &str = "ws://simulated-peer.invalid/private";

#[derive(Clone, Default)]
struct Captured(Arc<Mutex<Vec<u8>>>);
impl Write for Captured {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        self.0.lock().unwrap().extend_from_slice(bytes);
        Ok(bytes.len())
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}
impl Captured {
    fn subscribe(&self) -> tracing::subscriber::DefaultGuard {
        let writer = self.clone();
        tracing::subscriber::set_default(
            tracing_subscriber::fmt()
                .with_max_level(tracing::Level::WARN)
                .without_time()
                .with_ansi(false)
                .with_target(false)
                .with_writer(move || writer.clone())
                .finish(),
        )
    }
    fn text(&self) -> String {
        String::from_utf8(self.0.lock().unwrap().clone()).unwrap()
    }
    fn assert_warnings(&self, count: usize, reason: cc_obs::Error) {
        let text = self.text();
        let lines: Vec<_> = text.lines().collect();
        assert_eq!(lines.len(), count, "unexpected warning count");
        for line in lines {
            assert!(line.contains("WARN"));
            assert!(line.contains("OBS probe failed"));
            assert!(line.contains(&format!("reason={reason}")));
        }
        for excluded in [LABEL, PEER_TEXT, PEER_URL] {
            assert!(!text.contains(excluded), "probe logs leaked simulated data");
        }
    }
}

async fn wait_for(mut ready: impl FnMut() -> bool) {
    tokio::time::timeout(Duration::from_secs(12), async {
        while !ready() {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("simulated probe observation did not arrive");
}

async fn service(port: u16) -> (tempfile::TempDir, Arc<NativeServices>, Arc<AppState>) {
    let directory = tempfile::tempdir().unwrap();
    let service = NativeServices::new(
        NativeConfig {
            twitch: Default::default(),
            obs: cc_obs::Config {
                port,
                password_label: LABEL.into(),
            },
            overlay_port: 0,
        },
        Store::open(directory.path()).unwrap(),
        Arc::new(|_| panic!("no live login")),
    )
    .await
    .unwrap();
    let app = service.app(32).unwrap();
    (directory, service, app)
}

struct Peer {
    port: u16,
    connected: Arc<AtomicBool>,
    requests: Arc<AtomicUsize>,
    task: tokio::task::JoinHandle<()>,
}
impl Peer {
    async fn start() -> Self {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let connected = Arc::new(AtomicBool::new(false));
        let requests = Arc::new(AtomicUsize::new(0));
        let state = connected.clone();
        let count = requests.clone();
        let task = tokio::spawn(async move {
            loop {
                let (stream, _) = listener.accept().await.unwrap();
                let mut socket = tokio_tungstenite::accept_async(stream).await.unwrap();
                socket
                    .send(Message::Text(
                        json!({"op":0,"d":{"rpcVersion":1}}).to_string().into(),
                    ))
                    .await
                    .unwrap();
                let _identify = socket.next().await.unwrap().unwrap();
                socket
                    .send(Message::Text(
                        json!({"op":2,"d":{"negotiatedRpcVersion":1}})
                            .to_string()
                            .into(),
                    ))
                    .await
                    .unwrap();
                while let Some(Ok(frame)) = socket.next().await {
                    let request: Value = serde_json::from_str(frame.to_text().unwrap()).unwrap();
                    let up = state.load(Ordering::SeqCst);
                    socket.send(Message::Text(json!({"op":7,"d":{
                        "requestId":request["d"]["requestId"],
                        "requestType":request["d"]["requestType"],
                        "requestStatus":{"result":up,"code":if up {100} else {400},
                            "comment":format!("{PEER_TEXT} {PEER_URL}")},
                        "responseData":{"obsVersion":"simulated","obsWebSocketVersion":"5-simulated",
                            "rpcVersion":1,"availableRequests":["GetVersion"]}
                    }}).to_string().into())).await.unwrap();
                    count.fetch_add(1, Ordering::SeqCst);
                }
            }
        });
        Self {
            port,
            connected,
            requests,
            task,
        }
    }
}
impl Drop for Peer {
    fn drop(&mut self) {
        self.task.abort();
    }
}

#[tokio::test]
async fn first_failed_probe_warns_once_with_fixed_transport_reason() {
    let output = Captured::default();
    let _guard = output.subscribe();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    drop(listener);
    let (_directory, _service, _app) = service(port).await;
    wait_for(|| !output.text().is_empty()).await;
    output.assert_warnings(1, cc_obs::Error::Transport);
}

#[tokio::test]
async fn three_identical_failed_probes_still_warn_only_once() {
    let output = Captured::default();
    let _guard = output.subscribe();
    let peer = Peer::start().await;
    let (_directory, _service, _app) = service(peer.port).await;
    wait_for(|| peer.requests.load(Ordering::SeqCst) >= 3).await;
    output.assert_warnings(1, cc_obs::Error::Rejected);
}

#[tokio::test]
async fn recovery_then_disconnect_warns_again_without_peer_data() {
    let output = Captured::default();
    let _guard = output.subscribe();
    let peer = Peer::start().await;
    let (_directory, _service, app) = service(peer.port).await;
    wait_for(|| !output.text().is_empty()).await;
    output.assert_warnings(1, cc_obs::Error::Rejected);
    peer.connected.store(true, Ordering::SeqCst);
    wait_for(|| {
        app.events
            .since(0)
            .unwrap()
            .iter()
            .any(|event| event.kind == EventKind::ObsStatus)
    })
    .await;
    output.assert_warnings(1, cc_obs::Error::Rejected);
    peer.connected.store(false, Ordering::SeqCst);
    wait_for(|| output.text().lines().count() >= 2).await;
    output.assert_warnings(2, cc_obs::Error::Rejected);
    let before = peer.requests.load(Ordering::SeqCst);
    wait_for(|| peer.requests.load(Ordering::SeqCst) > before).await;
    output.assert_warnings(2, cc_obs::Error::Rejected);
}
