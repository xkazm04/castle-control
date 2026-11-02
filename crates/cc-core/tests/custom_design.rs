//! Custom design methods over fixture registries and a RECORDED OpenAI
//! transport: no network, no real key. All images are SIMULATED drawings.
#[path = "../../cc-beacons/tests/simulated_art/mod.rs"]
mod simulated_art;

use base64::Engine as _;
use cc_beacons::art::{
    ArtError, HttpResponse, KeyStore, OpenAiCall, OpenAiClient, OpenAiTransport, SecretKey,
};
use cc_core::{EventHub, Module, Registry, beacons::BeaconsModule};
use cc_store::{ImageProvider, ImageProviderAmount, LedgerEvent, LedgerKind, Store};
use cc_types::{ErrorCode, ErrorEnvelope, parse_request};
use serde_json::{Value, json};
use std::{
    path::Path,
    sync::{Arc, Mutex},
};

struct Keys(bool);
impl KeyStore for Keys {
    fn load(&self, _: &str) -> Result<Option<SecretKey>, ArtError> {
        self.0
            .then(|| SecretKey::new("simulated-openai-key".into()))
            .transpose()
    }
    fn save(&self, _: &str, _: &SecretKey) -> Result<(), ArtError> {
        panic!("no key writes")
    }
    fn delete(&self, _: &str) -> Result<(), ArtError> {
        panic!("no key deletes")
    }
}

/// Replies with the queued simulated PNGs and counts calls.
#[derive(Clone, Default)]
struct Recorded {
    replies: Arc<Mutex<Vec<Vec<u8>>>>,
    calls: Arc<Mutex<Vec<&'static str>>>,
}
#[async_trait::async_trait]
impl OpenAiTransport for Recorded {
    async fn send(&self, _: &SecretKey, call: OpenAiCall) -> Result<HttpResponse, ArtError> {
        self.calls.lock().unwrap().push(match call {
            OpenAiCall::Generation(_) => "generation",
            OpenAiCall::Edit { .. } => "edit",
        });
        let png = self.replies.lock().unwrap().remove(0);
        let body = json!({
            "data": [{"b64_json": base64::engine::general_purpose::STANDARD.encode(png)}],
            "usage": {"input_tokens": 50, "output_tokens": 1056,
                "input_tokens_details": {"text_tokens": 50, "image_tokens": 0}}
        });
        Ok(HttpResponse {
            status: 200,
            body: body.to_string(),
        })
    }
}

fn module(root: &Path, key: bool, replies: Vec<Vec<u8>>) -> (BeaconsModule, Recorded) {
    let transport = Recorded::default();
    *transport.replies.lock().unwrap() = replies;
    let client = OpenAiClient::new(transport.clone(), Keys(key), "openai".into()).unwrap();
    let module = BeaconsModule::open(root)
        .unwrap()
        .with_openai_provider(Arc::new(client));
    (module, transport)
}

async fn call(module: &dyn Module, method: &str, params: Value) -> Result<Value, ErrorEnvelope> {
    let request =
        parse_request(&serde_json::to_vec(&json!({"method": method, "params": params})).unwrap())?;
    let value = module.call(&request).await?;
    request.validate_result(value)
}

async fn dispatch(
    registry: &Registry,
    method: &str,
    params: Value,
) -> Result<Value, ErrorEnvelope> {
    let request =
        parse_request(&serde_json::to_vec(&json!({"method": method, "params": params})).unwrap())?;
    registry.dispatch(&request).await
}

fn fixture_registry(root: &Path) -> Registry {
    Registry::with_fixture_root(root, Arc::new(EventHub::new(16).unwrap())).unwrap()
}

/// Copy a committed simulated fixture into a design, as a generation would.
fn place(design_root: &Path, id: &str, name: &str) {
    std::fs::copy(
        simulated_art::path(name),
        design_root.join("designs").join(id).join(name),
    )
    .unwrap();
}

fn openai_rows(root: &Path) -> Vec<u64> {
    Store::open(root.join("store"))
        .unwrap()
        .read_ledger(LedgerKind::Engine)
        .unwrap()
        .into_iter()
        .map(|line| match line.event {
            LedgerEvent::ImageProviderCost {
                provider: ImageProvider::OpenAi,
                amount: ImageProviderAmount::MicroUsd(value),
                cost_microusd: None,
                ..
            } => value,
            other => panic!("unexpected ledger row {other:?}"),
        })
        .collect()
}

