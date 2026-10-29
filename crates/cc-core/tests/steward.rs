//! Simulated local endpoint scenarios equivalent to cc-engine's fake CLI writ
//! scenarios. A dependency's CARGO_BIN_EXE_fake-cli is not exposed to cc-core.
use cc_core::{EventHub, Registry, steward::StewardConfig};
use cc_engine::{
    Engine, EngineClass, ModelName, NoKeychain, Prices, Route, RoutingTable, Transport,
};
use cc_store::{DataStore, LedgerEvent, LedgerKind, Store};
use cc_types::*;
use serde_json::{Value, json};
use std::{
    collections::VecDeque,
    net::TcpListener,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};

struct Server {
    endpoint: String,
    stop: Arc<AtomicBool>,
    thread: Option<std::thread::JoinHandle<()>>,
}
impl Server {
    fn new(answers: Vec<String>) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let endpoint = format!("http://{}/v1", listener.local_addr().unwrap());
        let stop = Arc::new(AtomicBool::new(false));
        let stopping = stop.clone();
        let thread = std::thread::spawn(move || {
            tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap().block_on(async move {
                let answers = Arc::new(Mutex::new(VecDeque::from(answers)));
                let app = axum::Router::new().route("/v1/chat/completions", axum::routing::post(move || {
                    let answers = answers.clone();
                    async move {
                        axum::Json(json!({"model":"simulated-model", "choices":[{"message":{"content":answers.lock().unwrap().pop_front().unwrap()},
                            "finish_reason":"stop"}], "usage":{"prompt_tokens":10,"completion_tokens":20}}))
                    }
                }));
                axum::serve(tokio::net::TcpListener::from_std(listener).unwrap(), app)
                    .with_graceful_shutdown(async move {
                        while !stopping.load(Ordering::Relaxed) { tokio::time::sleep(Duration::from_millis(1)).await; }
                    }).await.unwrap();
            });
        });
        Self {
            endpoint,
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

struct Harness {
    registry: Registry,
    root: tempfile::TempDir,
    _server: Server,
    events: Arc<EventHub>,
}
impl Harness {
    async fn new(answers: Vec<String>) -> Self {
        let root = tempfile::tempdir().unwrap();
        let bank = cc_engine::simulated_bank();
        let mut outputs: Vec<_> = bank
            .iter()
            .map(|case| json!({"verdict":case.expected}).to_string())
            .collect();
        outputs.extend(answers);
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
                    input: 1_000_000,
                    output: 3_000_000,
                },
                evidence: Some(report.evidence),
            })
            .unwrap();
        let engine = Engine::new(&settings, routes, None).unwrap();
        let events = Arc::new(EventHub::new(256).unwrap());
        let registry = Registry::with_fixture_root(root.path().join("modules"), events.clone())
            .unwrap()
            .with_steward(StewardConfig::new(
                engine,
                Arc::new(tokio::sync::Mutex::new(store)),
                Arc::new(NoKeychain),
                true,
            ));
        Self {
            registry,
            root,
            _server: server,
            events,
        }
    }
    async fn ask(&self, chamber: WritChamber) -> Writ {
        let result = self
            .registry
            .dispatch(&RpcRequest::Ask(AskParams {
                chamber,
                prompt: "Simulated configuration request".into(),
                writ_id: None,
            }))
            .await
            .unwrap();
        serde_json::from_value::<AskResult>(result).unwrap().writ
    }
    async fn seal(&self, id: &WritId) -> Result<Value, ErrorEnvelope> {
        self.registry
            .dispatch(&RpcRequest::WritSeal(WritSealParams {
                writ_id: id.clone(),
            }))
            .await
    }
    async fn tear(&self, id: &WritId) -> Result<Value, ErrorEnvelope> {
        self.registry
            .dispatch(&RpcRequest::WritTear(WritTearParams {
                writ_id: id.clone(),
            }))
            .await
    }
    fn rows(&mut self) -> Vec<Writ> {
        let old = std::mem::take(&mut self.registry);
        drop(old);
        let store = Store::open(self.root.path().join("steward")).unwrap();
        store
            .configuration_items(DataStore::Writs)
            .unwrap()
            .into_iter()
            .map(|item| {
                assert!(item.simulated);
                serde_json::from_str(&item.content).unwrap()
            })
            .collect()
    }
}
fn fixture(index: usize) -> Writ {
    let fixtures: Vec<Writ> =
        serde_json::from_str(include_str!("../../cc-types/tests/fixtures/steward.json")).unwrap();
    fixtures[index].clone()
}
fn text(writ: &Writ) -> String {
    serde_json::to_string(writ).unwrap()
}
async fn draws(registry: &Registry) -> Vec<LotsDraw> {
    serde_json::from_value::<DrawListResult>(
        registry
            .dispatch(&RpcRequest::DrawList(Empty {}))
            .await
            .unwrap(),
    )
    .unwrap()
    .draws
}

