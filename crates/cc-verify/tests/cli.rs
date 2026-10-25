use cc_verify::{Entry, SealedRoll};
use std::{fs, process::Command};

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
