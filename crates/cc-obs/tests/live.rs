//! LIVE twins are opt-in owner checks, never fixture evidence. Run one at a time.
//! CC_LIVE_OBS_SCENE optionally selects the source scene (default: Scene).
//! Switch OBS to that scene for the human visual check; tests never switch it.
mod live_support;
mod screenshot;
use cc_obs::{BrowserSource, Error, Overlay};
use futures::FutureExt;
use live_support::{Observer, client, guard, run_id, success};
use serde_json::json;
use std::panic::AssertUnwindSafe;

#[tokio::test]
#[ignore = "live: CC_LIVE_OBS=1"]
async fn live_handshake_rpc_versions() {
    guard();
    let _client = client().await;
    Observer::connect().await.close().await;
}

#[tokio::test]
#[ignore = "live: CC_LIVE_OBS=1"]
async fn live_auth_vector() {
    guard();
    let observer = Observer::connect().await;
    let authenticated = observer.authenticated;
    observer.close().await;
    assert!(
        authenticated,
        "live auth vector untested: enable OBS authentication and provision local-obs in castlecontrol-obs first"
    );
    let _client = client().await;
}

#[tokio::test]
#[ignore = "live: CC_LIVE_OBS=1"]
async fn live_get_version_correlation() {
    guard();
    let mut client = client().await;
    // Consecutive calls exercise cc-1/cc-2 correlation in the production client.
    for _ in 0..2 {
        let version = client.get_version().await.expect("live GetVersion failed");
        assert_eq!(version.rpc_version, 1);
        assert!(!version.obs_version.is_empty() && !version.obs_web_socket_version.is_empty());
        assert!(
            version
                .available_requests
                .iter()
                .any(|r| r == "CreateInput")
        );
    }
    let mut observer = Observer::connect().await;
    let response = observer.request("GetVersion", json!({})).await;
    success(&response);
    assert!(response["responseData"]["availableRequests"].is_array());
}

#[tokio::test]
#[ignore = "live: CC_LIVE_OBS=1"]
async fn live_scene_exists() {
    guard();
    let scene_name = scene_name();
    let mut observer = Observer::connect().await;
    let response = observer.request("GetSceneList", json!({})).await;
    success(&response);
    assert!(
        response["responseData"]["scenes"]
            .as_array()
            .is_some_and(|scenes| scenes.iter().any(|scene| scene["sceneName"] == scene_name)),
        "live spike prerequisite missing: create an OBS scene named {scene_name}"
    );
}

#[tokio::test]
#[ignore = "live: CC_LIVE_OBS=1"]
async fn live_status_codes() {
    guard();
    let mut observer = Observer::connect().await;
    let version = observer.request("GetVersion", json!({})).await;
    success(&version);
    let rejected = observer
        .request("GetInputSettings", json!({"inputName":run_id()}))
        .await;
    assert!(
        rejected["requestStatus"]["result"] == false
            && rejected["requestStatus"]["code"]
                .as_u64()
                .is_some_and(|c| c != 100),
        "live missing input must yield a non-success status"
    );
    // Invalid production source must fail locally, without sending a mutation.
    let mut client = client().await;
    let invalid = BrowserSource {
        scene_name: scene_name(),
        source_name: run_id(),
        url: "http://localhost:17891/rpc".into(),
        width: 1280,
        height: 720,
    };
    assert_eq!(
        client.create_browser_source(&invalid).await,
        Err(Error::Invalid)
    );
    let name = run_id();
    eprintln!("live OBS rejection-check input: {name}");
    let missing_scene = BrowserSource {
        scene_name: format!("{name}-missing-scene"),
        source_name: name.clone(),
        url: "http://localhost:17891/".into(),
        width: 1280,
        height: 720,
    };
    let result = client.create_browser_source(&missing_scene).await;
    // Always remove this run's input even if OBS unexpectedly accepted the scene.
    observer
        .request("RemoveInput", json!({"inputName":name}))
        .await;
    let absent = observer.request("GetInputList", json!({})).await;
    success(&absent);
    assert!(
        absent["responseData"]["inputs"]
            .as_array()
            .is_some_and(|inputs| inputs.iter().all(|input| input["inputName"] != name)),
        "live rejection cleanup failed: inspect OBS for this run's cc-live input"
    );
    assert_eq!(result, Err(Error::Rejected));
}

#[tokio::test]
#[ignore = "live: CC_LIVE_OBS=1"]
async fn live_reconnect_is_explicit() {
    guard();
    let mut first = client().await;
    first
        .get_version()
        .await
        .expect("live first connection failed");
    drop(first);
    // Deliberate local close, no OBS restart or disruption of other clients.
    Observer::connect().await.close().await;
    let mut fresh = client().await;
    fresh
        .get_version()
        .await
        .expect("live explicit reconnect failed");
}

#[tokio::test]
#[ignore = "live: CC_LIVE_OBS=1"]
async fn live_create_input_shape() {
    guard();
    browser_source_roundtrip(false).await;
}

#[tokio::test]
#[ignore = "live: CC_LIVE_OBS=1"]
async fn live_overlay_17891() {
    guard();
    browser_source_roundtrip(false).await;
}

#[tokio::test]
// GetSourceScreenshot returns transparent frames on owner OBS: inconclusive.
// The human visual check is authoritative; transparent frames cannot pass.
#[ignore = "live: CC_LIVE_OBS=1; transparent frames inconclusive on owner OBS; human visual check is authority"]
async fn live_overlay_screenshot_not_white() {
    if std::env::var("CC_LIVE_OBS").as_deref() != Ok("1") {
        eprintln!("SKIPPED: CC_LIVE_OBS=1 required; no socket or keychain access attempted");
        return;
    }
    browser_source_roundtrip(true).await;
}

