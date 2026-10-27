//! Test-only CDP client for an isolated, disposable headless Chrome profile.
use futures::{SinkExt, StreamExt};
use serde_json::{Value, json};
use std::{
    path::Path,
    process::Stdio,
    time::{Duration, Instant},
};
use tokio::{
    net::TcpStream,
    process::{Child, Command},
};
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream, tungstenite::Message};

pub struct Browser {
    child: Child,
    socket: WebSocketStream<MaybeTlsStream<TcpStream>>,
    id: u64,
    _profile: tempfile::TempDir,
}
impl Browser {
    pub async fn open(url: &str) -> Self {
        let profile = tempfile::tempdir().unwrap();
        let chrome = std::env::var("CC_OVERLAY_CHROME")
            .unwrap_or_else(|_| r"C:\Program Files\Google\Chrome\Application\chrome.exe".into());
        assert!(
            Path::new(&chrome).is_file(),
            "set CC_OVERLAY_CHROME to an installed Chrome binary"
        );
        let mut command = Command::new(chrome);
        command
            .args([
                "--headless=new",
                "--disable-gpu",
                "--no-first-run",
                "--no-default-browser-check",
                "--disable-background-networking",
                "--remote-debugging-port=0",
            ])
            .arg(format!("--user-data-dir={}", profile.path().display()))
            .arg("about:blank")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::inherit())
            .kill_on_drop(true);
        #[cfg(windows)]
        {
            command.creation_flags(0x08000000);
        }
        let mut child = command.spawn().expect("headless Chrome launch");
        let port = tokio::time::timeout(Duration::from_secs(10), async {
            loop {
                assert!(
                    child.try_wait().unwrap().is_none(),
                    "headless Chrome exited before opening its debug port"
                );
                if let Ok(text) = std::fs::read_to_string(profile.path().join("DevToolsActivePort"))
                {
                    break text.lines().next().unwrap().parse::<u16>().unwrap();
                }
                tokio::time::sleep(Duration::from_millis(20)).await;
            }
        })
        .await
        .expect("Chrome debug port");
        let pages: Value = super::client()
            .get(format!("http://127.0.0.1:{port}/json/list"))
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        let endpoint = pages
            .as_array()
            .unwrap()
            .iter()
            .find(|v| v["type"] == "page")
            .unwrap()["webSocketDebuggerUrl"]
            .as_str()
            .unwrap();
        let (socket, _) = tokio_tungstenite::connect_async(endpoint).await.unwrap();
        let mut browser = Self {
            child,
            socket,
            id: 0,
            _profile: profile,
        };
        browser.command("Page.enable", json!({})).await;
        browser.command("Page.navigate", json!({"url":url})).await;
        browser
    }
    pub async fn command(&mut self, method: &str, params: Value) -> Value {
        self.id += 1;
        self.socket
            .send(Message::Text(
                json!({"id":self.id,"method":method,"params":params})
                    .to_string()
                    .into(),
            ))
            .await
            .unwrap();
        tokio::time::timeout(Duration::from_secs(5), async {
            loop {
                let frame = self.socket.next().await.expect("CDP closed").unwrap();
                if let Message::Text(text) = frame {
                    let value: Value = serde_json::from_str(&text).unwrap();
                    if value["id"] == self.id {
                        assert!(value.get("error").is_none(), "CDP error: {value}");
                        return value["result"].clone();
                    }
                }
            }
        })
        .await
        .expect("CDP command timed out")
    }
    pub async fn evaluate(&mut self, expression: &str) -> Value {
        let result = self.command("Runtime.evaluate",json!({"expression":expression,"returnByValue":true,"awaitPromise":true,"allowUnsafeEvalBlockedByCSP":false})).await;
        assert!(
            result.get("exceptionDetails").is_none(),
            "browser exception: {result}"
        );
        result["result"]["value"].clone()
    }
    pub async fn applied(&mut self, hash: &str, intensity: f64) {
        let expected_opacity = 0.2 + 0.8 * intensity;
        let expression = format!(
            "document.getElementById('scene')?.dataset.packageHash === {} && document.getElementById('scene')?.dataset.intensity === {}",
            serde_json::to_string(hash).unwrap(),
            serde_json::to_string(&intensity.to_string()).unwrap()
        );
        let expression = format!(
            "({expression}) && Math.abs(Number(getComputedStyle(document.getElementById('scene').firstElementChild).opacity) - {expected_opacity}) < 0.000001"
        );
        let start = Instant::now();
        loop {
            if self.evaluate(&expression).await == true {
                break;
            }
            assert!(
                start.elapsed() < Duration::from_secs(2),
                "client did not apply accepted snapshot"
            );
            tokio::time::sleep(Duration::from_millis(2)).await;
        }
        // Include two browser frame boundaries, not just an HTTP receipt.
        self.evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))").await;
    }
    pub async fn close(mut self) {
        self.id += 1;
        self.socket
            .send(Message::Text(
                json!({"id":self.id,"method":"Browser.close"})
                    .to_string()
                    .into(),
            ))
            .await
            .unwrap();
        tokio::time::timeout(Duration::from_secs(5), self.child.wait())
            .await
            .unwrap()
            .unwrap();
    }
}

pub fn report(label: &str, mut samples: Vec<f64>) {
    samples.sort_by(f64::total_cmp);
    let n = samples.len();
    let p50 = samples[(n as f64 * 0.5).ceil() as usize - 1];
    let p95 = samples[(n as f64 * 0.95).ceil() as usize - 1];
    let max = samples[n - 1];
    println!(
        "{label}: n={n} p50={p50:.2}ms p95={p95:.2}ms max={max:.2}ms budget=1000ms (headless Chrome DOM + two frames; NOT OBS)"
    );
    assert!(
        max < 1000.0,
        "native handoff to applied browser render exceeded one second"
    );
}

/// Optional manual OBS window, not a claimed OBS measurement or automated login.
pub async fn obs_demo(service: &cc_core::NativeServices, app: &cc_core::AppState, root: &Path) {
    let Ok(seconds) = std::env::var("CC_OVERLAY_OBS_DEMO_SECONDS") else {
        return;
    };
    let seconds: u32 = seconds.parse().expect("demo seconds must be an integer");
    assert!(
        (1..=600).contains(&seconds),
        "demo window must be 1..600 seconds"
    );
    println!(
        "Manual OBS source: {}beacons/simulated-frame",
        service.overlay_url()
    );
    for index in 0..seconds {
        let at = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
        let package = super::seal(
            super::package(&format!("SIMULATED {index}: {at}")),
            &Default::default(),
        );
        service
            .accept_beacons_package(package, root, false)
            .unwrap();
        let mut curve = super::visual(true).curve;
        let intensity = if index % 2 == 0 { 0.25 } else { 0.75 };
        curve.ranges[0].intensity = intensity.try_into().unwrap();
        super::call(
            app,
            "beacons.curve.set",
            json!({"visual_id":"simulated-frame","curve":curve}),
        )
        .await;
        println!(
            "OBS manual sample {index}: package handed off at {at}, curve={intensity}; OBS latency unmeasured"
        );
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
}
