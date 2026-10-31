//! Generated simulated settings and fake CLI only; no external service or account.
use crate::{AppState, EventHub, NativeConfig, NativeServices, Registry};
use cc_store::Store;
#[cfg(windows)]
use cc_store::{DataStore, LedgerKind};
#[cfg(windows)]
use cc_types::{AskResult, WritStatus};
use cc_types::{ErrorCode, ErrorEnvelope, parse_request};
use serde_json::{Value, json};
use std::sync::Arc;
#[cfg(windows)]
use std::{path::PathBuf, sync::OnceLock};

struct Harness {
    app: Arc<AppState>,
    services: Arc<NativeServices>,
    root: tempfile::TempDir,
}

impl Harness {
    async fn new(live: bool) -> Self {
        let root = tempfile::tempdir().unwrap();
        let services = NativeServices::new(
            NativeConfig {
                twitch: cc_twitch::TwitchConfig {
                    client_id: String::new(),
                    channel: "simulated".into(),
                    modules: vec![],
                },
                obs: cc_obs::Config {
                    port: 0,
                    password_label: "simulated-unused".into(),
                },
                overlay_port: 0,
            },
            Store::open(root.path().join("native")).unwrap(),
            Arc::new(|_| Ok(())),
        )
        .await
        .unwrap();
        // Use the production composition without attach's Twitch/OBS workers.
        let events = Arc::new(EventHub::new(256).unwrap());
        let registry = Registry::with_native_root_and_steward(
            services.clone(),
            root.path(),
            events.clone(),
            live,
        );
        let app = AppState::with_events(registry, events).unwrap();
        Self {
            app,
            services,
            root,
        }
    }

    async fn call(&self, method: &str, params: Value) -> Result<Value, ErrorEnvelope> {
        let request =
            parse_request(&serde_json::to_vec(&json!({"method":method,"params":params})).unwrap())?;
        self.app.registry.dispatch(&request).await
    }

    async fn set(&self, values: Value) -> Result<Value, ErrorEnvelope> {
        self.call("settings.set", json!({"values":values})).await
    }

    async fn ask(&self) -> Result<Value, ErrorEnvelope> {
        self.call(
            "steward.ask",
            json!({"chamber":"lots", "prompt":"simulated cc-fake-scenario:writ-ok"}),
        )
        .await
    }

    #[cfg(windows)]
    async fn proposed(&self) -> AskResult {
        let result = self.ask().await;
        assert!(result.is_ok(), "simulated fake CLI must return a proposal");
        let result: AskResult = serde_json::from_value(result.unwrap()).unwrap();
        assert_eq!(result.writ.status, WritStatus::Proposed);
        result
    }
}

#[tokio::test]
async fn empty_native_settings_launch_and_report_selected_missing_keys() {
    let h = Harness::new(true).await;
    let error = h.ask().await.unwrap_err();
    assert_eq!(error.code, ErrorCode::Unavailable);
    assert_eq!(
        error.message,
        "missing engine settings: engine.claude_exe_path, engine.model_claude"
    );
    assert!(!error.message.contains(h.root.path().to_str().unwrap()));
    assert!(
        h.services
            .store
            .lock()
            .unwrap()
            .engine_settings()
            .unwrap()
            .values
            .is_empty()
    );
}

#[tokio::test]
async fn codex_without_helper_reports_only_its_missing_key_and_no_values() {
    let h = Harness::new(true).await;
    let path = h
        .root
        .path()
        .join("simulated-cli.exe")
        .to_str()
        .unwrap()
        .to_owned();
    let values = json!({
        "engine.cli_provider":"codex_cli", "engine.codex_exe_path":path,
        "engine.model_codex":"simulated-selected", "engine.model_claude":"simulated-unselected",
        "engine.live_endpoint":"http://127.0.0.1:1/simulated-endpoint"
    });
    assert!(h.set(values.clone()).await.is_ok());
    let error = h.ask().await.unwrap_err();
    assert_eq!(error.code, ErrorCode::Unavailable);
    assert_eq!(
        error.message,
        "missing engine settings: engine.posture_helper_path"
    );
    for value in values.as_object().unwrap().values() {
        assert!(!error.message.contains(value.as_str().unwrap()));
    }
}

