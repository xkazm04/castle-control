use cc_core::spike::{Options, STEPS, report};
fn args() -> Vec<String> {
    [
        "--client-id",
        "simulated-public-client",
        "--test-channel",
        "simulated_owner",
        "--scene",
        "simulated-scene",
        "--obs-password-label",
        "simulated-label",
        "--data-dir",
        "simulated-unused-path",
    ]
    .into_iter()
    .map(String::from)
    .collect()
}
#[test]
fn spike_refuses_armed_timeout_without_explicit_target_before_side_effects() {
    assert!(
        Options::parse(args())
            .unwrap_err()
            .contains("--target-login")
    );
    let mut args = args();
    args.extend(["--target-login".into(), "simulated_viewer".into()]);
    assert_eq!(
        Options::parse(args).unwrap().target_login,
        "simulated_viewer"
    );
}
#[test]
fn spike_rejects_broadcaster_invalid_duplicate_and_implicit_targets() {
    for target in [
        "",
        "simulated_owner",
        "SIMULATED_OWNER",
        "bad login",
        "--scene",
    ] {
        let mut args = args();
        args.extend(["--target-login".into(), target.into()]);
        assert!(Options::parse(args).is_err());
    }
    let mut repeated = args();
    repeated.extend(
        [
            "--target-login",
            "simulated_one",
            "--target-login",
            "simulated_two",
        ]
        .map(String::from),
    );
    assert!(Options::parse(repeated).is_err());
}
#[test]
fn step_reports_are_pasteable_timestamped_and_payload_free() {
    for step in STEPS {
        for passed in [true, false] {
            let line = report(step, passed);
            let mut fields = line.split_whitespace();
            let at = fields.next().unwrap().to_string();
            assert!(cc_types::Timestamp::try_from(at).is_ok());
            assert_eq!(fields.next(), Some(if passed { "PASS" } else { "FAIL" }));
            assert_eq!(fields.next(), Some(step));
            assert!(fields.next().is_none());
        }
    }
}
#[test]
fn target_matching_uses_verified_login_never_the_display_name_and_rejects_mods() {
    let mut ingress = cc_core::ChatIngress {
        login: "other_login".into(),
        message: cc_twitch::ChatMessage {
            id: "simulated-message".into(),
            at: "2026-10-25T10:00:00Z".into(),
            text: "!castle-spike".into(),
            viewer: cc_twitch::Viewer {
                id: "123".into(),
                name: "explicit_target".into(),
                is_mod: false,
                sub_tier: None,
            },
        },
    };
    assert!(
        cc_core::spike::target_message(ingress.clone(), "explicit_target")
            .unwrap()
            .is_none()
    );
    ingress.login = "explicit_target".into();
    ingress.message.viewer.name = "Localized display".into();
    assert!(
        cc_core::spike::target_message(ingress.clone(), "explicit_target")
            .unwrap()
            .is_some()
    );
    ingress.message.viewer.is_mod = true;
    assert!(cc_core::spike::target_message(ingress, "explicit_target").is_err());
}
#[test]
#[cfg(feature = "spike")]
fn spike_binary_refuses_missing_target_without_login_or_keychain_access() {
    let output = std::process::Command::new(env!("CARGO_BIN_EXE_spike"))
        .output()
        .unwrap();
    assert!(!output.status.success());
    assert!(output.stdout.is_empty());
    let error = String::from_utf8(output.stderr).unwrap();
    assert!(error.contains("FAIL spike"));
    assert!(error.contains("--target-login"));
}
