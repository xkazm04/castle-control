use cc_types::*;
use serde_json::{Value, json};

fn settings(values: Value) -> Settings {
    serde_json::from_value(json!({"values":values})).unwrap()
}

#[test]
fn defaults_are_local_cloud_off_and_development_cli_provider() {
    assert_eq!(
        parse_engine_settings(&settings(json!({}))).unwrap(),
        EngineSettings::default()
    );
    let default = EngineSettings::default();
    assert_eq!(default.cli_provider, CliProvider::ClaudeCli);
    assert_eq!(default.live_endpoint, "http://127.0.0.1:11434/v1");
    assert!(!default.cloud_opt_in);
    assert_eq!(default.claude_exe_path, None);
    assert_eq!(default.codex_exe_path, None);
    assert_eq!(default.posture_helper_path, None);
    assert_eq!(default.model_local, None);
    assert_eq!(default.model_claude, None);
    assert_eq!(default.model_codex, None);
    assert_eq!(
        parse_engine_settings(&settings(json!({"unrelated":"simulated"}))).unwrap(),
        default
    );
}

#[test]
fn typed_parser_reads_all_keys_without_changing_call_sites() {
    for provider in ["claude_cli", "codex_cli"] {
        for endpoint in [
            "http://localhost:1234/v1",
            "http://[::1]:11434/v1",
            "http://127.0.0.1:11434/v1",
            "https://api.openai.com/v1",
            "https://example.test/v1?mode=simulated%20test",
        ] {
            let parsed = parse_engine_settings(&settings(json!({
                "engine.cli_provider":provider, "engine.live_endpoint":endpoint, "engine.cloud_opt_in":true
            }))).unwrap();
            assert_eq!(
                serde_json::to_value(parsed.cli_provider).unwrap(),
                json!(provider)
            );
            assert_eq!(parsed.live_endpoint, endpoint);
            assert!(parsed.cloud_opt_in);
        }
    }
}

#[test]
fn invalid_values_produce_invalid_envelopes_without_echoing_input() {
    for (key, values) in [
        (
            "engine.cli_provider",
            vec![json!("unknown"), json!(true), json!({}), json!(1)],
        ),
        (
            "engine.cloud_opt_in",
            vec![json!("true"), json!(0), json!([])],
        ),
        (
            "engine.live_endpoint",
            vec![
                json!(false),
                json!(42),
                json!(""),
                json!("not-a-url"),
                json!("ftp://localhost"),
                json!("http://"),
                json!("http://localhost:"),
                json!("http://localhost:65536"),
                json!("http://[::1]garbage]"),
                json!("http://[::1"),
                json!("http://bad host/v1"),
                json!("http://127.0.0.999"),
                json!("http://user:simulated@localhost"),
                json!("http://localhost/v1%Q1"),
                json!("http://localhost/v1#fragment"),
                json!("http://localhost../v1"),
                json!("http://localhost/<invalid>"),
                json!("http://localhost/v1|invalid"),
                json!("http://localhost/\n"),
            ],
        ),
    ] {
        for value in values {
            let error = parse_engine_settings(&settings(json!({key:value}))).unwrap_err();
            assert_eq!(error.code, ErrorCode::Invalid);
            assert_eq!(error.message, format!("invalid {key}"));
        }
    }
    for key in [
        "engine.cli_provider",
        "engine.live_endpoint",
        "engine.cloud_opt_in",
    ] {
        assert!(serde_json::from_value::<Settings>(json!({"values":{key:null}})).is_err());
    }
    for invalid in [json!(null), json!("unknown"), json!(0)] {
        assert!(serde_json::from_value::<CliProvider>(invalid).is_err());
    }
}

const PATH_KEYS: [&str; 3] = [
    "engine.claude_exe_path",
    "engine.codex_exe_path",
    "engine.posture_helper_path",
];
const MODEL_KEYS: [&str; 3] = [
    "engine.model_local",
    "engine.model_claude",
    "engine.model_codex",
];

fn simulated_path(name: &str) -> String {
    let root = if cfg!(windows) {
        "C:/simulated"
    } else {
        "/simulated"
    };
    format!("{root}/{name}")
}

