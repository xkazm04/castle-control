//! A simulated local OBS peer; the Hello needs no keychain credentials.
#[allow(dead_code)]
#[path = "lots_support/mod.rs"]
mod lots_support;
mod overlay_support;
use cc_core::{AppState, NativeConfig, NativeServices, Registry, bind};
use cc_store::Store;
use cc_types::{ErrorCode, EventKind, SourceUrlResult, parse_request};
use futures::{SinkExt, StreamExt};
use serde_json::{Value, json};
use std::{
    sync::{Arc, Mutex},
    time::Duration,
};

#[tokio::test]
async fn beacons_source_url_uses_only_the_owned_overlay_and_never_the_session() {
    let directory = tempfile::tempdir().unwrap();
    let service = NativeServices::new(
        NativeConfig {
            twitch: Default::default(),
            obs: cc_obs::Config {
                port: 0,
                password_label: "simulated-unused".into(),
            },
            overlay_port: 0,
        },
        Store::open(directory.path()).unwrap(),
        Arc::new(|_| panic!("no live login")),
    )
    .await
    .unwrap();
    // No bridge/OBS workers: URL delivery must not depend on either connection.
    let app = AppState::new(Registry::with_native(service.clone()), 32).unwrap();
    let (address, server) = bind(app.clone(), ([127, 0, 0, 1], 0).into()).await.unwrap();
    let server = tokio::spawn(server);
    let client = reqwest::Client::builder().no_proxy().build().unwrap();
    let endpoint = format!("http://{address}/rpc");
    let visual = json!({"visual_id":"simulated-frame", "name":"Simulated frame",
        "curve":{"ranges":[{"total":0,"intensity":0.0}],"decay":{"kind":"none"}}});
    let response = client
        .post(&endpoint)
        .bearer_auth(app.session_token())
        .json(&json!({"method":"beacons.visual.upsert","params":{"visual":visual}}))
        .send()
        .await
        .unwrap();
    assert!(response.status().is_success());
    for id in ["simulated-frame", "missing"] {
        let response = client
            .post(&endpoint)
            .bearer_auth(app.session_token())
            .json(&json!({"method":"beacons.source.url","params":{"visual_id":id}}))
            .send()
            .await
            .unwrap();
        let status = response.status();
        let text = response.text().await.unwrap();
        assert!(!text.contains(app.session_token()));
        if id == "missing" {
            let error: cc_types::ErrorEnvelope = serde_json::from_str(&text).unwrap();
            assert_eq!(error.code, ErrorCode::NotFound);
            continue;
        }
        assert!(status.is_success());
        let result: SourceUrlResult = serde_json::from_str(&text).unwrap();
        let url = String::from(result.url);
        assert_eq!(
            url,
            format!("{}beacons/simulated-frame", service.overlay_url())
        );
        let parsed = reqwest::Url::parse(&url).unwrap();
        assert_eq!(parsed.scheme(), "http");
        assert_eq!(parsed.host_str(), Some("localhost"));
        assert_ne!(parsed.port(), Some(address.port()));
        assert!(parsed.username().is_empty());
        assert!(parsed.password().is_none());
        assert!(parsed.query().is_none());
        assert!(parsed.fragment().is_none());
        let page = client.get(&url).send().await.unwrap();
        assert_eq!(page.status(), 200);
        assert!(page.text().await.unwrap().contains("/bundle.js"));
        for route in [
            "rpc",
            "events",
            "beacons/simulated-frame/rpc",
            "beacons/simulated-frame/events",
        ] {
            let target = format!("{}{route}", service.overlay_url());
            assert_eq!(client.get(&target).send().await.unwrap().status(), 404);
            assert_eq!(client.post(&target).send().await.unwrap().status(), 404);
        }
    }
    // The request schema accepts an ID only, never a caller-supplied URL.
    for params in [
        json!({"visual_id":"../rpc"}),
        json!({"visual_id":"simulated-frame","url":"http://remote.example/"}),
    ] {
        let response = client
            .post(&endpoint)
            .bearer_auth(app.session_token())
            .json(&json!({"method":"beacons.source.url","params":params}))
            .send()
            .await
            .unwrap();
        let error: cc_types::ErrorEnvelope = response.json().await.unwrap();
        assert_eq!(error.code, ErrorCode::Invalid);
    }
    app.shutdown();
    server.await.unwrap().unwrap();
}

