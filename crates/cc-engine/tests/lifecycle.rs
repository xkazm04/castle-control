#![cfg(windows)]
mod common;
use cc_engine::{Call, Engine, EngineClass, Failure, NoKeychain, Outcome, SpawnDoor};
use cc_store::{LedgerKind, Store};

#[tokio::test]
async fn both_providers_probe_installed_version_and_login_through_spawn_door() {
    let dir = tempfile::tempdir().unwrap();
    let cli = common::cli(dir.path());
    for provider in [
        cc_types::CliProvider::ClaudeCli,
        cc_types::CliProvider::CodexCli,
    ] {
        let probe = cli.probe(provider, None, &NoKeychain).await.unwrap();
        assert!(probe.installed && probe.signed_in);
        assert_eq!(probe.version.as_deref(), Some("1.2.3"));
    }
}
#[test]
fn startup_sweeps_stale_owned_markers_and_refuses_second_owner() {
    let root = tempfile::tempdir().unwrap();
    let stale = root.path().join(ulid::Ulid::new().to_string());
    std::fs::create_dir(&stale).unwrap();
    let door = SpawnDoor::new(root.path()).unwrap();
    assert!(!stale.exists());
    assert!(SpawnDoor::new(root.path()).is_err());
    drop(door);
    assert!(SpawnDoor::new(root.path()).is_ok());
}
#[tokio::test]
async fn silence_timeout_reaps_child_and_releases_the_process_permit() {
    let dir = tempfile::tempdir().unwrap();
    let cli = common::cli(&dir.path().join("process"))
        .with_ceilings(3_000, 300)
        .unwrap();
    let engine = Engine::new(
        &common::settings("claude_cli", "http://127.0.0.1:1/v1"),
        common::table(),
        Some(cli),
    )
    .unwrap();
    let mut store = Store::open(dir.path().join("store")).unwrap();
    let reply = engine
        .complete(
            Call {
                class: EngineClass::Batch,
                prompt: "simulated hang",
                rules_verdict: None,
            },
            &mut store,
            &NoKeychain,
            None,
        )
        .await
        .unwrap();
    assert!(matches!(
        reply.outcome,
        Outcome::Refused {
            reason: Failure::Timeout
        }
    ));
    let reply = engine
        .complete(
            Call {
                class: EngineClass::Batch,
                prompt: "simulated request",
                rules_verdict: None,
            },
            &mut store,
            &NoKeychain,
            None,
        )
        .await
        .unwrap();
    assert_eq!(reply.outcome.label(), "model");
    assert_eq!(store.read_ledger(LedgerKind::Engine).unwrap().len(), 2);
}
#[tokio::test]
async fn windows_job_kills_descendants_after_successful_parent_exit() {
    use windows_sys::Win32::{
        Foundation::{CloseHandle, WAIT_OBJECT_0},
        System::Threading::{OpenProcess, PROCESS_SYNCHRONIZE, WaitForSingleObject},
    };
    for provider in ["claude_cli", "codex_cli"] {
        let dir = tempfile::tempdir().unwrap();
        let engine = common::engine(provider, &dir.path().join("process"));
        let mut store = Store::open(dir.path().join("store")).unwrap();
        let reply = engine
            .complete(
                Call {
                    class: EngineClass::Batch,
                    prompt: "simulated descendant",
                    rules_verdict: None,
                },
                &mut store,
                &NoKeychain,
                None,
            )
            .await
            .unwrap();
        let Outcome::Model { text } = reply.outcome else {
            panic!("fake parent failed");
        };
        let pid: u32 = text
            .strip_prefix("simulated descendant ")
            .unwrap()
            .parse()
            .unwrap();
        // SAFETY: query/wait only; never attempt to kill a process by a recycled PID.
        let handle = unsafe { OpenProcess(PROCESS_SYNCHRONIZE, 0, pid) };
        if !handle.is_null() {
            let result = unsafe { WaitForSingleObject(handle, 5_000) };
            unsafe {
                CloseHandle(handle);
            }
            assert_eq!(result, WAIT_OBJECT_0, "descendant survived job close");
        }
    }
}
