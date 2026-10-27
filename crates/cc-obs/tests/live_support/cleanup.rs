use super::{Observer, success};
use serde_json::{Value, json};
use std::time::Duration;

/// Remove only this run's input; callers decide whether its status must succeed.
pub async fn remove_input(observer: &mut Observer, name: &str) -> Value {
    let listed = observer.request("GetSceneList", json!({})).await;
    let scenes = if listed["requestStatus"]["result"] == true {
        listed["responseData"]["scenes"].as_array().map(|scenes| {
            scenes
                .iter()
                .map(|scene| {
                    scene["sceneName"]
                        .as_str()
                        .expect("live OBS scene name missing")
                        .to_owned()
                })
                .collect::<Vec<_>>()
        })
    } else {
        None
    };
    let scenes = scenes.unwrap_or_else(|| {
        vec![std::env::var("CC_LIVE_OBS_SCENE").unwrap_or_else(|_| "Scene".into())]
    });
    let mut detached = 0;
    for scene in scenes {
        let listed = observer
            .request("GetSceneItemList", json!({"sceneName":scene}))
            .await;
        if let Some(items) = listed["responseData"]["sceneItems"].as_array() {
            for item in items.iter().filter(|item| item["sourceName"] == name) {
                let id = item["sceneItemId"]
                    .as_i64()
                    .expect("live OBS scene item ID missing");
                // A concurrent removal can reject an item; final absence is authoritative.
                observer
                    .request(
                        "RemoveSceneItem",
                        json!({"sceneName":scene,"sceneItemId":id}),
                    )
                    .await;
                detached += 1;
            }
        }
    }
    let removed = observer
        .request("RemoveInput", json!({"inputName":name}))
        .await;
    let absent = tokio::time::timeout(Duration::from_secs(3), async {
        loop {
            let listed = observer.request("GetInputList", json!({})).await;
            success(&listed);
            if listed["responseData"]["inputs"]
                .as_array()
                .is_some_and(|inputs| inputs.iter().all(|input| input["inputName"] != name))
            {
                return;
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
    })
    .await;
    assert!(
        absent.is_ok(),
        "live cleanup failed: remove this run's cc-live input manually: {name}"
    );
    // OBS 33 can release an input together with its last scene item, so RemoveInput
    // then answers 600 (not found). Absence was just confirmed; that counts as removed.
    if detached > 0 && removed["requestStatus"]["code"] == 600 {
        return json!({"requestStatus":{"result":true,"code":100}});
    }
    removed
}

#[cfg(test)]
mod tests;
