use cc_core::spike::{LoginDecision, Options, STEPS, login_decision, report};
use cc_twitch::{BridgeState, BridgeStatus};

#[test]
fn stored_login_waits_until_the_keychain_check_settles() {
    assert_eq!(
        login_decision(&BridgeStatus::default(), "simulated_owner"),
        LoginDecision::Wait
    );
    for detail in [None, Some("simulated connection in progress".into())] {
        let status = BridgeStatus {
            state: BridgeState::Connecting,
            bot_login: Some("simulated_owner".into()),
            detail,
            ..BridgeStatus::default()
        };
        assert_eq!(
            login_decision(&status, "simulated_owner"),
            LoginDecision::Wait
        );
    }
}

#[test]
fn stored_login_reuses_only_the_connected_test_broadcaster_case_insensitively() {
    for login in ["simulated_owner", "SIMULATED_OWNER"] {
        let status = BridgeStatus {
            state: BridgeState::Connected,
            bot_login: Some(login.into()),
            ..BridgeStatus::default()
        };
        assert_eq!(
            login_decision(&status, "simulated_owner"),
            LoginDecision::Reuse
        );
    }
}

#[test]
fn missing_or_invalid_stored_login_requires_device_login() {
    for (state, detail) in [
        (BridgeState::Disconnected, Some("simulated no stored login")),
        (BridgeState::Error, Some("simulated invalid stored login")),
        (BridgeState::Error, None),
    ] {
        let status = BridgeStatus {
            state,
            detail: detail.map(String::from),
            // Even a stale matching login cannot make an invalid session reusable.
            bot_login: Some("simulated_owner".into()),
            ..BridgeStatus::default()
        };
        assert_eq!(
            login_decision(&status, "simulated_owner"),
            LoginDecision::DeviceLogin
        );
    }
}

#[test]
fn connected_wrong_or_unknown_account_is_refused_without_device_login() {
    for login in [Some("simulated_other"), None] {
        let status = BridgeStatus {
            state: BridgeState::Connected,
            bot_login: login.map(String::from),
            ..BridgeStatus::default()
        };
        assert_eq!(
            login_decision(&status, "simulated_owner"),
            LoginDecision::WrongAccount
        );
    }
}

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
