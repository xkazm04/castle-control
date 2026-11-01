//! Generated simulated authenticated OBS peer and in-memory credential store.
use cc_obs::{Error, PasswordReader, PasswordStore};
use futures::{SinkExt, StreamExt};
use serde_json::{Value, json};
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, AtomicUsize, Ordering},
};
use tokio::{
    net::TcpListener,
    task::{JoinHandle, JoinSet},
};
use tokio_tungstenite::{accept_async, tungstenite::Message};
use zeroize::Zeroizing;

pub const SENTINEL: &str = "simulated-obs-password";
pub const LABEL: &str = "simulated-rehearsal-label";

#[derive(Default)]
pub struct Passwords {
    pub reads: AtomicUsize,
    pub writes: Mutex<Vec<(String, Zeroizing<String>)>>,
}
impl PasswordReader for Passwords {
    fn read(&self, _: &str) -> Result<Zeroizing<String>, Error> {
        self.reads.fetch_add(1, Ordering::SeqCst);
        Err(Error::Keychain)
    }
}
impl PasswordStore for Passwords {
    fn write(&self, label: &str, password: &str) -> Result<(), Error> {
        self.writes
            .lock()
            .unwrap()
            .push((label.into(), Zeroizing::new(password.into())));
        Ok(())
    }
}

#[derive(Default)]
pub struct Seen {
    pub connects: AtomicUsize,
    pub fail_source: AtomicBool,
    pub fail_version: AtomicBool,
    pub requests: Mutex<Vec<Value>>,
    scenes: Mutex<Vec<String>>,
}
pub struct Peer {
    pub port: u16,
    pub seen: Arc<Seen>,
    task: JoinHandle<()>,
}
impl Peer {
    pub async fn start() -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let seen = Arc::new(Seen::default());
        let state = seen.clone();
        let task = tokio::spawn(async move {
            let mut connections = JoinSet::new();
            loop {
                tokio::select! {
                    accepted = listener.accept() => {
                        let (stream, _) = accepted.unwrap();
                        let state = state.clone();
                        connections.spawn(async move {
                            let mut socket = accept_async(stream).await.unwrap();
                            socket.send(Message::Text(json!({"op":0,"d":{"rpcVersion":1,
                                "authentication":{"salt":"simulated-salt","challenge":"simulated-challenge"}}}).to_string().into())).await.unwrap();
                            let identify = socket.next().await.unwrap().unwrap();
                            let identify: Value = serde_json::from_str(identify.to_text().unwrap()).unwrap();
                            assert!(identify["d"]["authentication"] == "hhXX0601vwjVjnbHVKunUiX0uRmBULfqfVaEBrM2Mqk=");
                            socket.send(Message::Text(json!({"op":2,"d":{"negotiatedRpcVersion":1}}).to_string().into())).await.unwrap();
                            state.connects.fetch_add(1, Ordering::SeqCst);
                            while let Some(Ok(frame)) = socket.next().await {
                                if !frame.is_text() { continue; }
                                let request: Value = serde_json::from_str(frame.to_text().unwrap()).unwrap();
                                let kind = request["d"]["requestType"].as_str().unwrap();
                                let data = &request["d"]["requestData"];
                                let failed = (kind == "CreateInput" && state.fail_source.swap(false, Ordering::SeqCst))
                                    || (kind == "GetVersion" && state.fail_version.swap(false, Ordering::SeqCst));
                                let reply = match kind {
                                    "GetVersion" => json!({"obsVersion":SENTINEL,"obsWebSocketVersion":"5-simulated","rpcVersion":1,"availableRequests":[]}),
                                    "GetSceneList" => json!({"scenes":state.scenes.lock().unwrap().iter().map(|name| json!({"sceneName":name})).collect::<Vec<_>>()}),
                                    "CreateScene" => {
                                        state.scenes.lock().unwrap().push(data["sceneName"].as_str().unwrap().into());
                                        json!({"sceneUuid":"simulated-scene-uuid"})
                                    }
                                    "CreateInput" => json!({"inputUuid":"simulated-input-uuid","sceneItemId":17}),
                                    "GetSceneItemList" => json!({"sceneItems":[]}),
                                    "RemoveInput" | "RemoveScene" => json!({}),
                                    _ => panic!("unexpected simulated OBS request"),
                                };
                                state.requests.lock().unwrap().push(request.clone());
                                if socket.send(Message::Text(json!({"op":7,"d":{
                                    "requestType":kind,"requestId":request["d"]["requestId"],
                                    "requestStatus":{"result":!failed,"code":if failed {400} else {100},"comment":SENTINEL},
                                    "responseData":reply}}).to_string().into())).await.is_err() { break; }
                            }
                        });
                    }
                    completed = connections.join_next(), if !connections.is_empty() => {
                        completed.unwrap().unwrap();
                    }
                }
            }
        });
        Self { port, seen, task }
    }
}
impl Drop for Peer {
    fn drop(&mut self) {
        self.task.abort();
    }
}
