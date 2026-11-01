//! Test-only obs-websocket v5 pieces for the night core: a generated fake OBS
//! peer and an authenticating relay. The relay is how a per-run password reaches
//! the core without the keychain: the core's real `cc_obs::Client` connects to the
//! relay, which answers with an unauthenticated Hello, then the relay performs the
//! v5 authentication upstream with the in-memory password and pipes every frame.
use base64::Engine;
use futures::{SinkExt, StreamExt};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::net::{TcpListener, TcpStream};
use tokio_tungstenite::{accept_async, connect_async, tungstenite::Message};
use zeroize::Zeroizing;

type Fallible<T> = Result<T, Box<dyn std::error::Error + Send + Sync>>;
const BUDGET: Duration = Duration::from_secs(5);
/// The owner's own OBS websocket port. The night core never connects to it.
pub const OWNER_PORT: u16 = 4455;

pub fn random_hex(bytes: usize) -> String {
    (0..bytes)
        .map(|_| format!("{:02x}", rand::random::<u8>()))
        .collect()
}

fn digest(input: &str) -> String {
    base64::engine::general_purpose::STANDARD.encode(Sha256::digest(input.as_bytes()))
}

/// obs-websocket v5: base64(sha256(base64(sha256(password + salt)) + challenge)).
fn authentication(password: &str, salt: &str, challenge: &str) -> Zeroizing<String> {
    let secret = Zeroizing::new(digest(&format!("{password}{salt}")));
    Zeroizing::new(digest(&format!("{}{challenge}", secret.as_str())))
}

/// Only metadata leaves the process: request type, scene, input and URL. Never
/// a password, an authentication string or a capability.
fn report(value: Value) {
    println!("{}", json!({ "obs": value }));
}

/// Generated SIMULATED OBS peer. Requires authentication like a real OBS, and
/// starts with `Scene` and supports the product's owned rehearsal scene cleanup.
pub async fn fake_peer(password: Zeroizing<String>) -> Fallible<u16> {
    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let port = listener.local_addr()?.port();
    let peer = Arc::new(Mutex::new(FakeObs {
        scenes: BTreeMap::from([("Scene".into(), random_hex(16))]),
        inputs: BTreeMap::new(),
    }));
    let password = Arc::new(password);
    tokio::spawn(async move {
        while let Ok((stream, _)) = listener.accept().await {
            let (peer, password) = (peer.clone(), password.clone());
            tokio::spawn(async move {
                let _ = fake_session(stream, &password, &peer).await;
            });
        }
    });
    Ok(port)
}

async fn fake_session(stream: TcpStream, password: &str, peer: &Mutex<FakeObs>) -> Fallible<()> {
    let mut socket = accept_async(stream).await?;
    let (salt, challenge) = (random_hex(16), random_hex(16));
    let hello = json!({"op":0,"d":{"obsStudioVersion":"31.0.0-simulated",
        "obsWebSocketVersion":"5.5.0-simulated","rpcVersion":1,
        "authentication":{"salt":salt,"challenge":challenge}}});
    socket.send(Message::Text(hello.to_string().into())).await?;
    let identify = next_json(&mut socket).await?;
    let expected = authentication(password, &salt, &challenge);
    if identify["op"] != 1 || identify["d"]["authentication"].as_str() != Some(expected.as_str()) {
        // 4009 AuthenticationFailed, as a real OBS closes a wrong password.
        let _ = socket.close(None).await;
        return Err("simulated OBS refused authentication".into());
    }
    let identified = json!({"op":2,"d":{"negotiatedRpcVersion":1}});
    socket
        .send(Message::Text(identified.to_string().into()))
        .await?;
    loop {
        let request = next_json(&mut socket).await?;
        if request["op"] != 6 {
            continue;
        }
        let kind = request["d"]["requestType"].as_str().unwrap_or_default();
        let data = &request["d"]["requestData"];
        let (status, response) = {
            let mut peer = peer.lock().map_err(|_| "SIMULATED peer lock")?;
            fake_response(kind, data, &mut peer)
        };
        let mut d = json!({"requestType":kind,"requestId":request["d"]["requestId"],
            "requestStatus":status});
        if !response.is_null() {
            d["responseData"] = response;
        }
        let frame = json!({"op":7,"d":d});
        socket.send(Message::Text(frame.to_string().into())).await?;
    }
}

