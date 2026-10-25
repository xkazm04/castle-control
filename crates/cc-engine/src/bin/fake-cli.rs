//! Offline test fixture. Native binary; never invokes a real model or coding CLI.
use std::io::{Read, Write};

fn main() {
    let args: Vec<_> = std::env::args().skip(1).collect();
    if args.first().map(String::as_str) == Some("descendant") {
        std::thread::sleep(std::time::Duration::from_secs(60));
        return;
    }
    if args.first().map(String::as_str) == Some("supervise") {
        supervise();
        return;
    }
    // Assertions come from the receiving child, not from the parent's argv object.
    assert!(std::env::var_os("CC_PARENT_SENTINEL").is_none());
    assert!(std::env::var_os("CLAUDE_CODE_PLUGIN_DIRS").is_none());
    assert!(std::env::var_os("OPENAI_API_KEY").is_none());
    assert!(std::env::var_os("PATH").is_none());
    assert!(!args.iter().any(|arg| arg.starts_with("--dangerously-")));
    if args == ["--version"] {
        println!("fake-cli 1.2.3");
        return;
    }
    if args.first().map(String::as_str) == Some("auth") {
        println!("{{\"loggedIn\":true,\"email\":\"simulated@example.invalid\"}}");
        return;
    }
    if args == ["login", "status"] {
        return;
    }
    if args.first().map(String::as_str) == Some("sandbox") {
        assert!(args.iter().any(|arg| arg == "sandbox_mode=\"read-only\""));
        println!("cc-read-only-probe-v1");
        return;
    }
    let codex = args.first().map(String::as_str) == Some("exec");
    if codex {
        assert!(args.windows(2).any(|p| p == ["-s", "read-only"]));
        assert_eq!(args.last().map(String::as_str), Some("-"));
        assert!(std::env::var_os("ANTHROPIC_API_KEY").is_none());
    } else {
        assert_eq!(args.first().map(String::as_str), Some("-p"));
        assert!(args.windows(2).any(|p| p == ["--tools", ""]));
        assert!(args.windows(2).any(|p| p == ["--setting-sources", ""]));
        assert!(args.windows(2).any(|p| p == ["--permission-mode", "plan"]));
        assert!(std::env::var_os("CODEX_API_KEY").is_none());
    }
    // Each call starts in its own empty neutral working directory.
    assert_eq!(
        std::fs::read_dir(std::env::current_dir().unwrap())
            .unwrap()
            .count(),
        0
    );
    let mut prompt = String::new();
    std::io::stdin().read_to_string(&mut prompt).unwrap();
    let descendant = if prompt == "simulated descendant" {
        Some(
            std::process::Command::new(std::env::current_exe().unwrap())
                .arg("descendant")
                .stdin(std::process::Stdio::null())
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .spawn()
                .unwrap()
                .id(),
        )
    } else {
        None
    };
    let answer = descendant
        .map(|pid| format!("simulated descendant {pid}"))
        .unwrap_or("simulated answer".into());
    assert!(!args.iter().any(|arg| arg == &prompt));
    if prompt == "simulated hang" {
        std::thread::sleep(std::time::Duration::from_secs(60));
        return;
    }
    if prompt == "simulated malformed" {
        println!("invalid-json");
        return;
    }
    if prompt == "simulated overflow" {
        std::io::stdout().write_all(&vec![b'x'; 1_048_577]).unwrap();
        return;
    }
    if prompt == "simulated key witness" {
        let variable = if codex {
            "CODEX_API_KEY"
        } else {
            "ANTHROPIC_API_KEY"
        };
        assert_eq!(
            std::env::var(variable).unwrap(),
            format!("{}-{}", "simulated", "child-only")
        );
    }
    if codex {
        println!("{{\"type\":\"thread.started\",\"thread_id\":\"simulated-thread\"}}");
        println!("{{\"type\":\"item.started\",\"item\":{{\"type\":\"reasoning\"}}}}");
        println!(
            "{}",
            serde_json::json!({"type":"item.completed","item":{
            "type":"agent_message", "text":answer,"model":"simulated-served"}})
        );
        if prompt == "simulated failure" {
            println!("{{\"type\":\"turn.failed\",\"error\":{{\"message\":\"redact this\"}}}}");
        } else {
            println!(
                "{{\"type\":\"turn.completed\",\"usage\":{{\"input_tokens\":10,\"output_tokens\":20}}}}"
            );
        }
    } else {
        println!(
            "{{\"type\":\"system\",\"subtype\":\"init\",\"session_id\":\"simulated-thread\",\"model\":\"simulated-served\",\"permissionMode\":\"plan\"}}"
        );
        if prompt == "simulated failure" {
            println!("{{\"type\":\"result\",\"subtype\":\"error\",\"is_error\":true}}");
        } else {
            println!(
                "{}",
                serde_json::json!({"type":"result","subtype":"success",
                "is_error":false,"result":answer,"total_cost_usd":0.00005})
            );
        }
    }
    if prompt == "simulated nonzero" {
        std::process::exit(4);
    }
}

fn supervise() {
    use cc_engine::{
        CliExecutables, CliRuntime, Keychain, ModelName, NoKeychain, RoutingTable, SpawnDoor,
    };
    struct Vault;
    impl Keychain for Vault {
        fn load(&self, label: &str) -> cc_engine::Result<String> {
            assert_eq!(label, "simulated-vault-label");
            Ok(format!("{}-{}", "simulated", "child-only"))
        }
    }
    let args: Vec<_> = std::env::args().collect();
    let root = std::path::Path::new(&args[2]);
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    runtime.block_on(async {
        let exe = std::env::current_exe().unwrap();
        let cli = CliRuntime::new(
            SpawnDoor::new(root.join("process")).unwrap(),
            CliExecutables {
                claude: exe.clone(),
                codex: exe.clone(),
                posture_probe: exe,
            },
            1,
        )
        .unwrap();
        for provider in [
            cc_types::CliProvider::ClaudeCli,
            cc_types::CliProvider::CodexCli,
        ] {
            let probe = cli.probe(provider, None, &NoKeychain).await.unwrap();
            assert!(probe.installed && probe.signed_in);
        }
        for provider in ["claude_cli", "codex_cli"] {
            let settings = cc_types::Settings {
                values: [(
                    "engine.cli_provider".into(),
                    cc_types::DataValue::String(provider.into()),
                )]
                .into(),
            };
            let exe = std::env::current_exe().unwrap();
            let door = SpawnDoor::new(root.join(provider)).unwrap();
            let cli = CliRuntime::new(
                door,
                CliExecutables {
                    claude: exe.clone(),
                    codex: exe.clone(),
                    posture_probe: exe,
                },
                1,
            )
            .unwrap();
            let model = ModelName::parse("simulated-selected").unwrap();
            let engine = cc_engine::Engine::new(
                &settings,
                RoutingTable::new(model.clone(), model.clone(), model),
                Some(cli),
            )
            .unwrap();
            let mut store = cc_store::Store::open(root.join(format!("store-{provider}"))).unwrap();
            let reply = engine
                .complete(
                    cc_engine::Call {
                        class: cc_engine::EngineClass::Batch,
                        prompt: "simulated key witness",
                        rules_verdict: None,
                    },
                    &mut store,
                    &Vault,
                    Some("simulated-vault-label"),
                )
                .await
                .unwrap();
            assert_eq!(reply.outcome.label(), "model");
        }
    });
}