#[tokio::test]
async fn openai_generate_writes_into_a_created_design_and_records_micro_usd() {
    let root = tempfile::tempdir().unwrap();
    let png = simulated_art::generate("simulated-votebar.png");
    let (module, transport) = module(root.path(), true, vec![png.clone()]);
    let status = call(&module, "beacons.art.status", json!({}))
        .await
        .unwrap();
    assert_eq!(
        status,
        json!({"available":true,"providers":[{"provider":"openai","available":true}]})
    );
    let design = call(&module, "beacons.design.create", json!({"kind":"vote_bar"}))
        .await
        .unwrap()["design_id"]
        .clone();
    let params = json!({"design_id":design, "prompt":"SIMULATED forged vote bar housing",
        "model_id":"gpt-image-2-5-flare", "width":768, "height":256, "quantity":1,
        "remove_background":false, "provider":"openai", "background":"transparent"});
    let result = call(&module, "beacons.art.generate", params.clone())
        .await
        .unwrap();
    assert_eq!(result["assets"][0]["provenance"], "openai_generated");
    assert_eq!(result["costs"][0]["charge"], json!({"micro_usd":31_930}));
    assert_eq!(result["costs"][0]["model"], "gpt-image-2-5-flare");
    let asset = result["assets"][0]["asset"].as_str().unwrap();
    let written = root
        .path()
        .join("designs")
        .join(design.as_str().unwrap())
        .join(asset);
    assert_eq!(std::fs::read(written).unwrap(), png);
    // Refused before any paid call: a library design, a non-OpenAI model,
    // a size the provider cannot make, or a cutout request.
    let library = call(
        &module,
        "beacons.library.import",
        json!({"library_id":"votebar-09","kind":"vote_bar"}),
    )
    .await
    .unwrap();
    let mut refusals = Vec::new();
    for (key, value) in [
        ("design_id", library["design_id"].clone()),
        ("model_id", json!("b24e16ff-06e3-43eb-8d33-4416c2d75876")),
        ("width", json!(1544)),
        ("remove_background", json!(true)),
    ] {
        let mut p = params.clone();
        p[key] = value;
        refusals.push(
            call(&module, "beacons.art.generate", p)
                .await
                .unwrap_err()
                .code,
        );
    }
    assert!(
        refusals.iter().all(|code| *code == ErrorCode::Invalid),
        "{refusals:?}"
    );
    assert_eq!(*transport.calls.lock().unwrap(), ["generation"]);
    drop(module);
    assert_eq!(
        openai_rows(root.path()),
        [31_930],
        "receipt survives restart"
    );
}

#[tokio::test]
async fn beacon_layers_split_the_effect_with_one_edit_or_keep_the_original_without_a_key() {
    let root = tempfile::tempdir().unwrap();
    let base = simulated_art::generate("simulated-beacon-base.png");
    let (module, transport) = module(root.path(), true, vec![base]);
    let design = call(&module, "beacons.design.create", json!({"kind":"beacon"}))
        .await
        .unwrap()["design_id"]
        .clone();
    place(
        root.path(),
        design.as_str().unwrap(),
        "simulated-beacon.png",
    );
    let params = json!({"design_id":design,"asset":"simulated-beacon.png","kind":"beacon"});
    let layers = call(&module, "beacons.art.layers", params.clone())
        .await
        .unwrap();
    assert_eq!(*transport.calls.lock().unwrap(), ["edit"]);
    assert!(layers["base"].as_str().unwrap().starts_with("base-"));
    assert!(layers["effect"].as_str().unwrap().starts_with("effect-"));
    let core = &layers["anchors"]["core_rect"];
    assert!(
        (core["x"].as_f64().unwrap() - 218.0 / 576.0).abs() < 0.005,
        "{core}"
    );
    assert!(
        (core["w"].as_f64().unwrap() - 141.0 / 576.0).abs() < 0.005,
        "{core}"
    );
    let effect_layer = &layers["package"]["layers"][1];
    let bound: Vec<_> = effect_layer["bindings"]
        .as_array()
        .unwrap()
        .iter()
        .map(|b| b["property"].as_str().unwrap())
        .collect();
    assert_eq!(bound, ["opacity", "scale", "x", "y"]);
    assert_eq!(layers["costs"][0]["charge"], json!({"micro_usd":31_930}));
    // A wrong kind is refused; the record's kind is authoritative.
    let mut wrong = params.clone();
    wrong["kind"] = json!("frame");
    assert_eq!(
        call(&module, "beacons.art.layers", wrong)
            .await
            .unwrap_err()
            .code,
        ErrorCode::Invalid
    );
    drop(module);
    assert_eq!(openai_rows(root.path()), [31_930]);

    let (module, transport) = self::module(root.path(), false, Vec::new());
    let layers = call(&module, "beacons.art.layers", params).await.unwrap();
    assert!(transport.calls.lock().unwrap().is_empty());
    assert_eq!(layers["base"], "simulated-beacon.png");
    assert!(layers.get("effect").is_none() && layers["costs"] == json!([]));
    assert_eq!(layers["anchors"], json!({}));
}

