use super::Options;

#[test]
fn rehearsal_requires_no_twitch_settings_and_validates_public_obs_settings() {
    let options = Options::parse(["--rehearsal"].map(String::from)).unwrap();
    assert!(options.rehearsal && !options.login && !options.steward_live);
    let native = options.native.unwrap();
    assert!(native.client_id.is_empty() && native.test_channel.is_empty());
    assert_eq!(native.obs_port, 4455);
    assert_eq!(native.overlay_port, 0);
    let options = Options::parse(
        [
            "--rehearsal",
            "--obs-port",
            "4456",
            "--overlay-port",
            "17891",
            "--obs-password-label",
            "simulated-obs-label",
        ]
        .map(String::from),
    )
    .unwrap();
    let native = options.native.unwrap();
    assert_eq!((native.obs_port, native.overlay_port), (4456, 17891));
    assert_eq!(native.obs_password_label, "simulated-obs-label");
    for invalid in [
        vec!["--rehearsal", "--login"],
        vec!["--rehearsal", "--steward-live"],
        vec!["--rehearsal", "--rehearsal"],
        vec!["--relaunch", "--relaunch"],
        vec!["--rehearsal", "--overlay-port", "0"],
        vec!["--rehearsal", "--obs-port", "0"],
        vec!["--rehearsal", "--client-id", "simulatedPublicId"],
        vec!["--rehearsal", "--test-channel", "simulated_owner"],
    ] {
        assert!(Options::parse(invalid.into_iter().map(String::from)).is_err());
    }
}
