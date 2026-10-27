use super::*;
use crate::launch::BUILT_ORIGIN;
use serde_json::{Value, json};
use std::io::Write;
use std::sync::Mutex;

struct LogWriter(Arc<Mutex<Vec<u8>>>);
impl Write for LogWriter {
    fn write(&mut self, buffer: &[u8]) -> std::io::Result<usize> {
        self.0.lock().unwrap().extend_from_slice(buffer);
        Ok(buffer.len())
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

#[tokio::test(flavor = "current_thread")]
async fn bound_core_injection_has_exact_keys_accepted_origin_and_no_capability_in_logs() {
    let logs = Arc::new(Mutex::new(Vec::new()));
    let writer = logs.clone();
    let subscriber = tracing_subscriber::fmt()
        .without_time()
        .with_ansi(false)
        .with_max_level(tracing::Level::TRACE)
        .with_writer(move || LogWriter(writer.clone()))
        .finish();
    let _subscriber = tracing::subscriber::set_default(subscriber);
    // Default launch never opens a store, keychain or live Twitch/OBS connection.
    let mut host = CoreHost::start(Options::default(), Path::new("unused-store-path"))
        .await
        .unwrap();
    let script = host
        .launch()
        .unwrap()
        .script(&tauri::Url::parse(BUILT_ORIGIN).unwrap())
        .unwrap();
    let serialized = script
        .split_once("window.__CASTLE_CONTROL_LAUNCH__ = ")
        .unwrap()
        .1
        .strip_suffix("; }")
        .unwrap();
    let payload: Value = serde_json::from_str(serialized).unwrap();
    let object = payload.as_object().unwrap();
    assert_eq!(
        object.keys().map(String::as_str).collect::<Vec<_>>(),
        ["endpoint", "mode", "session_token"]
    );
    assert_eq!(payload["mode"], "core");
    assert!(host._services.is_none());
    assert!(host.login.is_none());
    let endpoint = payload["endpoint"].as_str().unwrap();
    let url = tauri::Url::parse(endpoint).unwrap();
    assert_eq!(url.scheme(), "http");
    assert_eq!(url.host_str(), Some("127.0.0.1"));
    assert_eq!(url.port(), Some(host.address.port()));
    assert!(payload["session_token"].as_str() == Some(host.state.session_token()));
    assert_eq!(host.state.session_token().len(), 64);
    assert!(
        host.state
            .session_token()
            .bytes()
            .all(|b| b.is_ascii_hexdigit())
    );
    let client = reqwest::Client::builder().no_proxy().build().unwrap();
    // This exercises the core's actual allowlist, not a copy of that allowlist.
    let preflight = client
        .request(reqwest::Method::OPTIONS, format!("{endpoint}/rpc"))
        .header("Origin", BUILT_ORIGIN)
        .header("Access-Control-Request-Method", "POST")
        .header(
            "Access-Control-Request-Headers",
            "content-type, authorization",
        )
        .send()
        .await
        .unwrap();
    assert_eq!(preflight.status(), 204);
    assert_eq!(
        preflight.headers()["access-control-allow-origin"],
        BUILT_ORIGIN
    );
    let response = client
        .post(format!("{endpoint}/rpc"))
        .header("Origin", BUILT_ORIGIN)
        .bearer_auth(host.state.session_token())
        .json(&json!({"method":"status.get","params":{}}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    assert_eq!(
        response.headers()["access-control-allow-origin"],
        BUILT_ORIGIN
    );
    let status: Value = response.json().await.unwrap();
    assert_eq!(status["twitch_connected"], false);
    assert_eq!(status["obs_connected"], false);
    assert_eq!(status["simulated"], false);
    assert!(status.get("stream").is_none());
    assert!(status.get("gatehouse").is_none());
    let unavailable = client
        .post(format!("{endpoint}/rpc"))
        .header("Origin", BUILT_ORIGIN)
        .bearer_auth(host.state.session_token())
        .json(&json!({"method":"auth.twitch.start","params":{}}))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    assert_eq!(unavailable["code"], "unavailable");
    host.shutdown();
    tokio::time::timeout(std::time::Duration::from_secs(3), &mut host.server)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    {
        let captured = logs.lock().unwrap();
        assert!(String::from_utf8_lossy(&captured).contains("desktop core ready"));
        assert!(
            !captured
                .windows(64)
                .any(|s| s.iter().all(u8::is_ascii_hexdigit))
        );
        assert!(
            !captured
                .windows(64)
                .any(|s| s == host.state.session_token().as_bytes())
        );
    }
    assert_steward_flag_round_trips_as_metadata_without_native_services_or_secrets().await;
}

async fn assert_steward_flag_round_trips_as_metadata_without_native_services_or_secrets() {
    let options = Options::parse(["--steward-live".to_owned()]).unwrap();
    let host = CoreHost::start(options, Path::new("unused-store-path"))
        .await
        .unwrap();
    assert!(host._services.is_none());
    assert!(host.login.is_none());
    let launch = host.launch().unwrap();
    let payload = serde_json::to_value(&launch).unwrap();
    assert_eq!(
        payload
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect::<Vec<_>>(),
        ["endpoint", "mode", "session_token", "steward"]
    );
    assert_eq!(payload["steward"], "live");
    assert_eq!(payload["session_token"], host.state.session_token());
    let script = launch
        .script(&tauri::Url::parse(BUILT_ORIGIN).unwrap())
        .unwrap();
    assert!(script.contains(&serde_json::to_string(&launch).unwrap()));
    for forbidden in ["api_key", "password", "credential", "CODEX", "OPENAI"] {
        assert!(!script.contains(forbidden));
    }
}

#[test]
fn native_permissions_and_network_policy_are_minimal() {
    let config: Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
    let capability: Value =
        serde_json::from_str(include_str!("../capabilities/main-window.json")).unwrap();
    assert_eq!(capability["permissions"], json!([]));
    assert_eq!(capability["windows"], json!(["main"]));
    let csp = &config["app"]["security"]["csp"];
    assert_eq!(csp["connect-src"], "http://127.0.0.1:* ws://127.0.0.1:*");
    assert_eq!(csp["script-src"], "'self'");
    assert_eq!(config["build"]["frontendDist"], "../dist");
    assert_eq!(config["build"]["devUrl"], "http://127.0.0.1:5173");
    assert_eq!(config["app"]["windows"], json!([]));
}
