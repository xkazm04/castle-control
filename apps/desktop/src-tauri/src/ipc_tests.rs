use serde_json::{Value, json};

#[test]
fn native_permissions_and_network_policy_are_minimal() {
    let config: Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
    let capability: Value =
        serde_json::from_str(include_str!("../capabilities/main-window.json")).unwrap();
    assert_eq!(
        capability["permissions"],
        json!([
            "allow-enter-rehearsal",
            "allow-leave-rehearsal",
            "core:window:allow-title",
            "core:window:allow-minimize",
            "core:window:allow-toggle-maximize",
            "core:window:allow-is-maximized",
            "core:window:allow-close",
            "core:window:allow-start-dragging"
        ])
    );
    assert_eq!(capability["windows"], json!(["main"]));
    let csp = &config["app"]["security"]["csp"];
    assert_eq!(
        csp["connect-src"],
        "ipc: http://ipc.localhost http://127.0.0.1:* ws://127.0.0.1:*"
    );
    assert_eq!(csp["script-src"], "'self'");
    // Loopback only: the custom design preview shows a design's images from the core's overlay host.
    assert_eq!(csp["img-src"], "'self' data: http://127.0.0.1:* http://localhost:*");
    assert_eq!(config["build"]["frontendDist"], "../dist");
    assert_eq!(config["build"]["devUrl"], "http://127.0.0.1:5173");
    assert_eq!(config["app"]["windows"], json!([]));
    assert_eq!(
        config["app"]["security"]["capabilities"],
        json!(["main-window"])
    );
    // Both registration and the ACL manifest must enumerate exactly these doors.
    let build = include_str!("../build.rs");
    let commands = build
        .split_once(".commands(&[")
        .unwrap()
        .1
        .split_once("])")
        .unwrap()
        .0;
    let commands: Vec<_> = commands
        .split(',')
        .map(|command| command.trim().trim_matches('"'))
        .filter(|command| !command.is_empty())
        .collect();
    assert_eq!(commands, ["enter_rehearsal", "leave_rehearsal"]);
    assert!(build.contains(".app_manifest(manifest)"));
    let main = include_str!("main.rs");
    let handlers = main
        .split_once("tauri::generate_handler![")
        .unwrap()
        .1
        .split_once(']')
        .unwrap()
        .0;
    let handlers: Vec<_> = handlers
        .split(',')
        .map(str::trim)
        .filter(|command| !command.is_empty())
        .collect();
    assert_eq!(
        handlers,
        ["rehearsal::enter_rehearsal", "rehearsal::leave_rehearsal"]
    );
}