fn error(result: Result<Value, ErrorEnvelope>, code: ErrorCode) {
    assert_eq!(result.unwrap_err().code, code);
}

async fn rules(registry: &Registry) -> RulesListResult {
    let result = registry
        .dispatch(&RpcRequest::RulesList(Empty {}))
        .await
        .unwrap();
    serde_json::from_value(result).unwrap()
}

#[tokio::test]
async fn unconfigured_registers_all_three_and_returns_unavailable() {
    let dir = tempfile::tempdir().unwrap();
    for registry in [
        Registry::with_status(),
        Registry::with_fixture_root(dir.path(), Arc::new(EventHub::new(8).unwrap())).unwrap(),
    ] {
        let id = WritId::mint();
        for request in [
            RpcRequest::Ask(AskParams {
                chamber: WritChamber::Lots,
                prompt: "Simulated".into(),
                writ_id: None,
            }),
            RpcRequest::WritSeal(WritSealParams {
                writ_id: id.clone(),
            }),
            RpcRequest::WritTear(WritTearParams { writ_id: id }),
        ] {
            assert!(registry.methods().contains(&request.method()));
            let error = registry.dispatch(&request).await.unwrap_err();
            assert_eq!(error.code, ErrorCode::Unavailable);
            assert_eq!(error.message, "no Steward engine is configured");
        }
        assert_eq!(RpcRequest::NAMES.len() - registry.methods().len(), 11);
    }
}

#[tokio::test]
async fn writ_ok_is_proposed_nothing_changes_before_seal_and_cost_is_audited() {
    let source = fixture(0);
    let mut h = Harness::new(vec![text(&source)]).await;
    let writ = h.ask(WritChamber::Lots).await;
    assert_eq!(writ.status, WritStatus::Proposed);
    assert_ne!(writ.writ_id, source.writ_id);
    assert_eq!(writ.created_at, writ.updated_at);
    assert!(draws(&h.registry).await.is_empty());
    let result: WritSealResult =
        serde_json::from_value(h.seal(&writ.writ_id).await.unwrap()).unwrap();
    assert_eq!(result.writ.status, WritStatus::Sealed);
    assert_ne!(result.writ.updated_at, result.writ.created_at);
    assert_eq!(draws(&h.registry).await.len(), 1);
    assert_eq!(
        h.events
            .since(0)
            .unwrap()
            .iter()
            .filter(|event| event.kind == EventKind::Writ)
            .count(),
        2
    );
    error(h.seal(&writ.writ_id).await, ErrorCode::Conflict);
    error(h.tear(&writ.writ_id).await, ErrorCode::Conflict);
    let rows = h.rows();
    assert_eq!(rows.len(), 2);
    assert_eq!(rows[0].status, WritStatus::Proposed);
    assert_eq!(rows[1].status, WritStatus::Sealed);
    let store = Store::open(h.root.path().join("steward")).unwrap();
    let audit = store.read_ledger(LedgerKind::Engine).unwrap();
    assert_eq!(audit.len(), 7);
    assert!(matches!(
        audit[6].event,
        LedgerEvent::Engine {
            class: EngineClass::Batch,
            cost_microusd: 70,
            ..
        }
    ));
    assert!(store.items(DataStore::Writs).unwrap().is_empty());
}

#[tokio::test]
async fn malformed_and_schema_invalid_store_nothing_but_audit_every_call() {
    let mut invalid = serde_json::to_value(fixture(0)).unwrap();
    invalid["chamber"] = json!("beacons");
    let mut h = Harness::new(vec![
        invalid.to_string(),
        "simulated malformed writ".into(),
        text(&fixture(1)),
    ])
    .await;
    for chamber in [WritChamber::Lots, WritChamber::Lots, WritChamber::Lots] {
        let error = h
            .registry
            .dispatch(&RpcRequest::Ask(AskParams {
                chamber,
                prompt: "Simulated".into(),
                writ_id: None,
            }))
            .await
            .unwrap_err();
        assert_eq!(error.code, ErrorCode::Invalid);
    }
    assert!(draws(&h.registry).await.is_empty());
    assert!(h.rows().is_empty());
    let store = Store::open(h.root.path().join("steward")).unwrap();
    assert_eq!(store.read_ledger(LedgerKind::Engine).unwrap().len(), 9);
}