#[tokio::test]
async fn offline_registry_creates_layers_imports_and_survives_restart() {
    let root = tempfile::tempdir().unwrap();
    let registry = fixture_registry(root.path());
    // Paid and engine-backed paths are unavailable offline.
    for (method, params) in [
        (
            "beacons.art.generate",
            json!({"design_id":"simulated-x","prompt":"SIMULATED",
            "model_id":"gpt-image-2-5-flare","width":768,"height":256,"quantity":1,
            "remove_background":false,"provider":"openai"}),
        ),
        (
            "beacons.art.direct",
            json!({"kind":"frame","request":"SIMULATED","width":768,"height":432}),
        ),
    ] {
        assert_eq!(
            dispatch(&registry, method, params).await.unwrap_err().code,
            ErrorCode::Unavailable
        );
    }
    let mut created = Vec::new();
    for (kind, fixture, anchor) in [
        ("vote_bar", "simulated-votebar.png", "track_rect"),
        ("frame", "simulated-frame.png", "window_rect"),
    ] {
        let design = dispatch(&registry, "beacons.design.create", json!({"kind":kind}))
            .await
            .unwrap()["design_id"]
            .clone();
        place(
            &root.path().join("beacons"),
            design.as_str().unwrap(),
            fixture,
        );
        let layers = dispatch(
            &registry,
            "beacons.art.layers",
            json!({"design_id":design,"asset":fixture,"kind":kind}),
        )
        .await
        .unwrap();
        assert!(layers["anchors"][anchor].is_object());
        assert_eq!(layers["costs"], json!([]));
        created.push((design, layers));
    }
    let imported = dispatch(
        &registry,
        "beacons.library.import",
        json!({"library_id":"beacon-03","kind":"beacon"}),
    )
    .await
    .unwrap();
    assert_eq!(imported, json!({"design_id":"library-beacon-03"}));
    assert_eq!(
        dispatch(
            &registry,
            "beacons.library.import",
            json!({"library_id":"beacon-03","kind":"beacon"})
        )
        .await
        .unwrap(),
        imported,
        "import is idempotent"
    );
    for (params, code) in [
        (
            json!({"library_id":"simulated-missing","kind":"beacon"}),
            ErrorCode::NotFound,
        ),
        (
            json!({"library_id":"frame-01","kind":"vote_bar"}),
            ErrorCode::Invalid,
        ),
        (
            json!({"library_id":"map-02","kind":"frame"}),
            ErrorCode::Invalid,
        ),
    ] {
        assert_eq!(
            dispatch(&registry, "beacons.library.import", params)
                .await
                .unwrap_err()
                .code,
            code
        );
    }
    drop(registry);
    // Reopen: records and packages are read back and re-verified.
    let registry = fixture_registry(root.path());
    let (vote_bar, layers) = &created[0];
    assert_eq!(
        dispatch(
            &registry,
            "gatehouse.votebar.design.set",
            json!({"design_id":vote_bar})
        )
        .await
        .unwrap(),
        json!({})
    );
    let record: Value = serde_json::from_slice(
        &std::fs::read(
            root.path()
                .join("beacons/designs")
                .join(vote_bar.as_str().unwrap())
                .join("design.json"),
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(record["package"], layers["package"]);
    let frame = &created[1].0;
    for params in [
        json!({"design_id":frame}),
        json!({"design_id":"library-beacon-03"}),
        json!({"design_id":"simulated-missing"}),
    ] {
        assert!(
            dispatch(&registry, "gatehouse.votebar.design.set", params)
                .await
                .is_err()
        );
    }
    assert_eq!(
        dispatch(&registry, "gatehouse.votebar.design.set", json!({}))
            .await
            .unwrap(),
        json!({})
    );
}
