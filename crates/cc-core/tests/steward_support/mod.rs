//! Isolated simulated engine and configuration state; no credentials or viewers.
use cc_core::{EventHub, Registry, steward::StewardConfig};
use cc_engine::{
    Engine, EngineClass, ModelName, NoKeychain, Prices, Route, RoutingTable, Transport,
};
use cc_store::Store;
use cc_types::*;
use serde_json::{Value, json};
use std::{
    collections::VecDeque,
    net::TcpListener,
    sync::{Arc, Mutex},
};

struct Server {
    endpoint: String,
    shutdown: Option<tokio::sync::oneshot::Sender<()>>,
    thread: Option<std::thread::JoinHandle<()>>,
}

impl Server {
    fn new(answers: Vec<String>) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let endpoint = format!("http://{}/v1", listener.local_addr().unwrap());
        let (shutdown, stopped) = tokio::sync::oneshot::channel();
        let thread = std::thread::spawn(move || {
            tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .unwrap()
                .block_on(async move {
                    let answers = Arc::new(Mutex::new(VecDeque::from(answers)));
                    let app = axum::Router::new().route(
                        "/v1/chat/completions",
                        axum::routing::post(move || {
                            let answers = answers.clone();
                            async move {
                                let content = answers.lock().unwrap().pop_front().unwrap();
                                axum::Json(json!({
                                    "model": "simulated-model",
                                    "choices": [{"message": {"content": content},
                                        "finish_reason": "stop"}],
                                    "usage": {"prompt_tokens": 10, "completion_tokens": 20}
                                }))
                            }
                        }),
                    );
                    axum::serve(tokio::net::TcpListener::from_std(listener).unwrap(), app)
                        .with_graceful_shutdown(async { stopped.await.unwrap() })
                        .await
                        .unwrap();
                });
        });
        Self {
            endpoint,
            shutdown: Some(shutdown),
            thread: Some(thread),
        }
    }
}

impl Drop for Server {
    fn drop(&mut self) {
        self.shutdown.take().unwrap().send(()).unwrap();
        self.thread.take().unwrap().join().unwrap();
    }
}

pub struct Harness {
    pub registry: Registry,
    _server: Server,
    _root: tempfile::TempDir,
}

impl Harness {
    pub async fn new(answers: &[Writ]) -> Self {
        let root = tempfile::tempdir().unwrap();
        let bank = cc_engine::simulated_bank();
        let mut outputs: Vec<_> = bank
            .iter()
            .map(|case| json!({"verdict": case.expected}).to_string())
            .collect();
        outputs.extend(
            answers
                .iter()
                .map(|writ| serde_json::to_string(writ).unwrap()),
        );
        let server = Server::new(outputs);
        let settings = Settings {
            values: [(
                "engine.live_endpoint".into(),
                DataValue::String(server.endpoint.clone()),
            )]
            .into(),
        };
        let model = ModelName::parse("simulated-model").unwrap();
        let mut store = Store::open(root.path().join("steward")).unwrap();
        let report = cc_engine::measure_floor(&settings, &model, &bank, &mut store)
            .await
            .unwrap();
        assert_eq!(report.failed, 0);
        let mut routes = RoutingTable::new(model.clone(), model.clone(), model.clone());
        routes
            .set(Route {
                class: EngineClass::Batch,
                model,
                transport: Transport::Endpoint,
                prices: Prices {
                    input: 0,
                    output: 0,
                },
                evidence: Some(report.evidence),
            })
            .unwrap();
        let engine = Engine::new(&settings, routes, None).unwrap();
        let registry = Registry::with_fixture_root(
            root.path().join("modules"),
            Arc::new(EventHub::new(256).unwrap()),
        )
        .unwrap()
        .with_steward(StewardConfig::new(
            engine,
            Arc::new(tokio::sync::Mutex::new(store)),
            Arc::new(NoKeychain),
            true,
        ));
        Self {
            registry,
            _server: server,
            _root: root,
        }
    }

    pub async fn read<T: serde::de::DeserializeOwned>(&self, request: RpcRequest) -> T {
        serde_json::from_value(self.registry.dispatch(&request).await.unwrap()).unwrap()
    }

    pub async fn ask(&self, chamber: WritChamber, prompt: &str) -> Writ {
        self.read::<AskResult>(RpcRequest::Ask(AskParams {
            chamber,
            prompt: prompt.into(),
            writ_id: None,
        }))
        .await
        .writ
    }

    pub async fn seal(&self, id: &WritId) -> Result<Value, ErrorEnvelope> {
        self.registry
            .dispatch(&RpcRequest::WritSeal(WritSealParams {
                writ_id: id.clone(),
            }))
            .await
    }

    pub async fn configuration(&self) -> Vec<Value> {
        let mut state = Vec::new();
        for request in [
            RpcRequest::DrawList(Empty {}),
            RpcRequest::RulesList(Empty {}),
            RpcRequest::VisualList(Empty {}),
        ] {
            state.push(self.read(request).await);
        }
        state
    }

    /// Exercise a discarded proposal before accepting the same engine answer.
    /// All chamber configuration is compared, including unrelated chambers.
    pub async fn lifecycle(&self, source: &Writ, prompt: &str) -> Writ {
        let before = self.configuration().await;
        let discarded = self.ask(source.chamber, prompt).await;
        assert_eq!(discarded.status, WritStatus::Proposed);
        assert_eq!(before, self.configuration().await);
        let torn: WritTearResult = self
            .read(RpcRequest::WritTear(WritTearParams {
                writ_id: discarded.writ_id.clone(),
            }))
            .await;
        assert_eq!(torn.writ.status, WritStatus::Torn);
        assert_eq!(before, self.configuration().await);
        assert_eq!(
            self.seal(&discarded.writ_id).await.unwrap_err().code,
            ErrorCode::Conflict
        );
        assert_eq!(before, self.configuration().await);
        let proposed = self.ask(source.chamber, prompt).await;
        assert_eq!(proposed.status, WritStatus::Proposed);
        assert_eq!(before, self.configuration().await);
        let sealed: WritSealResult =
            serde_json::from_value(self.seal(&proposed.writ_id).await.unwrap()).unwrap();
        assert_eq!(sealed.writ.status, WritStatus::Sealed);
        assert_eq!(sealed.writ.proposal, proposed.proposal);
        assert_ne!(before, self.configuration().await);
        sealed.writ
    }
}

pub fn fixture(index: usize) -> Writ {
    let fixtures: Vec<Writ> = serde_json::from_str(include_str!(
        "../../../cc-types/tests/fixtures/steward.json"
    ))
    .unwrap();
    fixtures[index].clone()
}