#[test]
fn optional_engine_values_survive_settings_round_trip_without_normalization() {
    let claude = simulated_path("CLI tools/claude.exe");
    let codex = simulated_path("codex.exe");
    let helper = simulated_path("cc-engine-posture.exe");
    let source = settings(json!({
        "engine.claude_exe_path":claude,
        "engine.codex_exe_path":codex,
        "engine.posture_helper_path":helper,
        "engine.model_local":"simulated/local:latest",
        "engine.model_claude":"simulated-claude",
        "engine.model_codex":"simulated-codex",
    }));
    let encoded = serde_json::to_string(&source).unwrap();
    let decoded: Settings = serde_json::from_str(&encoded).unwrap();
    let parsed = parse_engine_settings(&decoded).unwrap();
    assert_eq!(
        parsed,
        EngineSettings {
            claude_exe_path: Some(claude),
            codex_exe_path: Some(codex),
            posture_helper_path: Some(helper),
            model_local: Some("simulated/local:latest".into()),
            model_claude: Some("simulated-claude".into()),
            model_codex: Some("simulated-codex".into()),
            ..EngineSettings::default()
        }
    );
    assert_eq!(parse_engine_settings(&source).unwrap(), parsed);
    assert_eq!(serde_json::to_string(&decoded).unwrap(), encoded);
}

#[test]
fn omitted_keys_stay_absent_when_only_one_optional_value_is_present() {
    let path = simulated_path("cli.exe");
    for key in PATH_KEYS.into_iter().chain(MODEL_KEYS) {
        let value = if PATH_KEYS.contains(&key) {
            path.clone()
        } else {
            "x".repeat(128)
        };
        let source = settings(json!({key:value}));
        let parsed = parse_engine_settings(&source).unwrap();
        for (index, field) in [
            parsed.claude_exe_path,
            parsed.codex_exe_path,
            parsed.posture_helper_path,
            parsed.model_local,
            parsed.model_claude,
            parsed.model_codex,
        ]
        .iter()
        .enumerate()
        {
            let field_key = PATH_KEYS.into_iter().chain(MODEL_KEYS).nth(index).unwrap();
            assert_eq!(
                field.as_deref(),
                (field_key == key).then_some(value.as_str())
            );
        }
        assert_eq!(source.values.len(), 1);
        assert!(serde_json::from_value::<Settings>(json!({"values":{key:null}})).is_err());
    }
}

#[test]
fn executable_paths_refuse_relative_empty_control_and_wrong_type_values() {
    for key in PATH_KEYS {
        for value in [
            json!("simulated/cli.exe"),
            json!("./simulated/cli.exe"),
            json!(""),
            json!("C:simulated/cli.exe"),
            json!("C:/simulated/cli\n.exe"),
            json!("/simulated/cli\u{0085}.exe"),
            json!(format!("{}\u{0000}", simulated_path("cli.exe"))),
            json!(format!("{}\u{0085}", simulated_path("cli.exe"))),
            json!(true),
            json!(42),
            json!([]),
            json!({}),
        ] {
            assert_invalid_setting(key, value);
        }
        if cfg!(windows) {
            // Rooted paths without a drive still depend on ambient process state.
            assert_invalid_setting(key, json!("\\simulated\\cli.exe"));
        }
    }
}

#[test]
fn model_ids_refuse_empty_whitespace_controls_non_ascii_and_wrong_type_values() {
    for key in MODEL_KEYS {
        for value in [
            json!(""),
            json!("simulated model"),
            json!(" simulated"),
            json!("simulated\tmodel"),
            json!("simulated\nmodel"),
            json!("simulated\u{007f}"),
            json!("simulated\u{00a0}model"),
            json!("simulated\u{200b}model"),
            json!("x".repeat(129)),
            json!(false),
            json!(7),
            json!([]),
            json!({}),
        ] {
            assert_invalid_setting(key, value);
        }
    }
}

fn assert_invalid_setting(key: &str, value: Value) {
    let error = parse_engine_settings(&settings(json!({key:value}))).unwrap_err();
    assert_eq!(
        serde_json::to_value(error).unwrap(),
        json!({"code":"invalid", "message":format!("invalid {key}")}),
        "errors must identify only the key, never echo the refused input"
    );
}
