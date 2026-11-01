use cc_verify::{Entry, SealedRoll};
use std::{fs, process::Command};

#[test]
fn cli_separates_usage_and_input_errors_from_verification_failure() {
    let usage = Command::new(env!("CARGO_BIN_EXE_cc-verify"))
        .output()
        .unwrap();
    let stderr = String::from_utf8(usage.stderr).unwrap();
    assert_eq!(usage.status.code(), Some(64));
    assert!(stderr.starts_with("Usage:"), "{stderr}");
    assert!(!stderr.contains("Unverified"), "{stderr}");
    let missing = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("no-such-writ.json");
    let unreadable = Command::new(env!("CARGO_BIN_EXE_cc-verify"))
        .arg(missing)
        .output()
        .unwrap();
    let stderr = String::from_utf8(unreadable.stderr).unwrap();
    assert_eq!(unreadable.status.code(), Some(66));
    assert!(stderr.starts_with("Unreadable input:"), "{stderr}");
    assert!(!stderr.contains("Unverified"), "{stderr}");
}

#[test]
fn cli_accepts_offline_writ_and_rejects_tampering() {
    let seed = [11; 32];
    let sealed = SealedRoll::streamer(
        vec![Entry {
            handle: "simulated_viewer".into(),
            weight: 1,
        }],
        1,
        "2026-10-25T12:00:00Z".into(),
        6,
        SealedRoll::commitment(&seed),
    )
    .unwrap();
    let writ = sealed.finish_streamer(seed).unwrap().to_json().unwrap();
    let directory =
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../target/cc-verify-cli-test");
    fs::create_dir_all(&directory).unwrap();
    let file = directory.join(format!("simulated-{}.json", std::process::id()));
    fs::write(&file, &writ).unwrap();
    let good = Command::new(env!("CARGO_BIN_EXE_cc-verify"))
        .arg(&file)
        .output()
        .unwrap();
    fs::write(
        &file,
        writ.replace(
            "\"winners\":[\"simulated_viewer\"]",
            "\"winners\":[\"intruder\"]",
        ),
    )
    .unwrap();
    let bad = Command::new(env!("CARGO_BIN_EXE_cc-verify"))
        .arg(&file)
        .output()
        .unwrap();
    fs::remove_file(file).unwrap();
    assert!(good.status.success());
    let result: serde_json::Value = serde_json::from_slice(&good.stdout).unwrap();
    assert_eq!(result["label"], "streamer-controlled");
    assert_eq!(result["winners"], serde_json::json!(["simulated_viewer"]));
    assert_eq!(bad.status.code(), Some(2));
    assert!(
        String::from_utf8(bad.stderr)
            .unwrap()
            .contains("Unverified")
    );
    assert!(bad.stdout.is_empty());
}