#[tokio::test]
async fn native_obs_rpc_reads_live_status_creates_owned_source_and_invalidates_changes() {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let seen = Arc::new(Mutex::new(Vec::<Value>::new()));
    let requests = seen.clone();
    let peer = tokio::spawn(async move {
        let mut socket = tokio_tungstenite::accept_async(listener.accept().await.unwrap().0)
            .await
            .unwrap();
        socket
            .send(tokio_tungstenite::tungstenite::Message::Text(
                json!({"op":0,"d":{"rpcVersion":1}}).to_string().into(),
            ))
            .await
            .unwrap();
        let identify = socket.next().await.unwrap().unwrap();
        let identify: Value = serde_json::from_str(identify.to_text().unwrap()).unwrap();
        assert!(identify["d"].get("authentication").is_none());
        socket
            .send(tokio_tungstenite::tungstenite::Message::Text(
                json!({"op":2,"d":{"negotiatedRpcVersion":1}})
                    .to_string()
                    .into(),
            ))
            .await
            .unwrap();
        while let Some(Ok(frame)) = socket.next().await {
            let request: Value = serde_json::from_str(frame.to_text().unwrap()).unwrap();
            let response = if request["d"]["requestType"] == "GetVersion" {
                json!({"obsVersion":"simulated","obsWebSocketVersion":"5-simulated","rpcVersion":1,"availableRequests":["GetVersion","CreateInput"]})
            } else {
                assert_eq!(request["d"]["requestType"], "CreateInput");
                json!({"sceneItemId":1})
            };
            requests.lock().unwrap().push(request.clone());
            socket.send(tokio_tungstenite::tungstenite::Message::Text(json!({"op":7,"d":{
                "requestId":request["d"]["requestId"],"requestType":request["d"]["requestType"],
                "requestStatus":{"result":true,"code":100},"responseData":response
            }}).to_string().into())).await.unwrap();
        }
    });
    let directory = tempfile::tempdir().unwrap();
    let service = NativeServices::new(
        NativeConfig {
            twitch: Default::default(),
            obs: cc_obs::Config {
                port,
                password_label: "simulated-unused-label".into(),
            },
            overlay_port: 0,
        },
        Store::open(directory.path()).unwrap(),
        Arc::new(|_| panic!("no live login")),
    )
    .await
    .unwrap();
    let app = service.app_with_data_dir(64, directory.path()).unwrap();
    let request = parse_request(br#"{"method":"obs.status.get","params":{}}"#).unwrap();
    assert_eq!(
        app.registry.dispatch(&request).await.unwrap(),
        json!({"connected":true})
    );
    let request = parse_request(&serde_json::to_vec(&json!({"method":"obs.source.create","params":{
        "scene_name":"simulated-scene","source_name":"simulated-source","url":service.overlay_url(),"width":1280,"height":720
    }})).unwrap()).unwrap();
    assert_eq!(
        app.registry.dispatch(&request).await.unwrap(),
        json!({"source_name":"simulated-source"})
    );
    let request = parse_request(br#"{"method":"status.get","params":{}}"#).unwrap();
    assert_eq!(
        app.registry.dispatch(&request).await.unwrap()["obs_connected"],
        true
    );
    assert!(
        app.events
            .since(0)
            .unwrap()
            .iter()
            .any(|e| e.kind == EventKind::ObsStatus)
    );
    let source = seen
        .lock()
        .unwrap()
        .iter()
        .find(|v| v["d"]["requestType"] == "CreateInput")
        .unwrap()
        .clone();
    assert_eq!(
        source["d"]["requestData"]["inputSettings"]["url"],
        service.overlay_url()
    );
    let visual = overlay_support::visual(true);
    overlay_support::call(&app, "beacons.visual.upsert", json!({"visual":visual})).await;
    let package = overlay_support::seal(
        overlay_support::package("Simulated source"),
        &Default::default(),
    );
    service
        .accept_beacons_package(package, directory.path(), false)
        .unwrap();
    let url = overlay_support::call(
        &app,
        "beacons.source.url",
        json!({"visual_id":"simulated-frame"}),
    )
    .await["url"]
        .as_str()
        .unwrap()
        .to_owned();
    assert!(url.contains("/beacons/simulated-frame?package_hash="));
    // A sealed, generated draw and verified visual exercise every page variant.
    let module = app.registry.simulated_lots().unwrap();
    overlay_support::call(
        &app,
        "lots.draw.upsert",
        json!({"draw":lots_support::draw()}),
    )
    .await;
    module
        .map_user(cc_store::TwitchUserId::parse("1").unwrap(), "simulated_1")
        .unwrap();
    module
        .intake(
            &"simulated-draw".to_owned().try_into().unwrap(),
            cc_lots::PassedMessage::from_verdict(
                lots_support::facts("1", chrono::Utc::now() - chrono::Duration::seconds(1)),
                cc_types::Verdict::Pass,
            )
            .unwrap(),
        )
        .unwrap();
    overlay_support::call(
        &app,
        "lots.roll.seal",
        json!({"draw_id":"simulated-draw","source":"streamer_commit","margin_s":1}),
    )
    .await;
    let client = overlay_support::client();
    let origin = service.overlay_url();
    let input_count = || {
        seen.lock()
            .unwrap()
            .iter()
            .filter(|v| v["d"]["requestType"] == "CreateInput")
            .count()
    };
    for target in [
        origin.clone(),
        url.clone(),
        format!("{origin}lots/simulated-draw"),
        format!("{origin}lots/simulated-draw?scale=2&anchor=top-left"),
        format!("{origin}lots/simulated-draw?scale=&anchor="),
    ] {
        assert_eq!(
            client.get(&target).send().await.unwrap().status(),
            200,
            "{target}"
        );
        let before = input_count();
        overlay_support::call(&app, "obs.source.create", json!({"scene_name":"simulated-scene","source_name":"simulated-page","url":target,"width":1280,"height":720})).await;
        let seen = seen.lock().unwrap();
        let frames: Vec<_> = seen
            .iter()
            .filter(|v| v["d"]["requestType"] == "CreateInput")
            .collect();
        assert_eq!(frames.len(), before + 1);
        assert_eq!(
            frames.last().unwrap()["d"]["requestData"]["inputSettings"]["url"],
            target
        );
    }
    for path in [
        "beacons/Upper",
        "beacons/a--b",
        "beacons/simulated-frame?other=1",
        "lots/simulated-draw?other=ignored",
        "lots/simulated-draw?package_hash=bad",
        "?scale=2",
        "lots/",
    ] {
        let target = format!("{origin}{path}");
        assert_eq!(
            client.get(&target).send().await.unwrap().status(),
            404,
            "{target}"
        );
        let before = input_count();
        let request = parse_request(&serde_json::to_vec(&json!({"method":"obs.source.create","params":{
            "scene_name":"simulated-scene","source_name":"simulated-refused","url":target,"width":1280,"height":720
        }})).unwrap()).unwrap();
        assert_eq!(
            app.registry.dispatch(&request).await.unwrap_err().code,
            ErrorCode::Invalid
        );
        assert_eq!(input_count(), before);
    }
    // Valid syntax grants no authority to an unsealed draw, even with display keys.
    for path in ["lots/unsealed", "lots/unsealed?scale=&anchor="] {
        let before = input_count();
        let error = service
            .create_source(&cc_types::ObsSourceParams {
                scene_name: "simulated-scene".into(),
                source_name: "simulated-unsealed".into(),
                url: format!("{origin}{path}"),
                width: 1280,
                height: 720,
            })
            .await
            .unwrap_err();
        assert_eq!(error.code, ErrorCode::Invalid);
        assert_eq!(input_count(), before);
    }
    for (width, height) in [(1920, 1080), (1280, 720)] {
        let display_url = format!("{url}&scale=0.5&anchor=br");
        overlay_support::call(&app,"obs.source.create",json!({"scene_name":"simulated-scene","source_name":"simulated-beacons-source","url":display_url,"width":width,"height":height})).await;
        let seen = seen.lock().unwrap();
        let settings = &seen
            .iter()
            .rfind(|v| v["d"]["requestType"] == "CreateInput")
            .unwrap()["d"]["requestData"]["inputSettings"];
        assert_eq!(settings["url"], display_url);
        assert_eq!(settings["width"], width);
        assert_eq!(settings["height"], height);
    }
    let replacement = overlay_support::seal(
        overlay_support::package("Changed simulated source"),
        &Default::default(),
    );
    let new_hash = String::from(replacement.content_hash.clone());
    service
        .accept_beacons_package(replacement, directory.path(), false)
        .unwrap();
    let new_url = overlay_support::call(
        &app,
        "beacons.source.url",
        json!({"visual_id":"simulated-frame"}),
    )
    .await["url"]
        .as_str()
        .unwrap()
        .to_owned();
    assert_ne!(url, new_url);
    assert!(new_url.ends_with(&format!("?package_hash={new_hash}")));
    let before = input_count();
    let stale = service
        .create_source(&cc_types::ObsSourceParams {
            scene_name: "simulated-scene".into(),
            source_name: "simulated-stale".into(),
            url,
            width: 1920,
            height: 1080,
        })
        .await
        .unwrap_err();
    assert_eq!(stale.code, ErrorCode::Invalid);
    assert_eq!(input_count(), before);
    overlay_support::call(&app,"obs.source.create",json!({"scene_name":"simulated-scene","source_name":"simulated-current","url":new_url,"width":1920,"height":1080})).await;
    let cursor = app.events.since(0).unwrap().last().unwrap().seq;
    peer.abort();
    let _ = peer.await;
    assert!(service.obs_status().await.is_err());
    tokio::time::timeout(Duration::from_secs(2), async {
        loop {
            if app
                .events
                .since(cursor)
                .unwrap()
                .iter()
                .any(|e| e.kind == EventKind::ObsStatus)
            {
                break;
            }
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    assert_eq!(
        app.registry.dispatch(&request).await.unwrap()["obs_connected"],
        false
    );
    app.shutdown();
}
