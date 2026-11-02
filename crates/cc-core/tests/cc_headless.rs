//! Spawns the real `cc-headless` binary on a throwaway data root and drives it
//! over loopback JSON-RPC. Traffic is generated SIMULATED rehearsal chat only.
use serde_json::{Value, json};
use std::{
    io::{BufRead, BufReader, Read},
    process::{Child, ChildStderr, Command, Stdio},
    time::Duration,
};

const EXE: &str = env!("CARGO_BIN_EXE_cc-headless");

struct Core {
    child: Child,
    stderr: ChildStderr,
    endpoint: String,
    token: String,
    rest: BufReader<std::process::ChildStdout>,
}

fn launch(root: &std::path::Path) -> (Core, Value) {
    let mut child = Command::new(EXE)
        .arg(root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let mut stdout = BufReader::new(child.stdout.take().unwrap());
    let mut line = String::new();
    stdout.read_line(&mut line).unwrap();
    let handoff: Value = serde_json::from_str(&line).unwrap();
    let core = Core {
        stderr: child.stderr.take().unwrap(),
        child,
        endpoint: handoff["endpoint"].as_str().unwrap().to_owned(),
        token: handoff["token"].as_str().unwrap().to_owned(),
        rest: stdout,
    };
    (core, handoff)
}

async fn call(core: &Core, method: &str, params: Value) -> (u16, Value) {
    let response = reqwest::Client::new()
        .post(format!("{}rpc", core.endpoint))
        .bearer_auth(&core.token)
        .json(&json!({"method": method, "params": params}))
        .send()
        .await
        .unwrap();
    let status = response.status().as_u16();
    (status, response.json().await.unwrap())
}

fn port(url: &str, prefix: &str) -> u16 {
    url.strip_prefix(prefix)
        .unwrap()
        .trim_end_matches('/')
        .parse()
        .unwrap()
}

#[tokio::test]
async fn headless_core_hands_off_once_refuses_armed_doors_and_runs_rehearsal() {
    let root = tempfile::tempdir().unwrap();
    let (mut core, handoff) = launch(&root.path().join("data"));

    // AC1: exactly {endpoint, token, overlay_origin} on separate loopback ports.
    let mut keys: Vec<_> = handoff.as_object().unwrap().keys().cloned().collect();
    keys.sort();
    assert_eq!(keys, ["endpoint", "overlay_origin", "token"]);
    assert_eq!(core.token.len(), 64);
    assert!(
        core.token
            .bytes()
            .all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
    );
    let overlay = handoff["overlay_origin"].as_str().unwrap();
    assert!(core.endpoint.ends_with('/'));
    assert_ne!(
        port(&core.endpoint, "http://127.0.0.1:"),
        port(overlay, "http://localhost:")
    );

    // AC2: rehearsal refuses the Twitch login (registry.rs dispatch_inner).
    let (status, body) = call(&core, "auth.twitch.start", json!({})).await;
    assert_eq!(
        (status, body["code"].as_str()),
        (403, Some("blocked_by_policy"))
    );
    let (_, body) = call(&core, "auth.twitch.revoke", json!({})).await;
    assert_eq!(body["code"], "blocked_by_policy");

    // AC3: no OBS peer; the launcher door refuses OBS mutations.
    let (status, body) = call(&core, "obs.status.get", json!({})).await;
    assert_eq!((status, &body), (200, &json!({"connected": false})));
    let connect = json!({"host":"127.0.0.1","port":4455,"password":"SIMULATED","remember":true});
    let (status, body) = call(&core, "obs.connect", connect).await;
    assert_eq!(
        (status, body["code"].as_str()),
        (403, Some("blocked_by_policy"))
    );
    let (_, body) = call(&core, "obs.status.get", json!({})).await;
    assert_eq!(body, json!({"connected": false}));
    let (_, body) = call(&core, "status.get", json!({})).await;
    assert_eq!(body["simulated"], true);

    // AC4: a rehearsal session runs a generated vote round.
    let (status, body) = call(&core, "rehearsal.start", json!({})).await;
    assert_eq!(status, 200, "{body}");
    assert_eq!(
        (body["active"].as_bool(), &body["obs"]),
        (Some(true), &json!({"connected": false}))
    );
    let (status, body) = call(
        &core,
        "rehearsal.scenario.run",
        json!({"scenario":"vote_round"}),
    )
    .await;
    assert_eq!((status, &body), (200, &json!({"accepted": true})));

    // Exit on stdin EOF; nothing more on stdout; the token never on stderr.
    drop(core.child.stdin.take());
    let exit = tokio::task::spawn_blocking(move || {
        let status = core.child.wait().unwrap();
        let mut rest = String::new();
        core.rest.read_to_string(&mut rest).unwrap();
        let mut stderr = String::new();
        core.stderr.read_to_string(&mut stderr).unwrap();
        (status, rest, stderr, core.token)
    });
    let (status, rest, stderr, token) = tokio::time::timeout(Duration::from_secs(30), exit)
        .await
        .unwrap()
        .unwrap();
    assert!(status.success());
    assert_eq!(rest, "");
    assert!(!stderr.contains(&token));
}

#[test]
fn usage_errors_exit_two_without_a_handoff() {
    for args in [vec![], vec!["a", "b"]] {
        let output = Command::new(EXE).args(args).output().unwrap();
        assert_eq!(output.status.code(), Some(2));
        assert!(output.stdout.is_empty());
        assert!(String::from_utf8_lossy(&output.stderr).contains("usage: cc-headless"));
    }
}
