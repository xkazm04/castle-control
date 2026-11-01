//! SIMULATED off-air OBS 33: RemoveInput acknowledges source_remove, but the
//! scene never renders/prunes. Removing its last placement releases the input.
use crate::ownership_support::{SimulatedKeychain, frame, peer, response, send};
use cc_obs::Client;
use serde_json::{Value, json};
use std::sync::{Arc, Mutex};
use tokio::task::JoinHandle;

pub const UUID: &str = "simulated-owned-uuid";
pub const FOREIGN: &str = "simulated-foreign-uuid";
pub struct State {
    pub owned: bool,
    pub foreign: bool,
    pub scene: bool,
    pub ignore_detach: bool,
    pub replacement: bool,
    pub acknowledgements: u32,
    pub detachments: Vec<i64>,
}
pub struct Peer {
    pub state: Arc<Mutex<State>>,
    task: JoinHandle<()>,
}
impl Drop for Peer {
    fn drop(&mut self) {
        self.task.abort();
    }
}
pub async fn start() -> (Client, Peer) {
    let (config, socket) = peer().await;
    let client = Client::connect_with_reader(&config, &SimulatedKeychain)
        .await
        .unwrap();
    let state = Arc::new(Mutex::new(State {
        owned: false,
        foreign: true,
        scene: false,
        ignore_detach: false,
        replacement: false,
        acknowledgements: 0,
        detachments: Vec::new(),
    }));
    let seen = state.clone();
    let task = tokio::spawn(async move {
        let mut socket = socket.await.unwrap();
        loop {
            let request = frame(&mut socket).await;
            let (code, data) = respond(&request, &mut seen.lock().unwrap());
            let mut reply = response(&request, data);
            reply["d"]["requestStatus"] = json!({"result":code == 100,"code":code});
            send(&mut socket, reply).await;
        }
    });
    (client, Peer { state, task })
}
fn respond(request: &Value, state: &mut State) -> (u32, Value) {
    let data = &request["d"]["requestData"];
    let foreign_name = if state.replacement {
        "simulated-source"
    } else {
        "simulated-foreign-input"
    };
    let mut inputs = Vec::new();
    let mut items = Vec::new();
    if state.owned {
        inputs.push(json!({"inputName":"simulated-source","inputUuid":UUID}));
        items.push(json!({"sourceName":"simulated-source","sourceUuid":UUID,"sceneItemId":12}));
    }
    if state.foreign {
        inputs.push(json!({"inputName":foreign_name,"inputUuid":FOREIGN}));
        items.push(json!({"sourceName":foreign_name,"sourceUuid":FOREIGN,"sceneItemId":if state.replacement {12} else {99}}));
    }
    match request["d"]["requestType"].as_str().unwrap() {
        "GetSceneList" => (
            100,
            json!({"scenes":if state.scene {vec![json!({"sceneName":"simulated-scene"})]} else {vec![]}}),
        ),
        "CreateScene" => {
            state.scene = true;
            (100, json!({"sceneUuid":"simulated-scene-uuid"}))
        }
        "CreateInput" if state.owned || state.replacement => (601, json!({})),
        "CreateInput" => {
            state.owned = true;
            (100, json!({"inputUuid":UUID,"sceneItemId":12}))
        }
        "GetInputList" => (100, json!({"inputs":inputs})),
        "GetSceneItemList" if state.scene => (100, json!({"sceneItems":items})),
        "GetSceneItemList" => (600, json!({})),
        "RemoveSceneItem" => {
            assert_eq!(data["sceneName"], "simulated-scene");
            assert!(
                state.owned && data["sceneItemId"] == 12,
                "foreign item must never be removed"
            );
            state.detachments.push(12);
            if !state.ignore_detach {
                state.owned = false;
            }
            (100, json!({}))
        }
        "RemoveInput" => {
            assert_eq!(data, &json!({"inputUuid":UUID}));
            if !state.owned {
                return (600, json!({}));
            }
            state.acknowledgements += 1;
            // Status 100 does NOT unlink an off-air scene item or release its reference.
            (100, json!({}))
        }
        "RemoveScene" => {
            assert!(
                !state.owned && !state.foreign,
                "nonempty scene must never be removed"
            );
            state.scene = false;
            (100, json!({}))
        }
        _ => panic!("unexpected simulated OBS request"),
    }
}
