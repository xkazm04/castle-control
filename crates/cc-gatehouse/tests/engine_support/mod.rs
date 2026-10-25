use cc_engine::{
    Engine, EngineClass, ModelName, NoKeychain, Prices, Route, RoutingTable, Transport,
};
use cc_gatehouse::EngineClassifier;
use cc_store::Store;
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

pub struct Endpoint {
    pub url: String,
    pub requests: Arc<Mutex<Vec<String>>>,
    stop: Arc<AtomicBool>,
    thread: Option<std::thread::JoinHandle<()>>,
}

impl Endpoint {
    pub fn new(responses: Vec<(u16, String)>) -> Self {
        // Fake transport only: an ephemeral loopback listener, no model or CLI.
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/v1", listener.local_addr().unwrap());
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
                        recorded.lock().unwrap().push(read_request(&mut stream));
                        let (status, body) = responses.next().expect("unexpected model call");
                        write!(stream, "HTTP/1.1 {status} Simulated\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).unwrap();
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        std::thread::sleep(Duration::from_millis(2));
                    }
                    Err(e) => panic!("simulated endpoint: {e}"),
                }
            }
        });
        Self {
            url,
            requests,
            stop,
            thread: Some(thread),
        }
    }
}

impl Drop for Endpoint {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        self.thread.take().unwrap().join().unwrap();
    }
}

fn read_request(stream: &mut TcpStream) -> String {
    let mut bytes = Vec::new();
    let mut block = [0; 4096];
    loop {
        let n = stream.read(&mut block).unwrap();
        assert!(n > 0, "incomplete simulated request");
        bytes.extend_from_slice(&block[..n]);
        if let Some(end) = bytes.windows(4).position(|w| w == b"\r\n\r\n") {
            let len: usize = String::from_utf8_lossy(&bytes[..end])
                .lines()
                .find_map(|line| {
                    line.to_ascii_lowercase()
                        .strip_prefix("content-length: ")
                        .map(|v| v.parse().unwrap())
                })
                .unwrap();
            if bytes.len() >= end + 4 + len {
                break;
            }
        }
    }
    String::from_utf8(bytes).unwrap()
}

pub fn answer(text: &str) -> (u16, String) {
    (
        200,
        serde_json::json!({
            "model":"simulated-model",
            "choices":[{"message":{"content":text},"finish_reason":"stop"}],
            "usage":{"prompt_tokens":10,"completion_tokens":20}
        })
        .to_string(),
    )
}

pub struct Fixture {
    pub classifier: EngineClassifier,
    pub root: tempfile::TempDir,
    pub endpoint: Endpoint,
}

impl Fixture {
    pub async fn new(responses: Vec<(u16, String)>) -> Self {
        let mut measured: Vec<_> = ["pass", "hold", "bar", "bar", "pass", "hold"]
            .into_iter()
            .map(|verdict| answer(&format!("{{\"verdict\":\"{verdict}\"}}")))
            .collect();
        measured.extend(responses);
        let endpoint = Endpoint::new(measured);
        let settings = Settings {
            values: [(
                "engine.live_endpoint".into(),
                DataValue::String(endpoint.url.clone()),
            )]
            .into(),
        };
        let root = tempfile::tempdir().unwrap();
        let mut store = Store::open(root.path()).unwrap();
        let model = ModelName::parse("simulated-model").unwrap();
        let evidence =
            cc_engine::measure_floor(&settings, &model, &cc_engine::simulated_bank(), &mut store)
                .await
                .unwrap()
                .evidence;
        assert!(evidence.admits(EngineClass::Live));
        let mut routes = RoutingTable::new(model.clone(), model.clone(), model.clone());
        routes
            .set(Route {
                class: EngineClass::Live,
                model,
                transport: Transport::Endpoint,
                prices: Prices::default(),
                evidence: Some(evidence),
            })
            .unwrap();
        let engine = Engine::new(&settings, routes, None).unwrap();
        let classifier = EngineClassifier::new(
            engine,
            store,
            Box::new(NoKeychain),
            Some("unused-local-label".into()),
        );
        Self {
            classifier,
            root,
            endpoint,
        }
    }
}
