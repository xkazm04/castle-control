#![allow(dead_code)]
use cc_engine::{CliExecutables, CliRuntime, Engine, ModelName, RoutingTable, SpawnDoor};
use cc_types::{DataValue, Settings};
use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};

pub fn settings(provider: &str, endpoint: &str) -> Settings {
    Settings {
        values: [
            (
                "engine.cli_provider".into(),
                DataValue::String(provider.into()),
            ),
            (
                "engine.live_endpoint".into(),
                DataValue::String(endpoint.into()),
            ),
        ]
        .into(),
    }
}
pub fn model() -> ModelName {
    ModelName::parse("simulated-selected").unwrap()
}
pub fn table() -> RoutingTable {
    RoutingTable::new(model(), model(), model())
}
pub fn cli(root: &std::path::Path) -> CliRuntime {
    let exe = std::path::PathBuf::from(env!("CARGO_BIN_EXE_fake-cli"));
    CliRuntime::new(
        SpawnDoor::new(root).unwrap(),
        CliExecutables {
            claude: exe.clone(),
            codex: exe.clone(),
            posture_probe: exe,
        },
        1,
    )
    .unwrap()
}
pub fn engine(provider: &str, root: &std::path::Path) -> Engine {
    Engine::new(
        &settings(provider, "http://127.0.0.1:1/v1"),
        table(),
        Some(cli(root)),
    )
    .unwrap()
}
pub struct Server {
    pub endpoint: String,
    pub requests: Arc<Mutex<Vec<String>>>,
    stop: Arc<AtomicBool>,
    thread: Option<std::thread::JoinHandle<()>>,
}
impl Server {
    pub fn new(responses: Vec<(u16, String)>) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let endpoint = format!("http://{}/v1", listener.local_addr().unwrap());
        listener.set_nonblocking(true).unwrap();
        let stop = Arc::new(AtomicBool::new(false));
        let requests = Arc::new(Mutex::new(Vec::new()));
        let (stopping, recorded) = (stop.clone(), requests.clone());
        let thread = std::thread::spawn(move || {
            let mut responses = responses.into_iter();
            while !stopping.load(Ordering::Relaxed) {
                match listener.accept() {
                    Ok((mut stream, _)) => {
                        stream.set_nonblocking(false).unwrap();
                        stream
                            .set_read_timeout(Some(Duration::from_secs(3)))
                            .unwrap();
                        let request = read_request(&mut stream);
                        recorded.lock().unwrap().push(request);
                        if let Some((status, body)) = responses.next() {
                            write!(stream, "HTTP/1.1 {status} Test\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).unwrap();
                        }
                    }
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        std::thread::sleep(Duration::from_millis(2))
                    }
                    Err(error) => panic!("fake loopback listener: {error}"),
                }
            }
        });
        Self {
            endpoint,
            requests,
            stop,
            thread: Some(thread),
        }
    }
}
impl Drop for Server {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        self.thread.take().unwrap().join().unwrap();
    }
}
fn read_request(stream: &mut TcpStream) -> String {
    let mut bytes = Vec::new();
    let mut block = [0u8; 4096];
    loop {
        let n = stream.read(&mut block).unwrap();
        if n == 0 {
            break;
        }
        bytes.extend_from_slice(&block[..n]);
        if let Some(end) = bytes.windows(4).position(|w| w == b"\r\n\r\n") {
            let header = String::from_utf8_lossy(&bytes[..end]);
            let len: usize = header
                .lines()
                .find_map(|line| {
                    line.to_ascii_lowercase()
                        .strip_prefix("content-length: ")
                        .map(|v| v.parse().unwrap())
                })
                .unwrap_or(0);
            if bytes.len() >= end + 4 + len {
                break;
            }
        }
    }
    String::from_utf8(bytes).unwrap()
}
pub fn local_answer(verdict: &str) -> String {
    serde_json::json!({"model":"simulated-served", "choices":[{"message":{"content":
        format!("{{\"verdict\":\"{verdict}\"}}")},"finish_reason":"stop"}],
        "usage":{"prompt_tokens":10,"completion_tokens":20}})
    .to_string()
}