async fn browser_source_roundtrip(check_screenshot: bool) {
    guard();
    let _overlay = Overlay::start(17891)
        .await
        .expect("live overlay port 17891 must be free");
    let mut client = client().await;
    let mut observer = Observer::connect().await;
    let name = run_id();
    eprintln!("live OBS browser-source input: {name}");
    let source = BrowserSource {
        scene_name: scene_name(),
        source_name: name.clone(),
        url: "http://localhost:17891/".into(),
        width: 1280,
        height: 720,
    };
    // Catch assertion panics so RemoveInput runs even after uncertain CreateInput.
    let outcome = AssertUnwindSafe(async {
        let program = observer.request("GetCurrentProgramScene", json!({})).await;
        success(&program);
        let program_scene = program["responseData"]["currentProgramSceneName"]
            .as_str()
            .expect("live OBS program scene name missing");
        if program_scene != source.scene_name {
            eprintln!(
                "spike source in scene {}; OBS program scene is {program_scene}; switch to {} for the visual check",
                source.scene_name, source.scene_name
            );
        }
        client
            .create_browser_source(&source)
            .await
            .expect("live CreateInput failed");
        let settings = observer
            .request("GetInputSettings", json!({"inputName":name}))
            .await;
        success(&settings);
        let data = &settings["responseData"];
        assert!(
            data["inputKind"] == "browser_source",
            "live input must be a browser source"
        );
        let settings = &data["inputSettings"];
        assert!(
            settings["url"] == source.url && settings["width"] == 1280 && settings["height"] == 720,
            "live browser source settings must roundtrip"
        );
        assert!(
            settings["is_local_file"] == false && settings["shutdown"] == false,
            "live source must remain a URL source without shutdown"
        );
        let removed = observer
            .request("RemoveInput", json!({"inputName":name}))
            .await;
        success(&removed);
        // Independent observer sees fields the production client currently ignores.
        let created = observer
            .request(
                "CreateInput",
                json!({"sceneName":source.scene_name,
            "inputName":name,"inputKind":"browser_source","sceneItemEnabled":true,
            "inputSettings":{"url":source.url,"width":1280,"height":720,
                "is_local_file":false,"shutdown":false}}),
            )
            .await;
        success(&created);
        assert!(
            created["responseData"]["sceneItemId"].as_i64().is_some()
                && created["responseData"]["inputUuid"]
                    .as_str()
                    .is_some_and(|s| !s.is_empty()),
            "live CreateInput must return a sceneItemId and inputUuid"
        );
        let items = observer
            .request("GetSceneItemList", json!({"sceneName":source.scene_name}))
            .await;
        success(&items);
        assert!(
            items["responseData"]["sceneItems"]
                .as_array()
                .is_some_and(|items| items.iter().any(|item| item["sourceName"] == name
                    && item["sceneItemEnabled"] == true
                    && item["sceneItemId"] == created["responseData"]["sceneItemId"])),
            "live source must be enabled in {}", source.scene_name
        );
        check_overlay().await;
        if check_screenshot {
            screenshot::check(&mut observer, &name).await;
        }
    })
    .catch_unwind()
    .await;
    let cleanup = AssertUnwindSafe(async {
        let removed = observer
            .request("RemoveInput", json!({"inputName":name}))
            .await;
        // If CreateInput never succeeded, absence also satisfies cleanup.
        let absent = observer.request("GetInputList", json!({})).await;
        success(&absent);
        assert!(
            absent["responseData"]["inputs"]
                .as_array()
                .is_some_and(|inputs| inputs.iter().all(|input| input["inputName"] != name)),
            "live cleanup failed: remove this run's cc-live input manually"
        );
        if outcome.is_ok() {
            success(&removed);
        }
    })
    .catch_unwind()
    .await;
    if cleanup.is_err() {
        panic!("live cleanup failed: inspect OBS for cc-live inputs from this run");
    }
    if let Err(panic) = outcome {
        std::panic::resume_unwind(panic);
    }
}

fn scene_name() -> String {
    std::env::var("CC_LIVE_OBS_SCENE").unwrap_or_else(|_| "Scene".into())
}

async fn check_overlay() {
    let http = reqwest::Client::builder()
        .no_proxy()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .expect("live loopback HTTP client failed");
    // Socket targets are always numeric loopback; the overlay requires localhost Host.
    let url = "http://127.0.0.1:17891/";
    let page = http
        .get(url)
        .header("host", "localhost:17891")
        .send()
        .await
        .expect("live overlay unavailable");
    assert_eq!(page.status(), 200);
    assert!(
        page.headers()["content-security-policy"]
            .to_str()
            .unwrap()
            .contains("default-src 'none'")
    );
    let body = page.text().await.expect("live overlay body unavailable");
    assert!(
        body.contains("Static test page") && !body.contains("<script") && !body.contains("src=")
    );
    for route in ["rpc", "events"] {
        for method in [reqwest::Method::GET, reqwest::Method::POST] {
            let response = http
                .request(method, format!("{url}{route}"))
                .header("host", "localhost:17891")
                .send()
                .await
                .expect("live overlay route check failed");
            assert_eq!(response.status(), 404);
        }
    }
}