struct FakeInput {
    uuid: String,
    scene: String,
    item: usize,
}
struct FakeObs {
    scenes: BTreeMap<String, String>,
    inputs: BTreeMap<String, FakeInput>,
}
fn fake_response(kind: &str, data: &Value, peer: &mut FakeObs) -> (Value, Value) {
    let ok = |data| (json!({"result":true,"code":100}), data);
    let refused = |code| {
        (
            json!({"result":false,"code":code,"comment":"SIMULATED refusal"}),
            Value::Null,
        )
    };
    let scene = data["sceneName"].as_str().unwrap_or_default();
    match kind {
        "GetVersion" => ok(
            json!({"obsVersion":"31.0.0-simulated","obsWebSocketVersion":"5.5.0-simulated",
            "rpcVersion":1,"availableRequests":["GetVersion","CreateInput","GetSceneList","CreateScene",
            "GetSceneItemList","RemoveInput","RemoveScene"],"supportedImageFormats":["png"],
            "platform":"simulated","platformDescription":"SIMULATED OBS peer"}),
        ),
        "GetSceneList" => ok(
            json!({"currentProgramSceneName":"Scene","currentProgramSceneUuid":peer.scenes.get("Scene"),
            "scenes":peer.scenes.iter().enumerate().map(|(index,(name,uuid))|
                json!({"sceneIndex":index,"sceneName":name,"sceneUuid":uuid})).collect::<Vec<_>>()}),
        ),
        "CreateScene" if peer.scenes.contains_key(scene) => refused(601),
        "CreateScene" => {
            let uuid = random_hex(16);
            peer.scenes.insert(scene.into(), uuid.clone());
            ok(json!({"sceneUuid":uuid}))
        }
        "GetSceneItemList" if peer.scenes.contains_key(scene) => {
            ok(json!({"sceneItems":peer.inputs.iter()
            .filter(|(_,input)| input.scene == scene).map(|(name,input)|
                json!({"sourceName":name,"sourceUuid":input.uuid,"sceneItemId":input.item})).collect::<Vec<_>>()}))
        }
        "RemoveScene" if peer.scenes.remove(scene).is_some() => ok(json!({})),
        "CreateInput" if !peer.scenes.contains_key(scene) => refused(600),
        "CreateInput" => {
            let name = data["inputName"].as_str().unwrap_or_default();
            if peer.inputs.contains_key(name) {
                return refused(601);
            }
            let uuid = random_hex(16);
            let item = peer.inputs.len() + 1;
            peer.inputs.insert(
                name.into(),
                FakeInput {
                    uuid: uuid.clone(),
                    scene: scene.into(),
                    item,
                },
            );
            ok(json!({"inputUuid":uuid,"sceneItemId":item}))
        }
        "RemoveInput" => {
            let name = peer
                .inputs
                .iter()
                .find(|(_, input)| data["inputUuid"] == input.uuid)
                .map(|(name, _)| name.clone());
            match name {
                Some(name) => {
                    peer.inputs.remove(&name);
                    ok(json!({}))
                }
                None => refused(600),
            }
        }
        "GetSceneItemList" | "RemoveScene" => refused(600),
        _ => refused(204),
    }
}

async fn next_json<S>(socket: &mut S) -> Fallible<Value>
where
    S: futures::Stream<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Unpin,
{
    loop {
        let message = tokio::time::timeout(Duration::from_secs(3600), socket.next())
            .await?
            .ok_or("socket closed")??;
        match message {
            Message::Text(text) => return Ok(serde_json::from_str(&text)?),
            Message::Close(_) => return Err("socket closed".into()),
            _ => {}
        }
    }
}

/// Listens on an ephemeral loopback port and relays each core connection to the
/// upstream OBS port, authenticating with the in-memory password.
pub async fn relay(upstream: u16, password: Zeroizing<String>) -> Fallible<u16> {
    if upstream == OWNER_PORT {
        return Err("refusing the owner's OBS websocket port 4455".into());
    }
    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let port = listener.local_addr()?.port();
    let password = Arc::new(password);
    tokio::spawn(async move {
        while let Ok((stream, _)) = listener.accept().await {
            let password = password.clone();
            tokio::spawn(async move {
                let _ = relay_session(stream, upstream, &password).await;
            });
        }
    });
    Ok(port)
}