#[tokio::test]
async fn native_without_opt_in_and_offline_keep_the_unconfigured_steward() {
    let h = Harness::new(false).await;
    let error = h.ask().await.unwrap_err();
    assert_eq!(error.code, ErrorCode::Unavailable);
    assert_eq!(error.message, "no Steward engine is configured");
    let request = parse_request(
        br#"{"method":"steward.ask","params":{"chamber":"lots","prompt":"simulated"}}"#,
    )
    .unwrap();
    for registry in [
        Registry::with_status(),
        Registry::with_native(h.services.clone()),
    ] {
        assert_eq!(
            registry.dispatch(&request).await.unwrap_err().message,
            error.message
        );
    }
}

#[cfg(windows)]
fn fake_cli() -> &'static PathBuf {
    static EXE: OnceLock<PathBuf> = OnceLock::new();
    EXE.get_or_init(|| {
        // A dependency's CARGO_BIN_EXE is not exported to cc-core. Build the
        // existing fixture with captured diagnostics, never run a real CLI.
        let output = std::process::Command::new("cargo")
            .current_dir(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../.."))
            .args([
                "build",
                "--offline",
                "--locked",
                "-p",
                "cc-engine",
                "--bin",
                "fake-cli",
                "--message-format=json",
            ])
            .output()
            .expect("fake CLI build must start");
        assert!(output.status.success(), "fake CLI build must succeed");
        String::from_utf8(output.stdout)
            .unwrap()
            .lines()
            .find_map(|line| {
                let artifact: Value = serde_json::from_str(line).ok()?;
                if artifact["reason"] == "compiler-artifact"
                    && artifact["target"]["name"] == "fake-cli"
                {
                    artifact["executable"].as_str().map(PathBuf::from)
                } else {
                    None
                }
            })
            .expect("fake CLI artifact must be present")
    })
}

#[cfg(windows)]
#[tokio::test]
async fn no_keychain_fake_cli_and_settings_completion_rebuild_without_restart() {
    let h = Harness::new(true).await;
    assert_eq!(h.ask().await.unwrap_err().code, ErrorCode::Unavailable);
    let mut values = json!({
        "engine.cli_provider":"claude_cli", "engine.claude_exe_path":fake_cli().to_str().unwrap(),
        "engine.model_claude":"simulated-first"
    });
    assert!(h.set(values.clone()).await.is_ok());
    let first = h.proposed().await;
    {
        let store = h.services.store.lock().unwrap();
        assert_eq!(
            store.configuration_items(DataStore::Writs).unwrap().len(),
            1
        );
        assert_eq!(store.read_ledger(LedgerKind::Engine).unwrap().len(), 1);
    }
    // A failed replacement cannot disturb the engine used by the next ask.
    assert!(h.set(json!({"engine.model_claude": false})).await.is_err());
    h.proposed().await;
    // Concurrent asks share the same native Store lock even though each builds
    // a fresh runtime/SpawnDoor. Neither can bypass the single-process cap.
    let (second, third) = tokio::join!(h.ask(), h.ask());
    assert!(second.is_ok() && third.is_ok());
    values["engine.model_claude"] = json!("simulated-second");
    assert!(h.set(values).await.is_ok());
    h.proposed().await;
    {
        let store = h.services.store.lock().unwrap();
        let ledger = store.read_ledger(LedgerKind::Engine).unwrap();
        for (line, expected) in ledger.iter().zip([
            "simulated-first",
            "simulated-first",
            "simulated-first",
            "simulated-first",
            "simulated-second",
        ]) {
            let cc_store::LedgerEvent::Engine { model_selected, .. } = &line.event else {
                panic!("expected engine audit")
            };
            assert!(model_selected.as_str() == expected);
        }
        assert_eq!(ledger.len(), 5);
    }
    // Purge uses precisely the SettingsModule/NativeServices Store inventory.
    h.services
        .store
        .lock()
        .unwrap()
        .purge_all(cc_store::Timestamp::now())
        .unwrap();
    let error = h
        .call("steward.writ.tear", json!({"writ_id":first.writ.writ_id}))
        .await
        .unwrap_err();
    assert_eq!(error.code, ErrorCode::NotFound);
    assert_eq!(h.ask().await.unwrap_err().code, ErrorCode::Unavailable);
}