#[tokio::test]
async fn gatehouse_seal_uses_authoritative_handler_and_tear_is_terminal() {
    let mut armed = serde_json::to_value(fixture(1)).unwrap();
    armed["proposal"]["diff"]["after"]["rule"]["mode"] = json!("armed");
    let mut h = Harness::new(vec![
        text(&fixture(1)),
        armed.to_string(),
        text(&fixture(0)),
    ])
    .await;
    let before = rules(&h.registry).await;
    let writ = h.ask(WritChamber::Gatehouse).await;
    assert_eq!(before, rules(&h.registry).await);
    h.seal(&writ.writ_id).await.unwrap();
    let result = rules(&h.registry).await;
    assert!(
        result
            .rules
            .iter()
            .any(|rule| rule.rule_id == RuleId::try_from("simulated-links".to_string()).unwrap())
    );
    let armed = h.ask(WritChamber::Gatehouse).await;
    error(h.seal(&armed.writ_id).await, ErrorCode::BlockedByPolicy);
    let discarded = h.ask(WritChamber::Lots).await;
    let result: WritTearResult =
        serde_json::from_value(h.tear(&discarded.writ_id).await.unwrap()).unwrap();
    assert_eq!(result.writ.status, WritStatus::Torn);
    error(h.seal(&discarded.writ_id).await, ErrorCode::Conflict);
    error(h.tear(&discarded.writ_id).await, ErrorCode::Conflict);
    assert!(draws(&h.registry).await.is_empty());
    error(h.seal(&WritId::mint()).await, ErrorCode::NotFound);
    error(h.tear(&WritId::mint()).await, ErrorCode::NotFound);
    assert_eq!(h.rows().last().unwrap().status, WritStatus::Torn);
}

#[tokio::test]
async fn guardrail_reason_is_preserved_and_refused_writ_remains_proposed() {
    let mut source = fixture(0);
    let WritProposal::DrawUpsert(diff) = &mut source.proposal else {
        unreachable!()
    };
    diff.after.draw.policy.content = DrawContent::Prize;
    diff.after.draw.policy.paid_entry = true;
    let policy = diff.after.draw.policy.clone();
    let mut h = Harness::new(vec![text(&source)]).await;
    let writ = h.ask(WritChamber::Lots).await;
    let check: DrawCheckResult = serde_json::from_value(
        h.registry
            .dispatch(&RpcRequest::DrawCheck(DrawCheckParams { policy }))
            .await
            .unwrap(),
    )
    .unwrap();
    assert_eq!(check.result, CheckResult::Blocked);
    let error = h.seal(&writ.writ_id).await.unwrap_err();
    assert_eq!(error.code, ErrorCode::BlockedByPolicy);
    assert_eq!(error.message, check.reasons.join(", "));
    assert!(draws(&h.registry).await.is_empty());
    assert_eq!(h.rows(), vec![writ]);
}

#[tokio::test]
async fn authoritative_before_replaces_model_claim_and_stale_seal_fails() {
    let source = fixture(0);
    let h = Harness::new(vec![text(&source)]).await;
    let WritProposal::DrawUpsert(mut diff) = source.proposal else {
        unreachable!()
    };
    diff.after.draw.name = "Simulated original".into();
    h.registry
        .dispatch(&RpcRequest::DrawUpsert(diff.after.clone()))
        .await
        .unwrap();
    let writ = h.ask(WritChamber::Lots).await;
    let WritProposal::DrawUpsert(proposal) = &writ.proposal else {
        unreachable!()
    };
    assert_eq!(proposal.before.as_ref(), Some(&diff.after));
    diff.after.draw.name = "Simulated concurrent edit".into();
    h.registry
        .dispatch(&RpcRequest::DrawUpsert(diff.after))
        .await
        .unwrap();
    error(h.seal(&writ.writ_id).await, ErrorCode::Conflict);
}

#[tokio::test]
async fn followups_read_existing_writ_and_concurrent_seals_have_one_winner() {
    let h = Harness::new(vec![text(&fixture(0)), text(&fixture(0))]).await;
    let writ = h.ask(WritChamber::Lots).await;
    let response = h
        .registry
        .dispatch(&RpcRequest::Ask(AskParams {
            chamber: WritChamber::Lots,
            prompt: "Simulated follow-up".into(),
            writ_id: Some(writ.writ_id.clone()),
        }))
        .await
        .unwrap();
    let next: AskResult = serde_json::from_value(response).unwrap();
    assert_ne!(next.writ.writ_id, writ.writ_id);
    let (a, b) = tokio::join!(h.seal(&writ.writ_id), h.seal(&writ.writ_id));
    assert_ne!(a.is_ok(), b.is_ok());
    assert_eq!(
        a.err().or_else(|| b.err()).unwrap().code,
        ErrorCode::Conflict
    );
    error(h.seal(&next.writ.writ_id).await, ErrorCode::Conflict);
}