async fn relay_session(stream: TcpStream, upstream: u16, password: &str) -> Fallible<()> {
    let mut core = accept_async(stream).await?;
    let (mut obs, _) =
        tokio::time::timeout(BUDGET, connect_async(format!("ws://127.0.0.1:{upstream}"))).await??;
    let mut hello = tokio::time::timeout(BUDGET, next_json(&mut obs)).await??;
    let challenge = hello["d"]
        .as_object_mut()
        .and_then(|d| d.remove("authentication"));
    core.send(Message::Text(hello.to_string().into())).await?;
    let mut identify = tokio::time::timeout(BUDGET, next_json(&mut core)).await??;
    if let Some(challenge) = challenge {
        let salt = challenge["salt"].as_str().ok_or("missing salt")?;
        let challenge = challenge["challenge"].as_str().ok_or("missing challenge")?;
        identify["d"]["authentication"] = json!(authentication(password, salt, challenge).as_str());
    }
    obs.send(Message::Text(identify.to_string().into())).await?;
    let (mut core_tx, mut core_rx) = core.split();
    let (mut obs_tx, mut obs_rx) = obs.split();
    let upward = async {
        while let Some(Ok(message)) = core_rx.next().await {
            if let Message::Text(text) = &message
                && let Ok(frame) = serde_json::from_str::<Value>(text)
                && frame["op"] == 6
                && frame["d"]["requestType"] == "CreateInput"
            {
                let data = &frame["d"]["requestData"];
                report(json!({"request":"CreateInput","id":frame["d"]["requestId"],
                    "scene":data["sceneName"],"input":data["inputName"],
                    "url":data["inputSettings"]["url"]}));
            }
            if obs_tx.send(message).await.is_err() {
                break;
            }
        }
    };
    let downward = async {
        while let Some(Ok(message)) = obs_rx.next().await {
            if let Message::Text(text) = &message
                && let Ok(frame) = serde_json::from_str::<Value>(text)
                && frame["op"] == 7
                && frame["d"]["requestType"] == "CreateInput"
            {
                report(
                    json!({"response":"CreateInput","id":frame["d"]["requestId"],
                    "result":frame["d"]["requestStatus"]["result"],
                    "code":frame["d"]["requestStatus"]["code"]}),
                );
            }
            if core_tx.send(message).await.is_err() {
                break;
            }
        }
    };
    tokio::select! { _ = upward => {}, _ = downward => {} }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn simulated_peer_tracks_scene_creation_input_uuids_and_cleanup() {
        let mut peer = FakeObs {
            scenes: BTreeMap::from([("Scene".into(), "simulated-scene".into())]),
            inputs: BTreeMap::new(),
        };
        let scene = "Castle Control · Rehearsal";
        let (status, _) = fake_response("CreateScene", &json!({"sceneName":scene}), &mut peer);
        assert_eq!(status["result"], true);
        let (_, list) = fake_response("GetSceneList", &json!({}), &mut peer);
        assert_eq!(list["scenes"].as_array().unwrap().len(), 2);
        let (status, created) = fake_response(
            "CreateInput",
            &json!({"sceneName":scene,
            "inputName":"Castle Control · SIMULATED plate"}),
            &mut peer,
        );
        assert_eq!(status["result"], true);
        let (_, list) = fake_response("GetSceneItemList", &json!({"sceneName":scene}), &mut peer);
        assert_eq!(list["sceneItems"].as_array().unwrap().len(), 1);
        let (status, _) = fake_response(
            "RemoveInput",
            &json!({"inputUuid":created["inputUuid"]}),
            &mut peer,
        );
        assert_eq!(status["result"], true);
        let (_, list) = fake_response("GetSceneItemList", &json!({"sceneName":scene}), &mut peer);
        assert!(list["sceneItems"].as_array().unwrap().is_empty());
        let (status, _) = fake_response("RemoveScene", &json!({"sceneName":scene}), &mut peer);
        assert_eq!(status["result"], true);
        assert_eq!(
            peer.scenes.keys().map(String::as_str).collect::<Vec<_>>(),
            vec!["Scene"]
        );
        let (status, _) = fake_response(
            "RemoveInput",
            &json!({"inputUuid":created["inputUuid"]}),
            &mut peer,
        );
        assert_eq!(status["code"], 600);
    }
}