#[test]
fn native_never_selects_a_key_label_from_live_endpoint_or_cloud_opt_in() {
    use cc_types::{DataValue, Settings};

    let root = tempfile::tempdir().unwrap();
    let store = Arc::new(std::sync::Mutex::new(
        Store::open(root.path().join("native")).unwrap(),
    ));
    for provider in ["claude_cli", "codex_cli"] {
        for endpoint in ["http://127.0.0.1:11434/v1", "https://api.openai.com/v1"] {
            for enabled in [false, true] {
                store
                    .lock()
                    .unwrap()
                    .set_engine_settings(&Settings {
                        values: [
                            (
                                "engine.cli_provider".into(),
                                DataValue::String(provider.into()),
                            ),
                            (
                                "engine.live_endpoint".into(),
                                DataValue::String(endpoint.into()),
                            ),
                            ("engine.cloud_opt_in".into(), DataValue::Bool(enabled)),
                        ]
                        .into(),
                    })
                    .unwrap();
                let module =
                    super::StewardModule::native(store.clone(), root.path().join("process"));
                assert!(module.config.as_ref().unwrap().key_label.is_none());
            }
        }
    }
}

#[cfg(windows)]
#[tokio::test]
async fn native_cli_calls_never_load_a_key_even_with_cloud_settings() {
    struct RejectKeys;
    impl cc_engine::Keychain for RejectKeys {
        fn load(&self, _: &str) -> cc_engine::Result<String> {
            panic!("native subscription CLI must never request a key")
        }
    }

    let root = tempfile::tempdir().unwrap();
    let store = Arc::new(std::sync::Mutex::new(
        Store::open(root.path().join("native")).unwrap(),
    ));
    let mut module = super::StewardModule::native(store.clone(), root.path().join("process"));
    let mut config = module.config.take().unwrap();
    assert!(config.key_label.is_none());
    // Only the fake is reachable by engine calls in this test.
    config.vault = Arc::new(RejectKeys);
    let registry = Registry::with_fixture_root(
        root.path().join("modules"),
        Arc::new(EventHub::new(32).unwrap()),
    )
    .unwrap()
    .with_steward(config);
    for provider in ["claude_cli", "codex_cli"] {
        for endpoint in ["http://127.0.0.1:11434/v1", "https://api.openai.com/v1"] {
            for enabled in [false, true] {
                let settings = serde_json::from_value(json!({"values": {
                    "engine.cli_provider":provider,
                    "engine.claude_exe_path":fake_cli(),
                    "engine.codex_exe_path":fake_cli(),
                    "engine.posture_helper_path":fake_cli(),
                    "engine.model_claude":"simulated-selected",
                    "engine.model_codex":"simulated-selected",
                    "engine.live_endpoint":endpoint,
                    "engine.cloud_opt_in":enabled
                }}))
                .unwrap();
                store
                    .lock()
                    .unwrap()
                    .set_engine_settings(&settings)
                    .unwrap();
                let request = parse_request(br#"{"method":"steward.ask","params":{"chamber":"lots","prompt":"simulated cc-fake-scenario:writ-ok"}}"#).unwrap();
                assert!(registry.dispatch(&request).await.is_ok());
            }
        }
    }
}
