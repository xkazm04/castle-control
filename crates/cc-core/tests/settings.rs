//! Generated, simulated settings only; no program, model or endpoint is contacted.
use cc_core::{AppState, EventHub, Registry, bind};
use cc_types::{ErrorCode, ErrorEnvelope, parse_request};
use serde_json::{Value, json};
use std::{path::Path, sync::Arc};

fn registry(root: &Path) -> Registry {
    Registry::with_fixture_root(root, Arc::new(EventHub::new(16).unwrap())).unwrap()
}

async fn call(registry: &Registry, method: &str, params: Value) -> Result<Value, ErrorEnvelope> {
    let request =
        parse_request(&serde_json::to_vec(&json!({"method":method,"params":params})).unwrap())
            .unwrap();
    registry.dispatch(&request).await
}

#[tokio::test]
async fn settings_set_get_round_trip_persists_across_registry_restart() {
    let dir = tempfile::tempdir().unwrap();
    let app = registry(dir.path());
    assert_eq!(
        call(&app, "settings.get", json!({})).await.unwrap(),
        json!({"values":{}})
    );
    let settings = json!({"values": {
        "engine.cli_provider":"codex_cli",
        "engine.cloud_opt_in":false,
        "engine.live_endpoint":"http://127.0.0.1:11434/v1",
        "engine.codex_exe_path":dir.path().join("simulated-codex.exe"),
        "engine.posture_helper_path":dir.path().join("simulated-helper.exe"),
        "engine.model_codex":"simulated-model"
    }});
    assert_eq!(
        call(&app, "settings.set", settings.clone()).await.unwrap(),
        settings
    );
    assert_eq!(
        call(&app, "settings.get", json!({})).await.unwrap(),
        settings
    );
    drop(app);
    let reopened = registry(dir.path());
    assert_eq!(
        call(&reopened, "settings.get", json!({})).await.unwrap(),
        settings
    );
    assert_eq!(
        call(&reopened, "settings.set", json!({"values":{}}))
            .await
            .unwrap(),
        json!({"values":{}})
    );
}

#[tokio::test]
async fn invalid_or_unknown_settings_rpc_leaves_the_whole_map_unchanged() {
    let dir = tempfile::tempdir().unwrap();
    let app = registry(dir.path());
    let initial = json!({"values":{"engine.cli_provider":"codex_cli"}});
    call(&app, "settings.set", initial.clone()).await.unwrap();
    for values in [
        json!({"engine.cli_provider":"claude_cli", "engine.cloud_opt_in":"false"}),
        json!({"engine.cli_provider":"claude_cli", "engine.unrecognized":true}),
        json!({"engine.cli_provider":"unsupported"}),
        json!({"engine.codex_exe_path":"simulated-relative.exe"}),
        json!({"engine.live_endpoint":"https://user:password@example.invalid"}),
        json!({"retention_s":86400}),
    ] {
        let error = call(&app, "settings.set", json!({"values":values}))
            .await
            .unwrap_err();
        assert_eq!(error.code, ErrorCode::Invalid);
        assert!(!error.message.contains("password"));
        assert!(!error.message.contains("simulated-relative"));
        assert_eq!(
            call(&app, "settings.get", json!({})).await.unwrap(),
            initial
        );
    }
}

#[tokio::test]
async fn tokenless_settings_set_is_refused_and_writes_nothing() {
    let dir = tempfile::tempdir().unwrap();
    let events = Arc::new(EventHub::new(16).unwrap());
    let fixture = Registry::with_fixture_root(dir.path(), events.clone()).unwrap();
    let app = AppState::with_events(fixture, events).unwrap();
    let initial = json!({"values":{"engine.cli_provider":"codex_cli"}});
    call(&app.registry, "settings.set", initial.clone())
        .await
        .unwrap();
    let (address, server) = bind(app.clone(), ([127, 0, 0, 1], 0).into()).await.unwrap();
    let task = tokio::spawn(server);
    let client = reqwest::Client::new();
    let url = format!("http://{address}/rpc");
    let body = json!({"method":"settings.set", "params":{"values":{
        "engine.cli_provider":"claude_cli",
        "engine.codex_exe_path":dir.path().join("simulated-program.exe")
    }}});
    for token in [None, Some("simulated-wrong-capability")] {
        let mut request = client.post(&url).json(&body);
        if let Some(token) = token {
            request = request.bearer_auth(token);
        }
        let response = request.send().await.unwrap();
        assert_eq!(response.status(), reqwest::StatusCode::UNAUTHORIZED);
        assert_eq!(
            response.json::<ErrorEnvelope>().await.unwrap().code,
            ErrorCode::Unauthorized
        );
        assert_eq!(
            call(&app.registry, "settings.get", json!({}))
                .await
                .unwrap(),
            initial
        );
    }
    let response = client
        .post(&url)
        .bearer_auth(app.session_token())
        .json(&body)
        .send()
        .await
        .unwrap();
    assert!(response.status().is_success());
    assert_eq!(response.json::<Value>().await.unwrap(), body["params"]);
    assert_eq!(
        call(&app.registry, "settings.get", json!({}))
            .await
            .unwrap(),
        body["params"]
    );
    app.shutdown();
    tokio::time::timeout(std::time::Duration::from_secs(3), task)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    drop(app);
    let reopened = registry(dir.path());
    assert_eq!(
        call(&reopened, "settings.get", json!({})).await.unwrap(),
        body["params"]
    );
}
