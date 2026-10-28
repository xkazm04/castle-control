//! Simulated recorded provider traffic only; never a real key or paid request.
#[allow(dead_code)]
#[path = "../../cc-beacons/tests/leonardo_support/mod.rs"]
mod support;

use cc_beacons::art::{ArtError, KeyStore, LeonardoClient, SecretKey};
use cc_core::beacons::{ArtCatalog, ArtDownload, BeaconsModule};
use cc_core::{EventHub, Registry};
use cc_store::{ImageProviderAmount, LedgerEvent, LedgerLine};
use cc_types::{ErrorCode, ErrorEnvelope};
use serde_json::json;
use std::sync::Arc;
use support::{MemoryStore, Recording, SENTINEL, TraceBuffer};

struct SimulatedDownload;
#[async_trait::async_trait]
impl ArtDownload for SimulatedDownload {
    async fn fetch(&self, url: &str) -> Result<Vec<u8>, ErrorEnvelope> {
        assert!(url.starts_with("https://cdn.example.invalid/simulated-"));
        Ok(b"\x89PNG\r\n\x1a\nSimulated image bytes".to_vec())
    }
}

struct Harness {
    registry: Registry,
    root: tempfile::TempDir,
    transport: Recording,
}
impl Harness {
    fn new(keys: impl KeyStore + 'static, transport: Recording) -> Self {
        let root = tempfile::tempdir().unwrap();
        let catalog = Arc::new(ArtCatalog::default());
        let package = root.path().join("package");
        std::fs::create_dir(&package).unwrap();
        catalog
            .accept_design("simulated-frame".to_owned().try_into().unwrap(), &package)
            .unwrap();
        let client = LeonardoClient::new(transport.clone(), keys, "simulated".into()).unwrap();
        let module = BeaconsModule::open(root.path().join("beacons"))
            .unwrap()
            .with_art_provider(Arc::new(client), Arc::new(SimulatedDownload), catalog);
        let mut registry = Registry::default();
        registry.register(Arc::new(module)).unwrap();
        Self {
            registry,
            root,
            transport,
        }
    }
    fn ledger(&self) -> Vec<LedgerLine> {
        std::fs::read_to_string(self.root.path().join("beacons/store/engine.jsonl"))
            .unwrap()
            .lines()
            .map(|line| serde_json::from_str(line).unwrap())
            .collect()
    }
    async fn call(
        &self,
        method: &str,
        params: serde_json::Value,
    ) -> Result<serde_json::Value, ErrorEnvelope> {
        let request = cc_types::parse_request(
            &serde_json::to_vec(&json!({"method":method,"params":params})).unwrap(),
        )?;
        self.registry.dispatch(&request).await
    }
}

#[tokio::test]
async fn withheld_and_failed_output_keep_the_paid_credit_audit() {
    for status in ["COMPLETE", "FAILED"] {
        let h = Harness::new(MemoryStore::present(), Recording::generation_output(status));
        let mut request = params();
        request["remove_background"] = json!(true);
        let result = h.call("beacons.art.generate", request).await;
        if status == "COMPLETE" {
            let result = result.unwrap();
            assert_eq!(result["assets"], json!([]));
            assert_eq!(result["costs"][0]["charge"], json!({"credits":"12"}));
        } else {
            assert_eq!(result.unwrap_err().code, ErrorCode::Upstream);
        }
        assert_eq!(h.ledger().len(), 1);
        assert_eq!(
            h.transport.sent().len(),
            2,
            "paid submission is never retried"
        );
    }
}
fn params() -> serde_json::Value {
    let image = support::image_request();
    json!({"design_id":"simulated-frame", "prompt":image.prompt, "model_id":image.model_id,
        "width":image.width, "height":image.height, "quantity":1, "remove_background":false})
}

#[tokio::test]
async fn status_reports_presence_and_missing_key_generate_is_typed_and_socket_free() {
    for (keys, available) in [
        (MemoryStore::present(), true),
        (MemoryStore::default(), false),
    ] {
        let h = Harness::new(keys, Recording::empty());
        assert_eq!(
            h.call("beacons.art.status", json!({})).await.unwrap(),
            json!({"available":available})
        );
        if !available {
            for remove_background in [false, true] {
                let mut request = params();
                request["remove_background"] = json!(remove_background);
                assert_eq!(
                    h.call("beacons.art.generate", request)
                        .await
                        .unwrap_err()
                        .code,
                    ErrorCode::Unavailable
                );
            }
            assert_eq!(
                h.call("beacons.visual.list", json!({})).await.unwrap(),
                json!({"visuals":[]})
            );
        }
        assert!(h.transport.sent().is_empty());
        assert!(h.ledger().is_empty());
    }
}

#[tokio::test]
async fn credit_generate_audits_once_and_imports_a_labelled_local_anchor() {
    let h = Harness::new(MemoryStore::present(), Recording::flow());
    let result = h.call("beacons.art.generate", params()).await.unwrap();
    assert_eq!(result["costs"][0]["charge"], json!({"credits":"12"}));
    assert_eq!(result["assets"].as_array().unwrap().len(), 1);
    assert_eq!(result["assets"][0]["generated"], true);
    assert_eq!(result["assets"][0]["provenance"], "leonardo_generated");
    assert!(
        h.root
            .path()
            .join("package")
            .join(result["assets"][0]["asset"].as_str().unwrap())
            .is_file()
    );
    let rows = h.ledger();
    assert_eq!(rows.len(), 1);
    let LedgerEvent::ImageProviderCost { call_id, .. } = &rows[0].event else {
        panic!("expected image provider audit");
    };
    assert_eq!(
        serde_json::to_value(&rows[0].event).unwrap(),
        json!({"kind":"image_provider_cost", "provider":"leonardo", "credits":"12",
            "call_id":call_id.as_str()})
    );
    assert_eq!(result["costs"][0]["call_id"], call_id.as_str());
    assert_eq!(h.transport.sent().len(), 3);
    assert_eq!(
        h.transport.sent()[0].body.as_ref().unwrap()["public"],
        false
    );
    assert!(!result.to_string().contains("https://"));
    drop(h.registry);
    let store = cc_store::Store::open(h.root.path().join("beacons/store")).unwrap();
    assert_eq!(
        store.read_ledger(cc_store::LedgerKind::Engine).unwrap(),
        rows
    );
}

#[tokio::test]
async fn matching_set_resolves_only_an_imported_anchor_in_the_selected_design() {
    for credits in [true, false] {
        let h = Harness::new(
            MemoryStore::present(),
            Recording::background_flow(credits, None, false),
        );
        let anchor = h.call("beacons.art.generate", params()).await.unwrap();
        let mut matching = params();
        matching["quantity"] = json!(2);
        matching["reference"] = anchor["assets"][0]["asset"].clone();
        matching["remove_background"] = json!(true);
        let result = h
            .call("beacons.art.generate", matching.clone())
            .await
            .unwrap();
        assert_eq!(result["assets"].as_array().unwrap().len(), 2);
        assert_eq!(result["costs"][0]["charge"], json!({"credits":"24.5"}));
        let charge = if credits {
            json!({"credits":"1.2500"})
        } else {
            json!({"micro_usd":104700})
        };
        let rows = h.ledger();
        assert_eq!(rows.len(), 4);
        assert_eq!(result["costs"].as_array().unwrap().len(), 3);
        for index in 1..=2 {
            assert_eq!(result["costs"][index]["model"], "remove-bg");
            assert_eq!(result["costs"][index]["charge"], charge);
            let mut expected = charge.clone();
            expected["kind"] = json!("image_provider_cost");
            expected["provider"] = json!("leonardo");
            expected["call_id"] = result["costs"][index]["call_id"].clone();
            assert_eq!(
                serde_json::to_value(&rows[index + 1].event).unwrap(),
                expected
            );
            assert_eq!(
                result["assets"][index - 1]["provenance"],
                "leonardo_background_removed"
            );
            assert!(
                h.root
                    .path()
                    .join("package")
                    .join(result["assets"][index - 1]["asset"].as_str().unwrap())
                    .is_file()
            );
        }
        matching["design_id"] = json!("another-design");
        assert_eq!(
            h.call("beacons.art.generate", matching.clone())
                .await
                .unwrap_err()
                .code,
            ErrorCode::NotFound
        );
        matching["design_id"] = json!("simulated-frame");
        matching["reference"] = json!("loose-file.png");
        assert_eq!(
            h.call("beacons.art.generate", matching)
                .await
                .unwrap_err()
                .code,
            ErrorCode::Invalid
        );
        assert_eq!(h.transport.sent().len(), 7, "no paid call is retried");
        assert_eq!(h.ledger().len(), 4);
        h.transport.assert_finished();
    }
}

#[tokio::test]
async fn removal_failure_or_withheld_output_preserves_only_actual_paid_receipts() {
    for fail_at in [Some(0), Some(1), None] {
        let h = Harness::new(
            MemoryStore::present(),
            Recording::background_flow(false, fail_at, true),
        );
        let anchor = h.call("beacons.art.generate", params()).await.unwrap();
        let mut request = params();
        request["reference"] = anchor["assets"][0]["asset"].clone();
        request["quantity"] = json!(2);
        request["remove_background"] = json!(true);
        let result = h.call("beacons.art.generate", request).await;
        if fail_at.is_some() {
            let error = result.unwrap_err();
            assert_eq!(error.code, ErrorCode::Upstream);
            assert!(!serde_json::to_string(&error).unwrap().contains(SENTINEL));
        } else {
            let result = result.unwrap();
            assert_eq!(result["assets"], json!([]));
            assert_eq!(result["costs"].as_array().unwrap().len(), 3);
        }
        let rows = h.ledger();
        assert_eq!(rows.len(), 2 + fail_at.unwrap_or(2));
        for row in rows.iter().skip(2) {
            assert!(matches!(
                row.event,
                LedgerEvent::ImageProviderCost {
                    amount: ImageProviderAmount::MicroUsd(104_700),
                    ..
                }
            ));
        }
        assert_eq!(
            h.transport.sent().len(),
            5 + fail_at.map_or(2, |index| index + 1)
        );
        h.transport.assert_finished();
    }
}

#[tokio::test]
async fn dollar_only_receipt_is_unavailable_and_never_fabricates_a_credit_row() {
    let flow: serde_json::Value = serde_json::from_str(include_str!(
        "../../cc-beacons/tests/fixtures/leonardo/flow.json"
    ))
    .unwrap();
    let transport = Recording::response(
        200,
        json!({"sdGenerationJob":{
            "generationId":"simulated-job", "cost":flow[5]["response"]["cost"]
        }}),
    );
    let h = Harness::new(MemoryStore::present(), transport);
    let error = h.call("beacons.art.generate", params()).await.unwrap_err();
    assert_eq!(error.code, ErrorCode::Unavailable);
    assert!(error.message.contains("without credits"));
    assert!(h.ledger().is_empty());
    assert_eq!(
        h.transport.sent().len(),
        1,
        "no polls or further paid operations"
    );
    h.transport.assert_finished();
}

struct BrokenKeychain;
impl KeyStore for BrokenKeychain {
    fn load(&self, _: &str) -> Result<Option<SecretKey>, ArtError> {
        Err(ArtError::Keychain)
    }
    fn save(&self, _: &str, _: &SecretKey) -> Result<(), ArtError> {
        unreachable!()
    }
    fn delete(&self, _: &str) -> Result<(), ArtError> {
        unreachable!()
    }
}

#[tokio::test]
async fn keychain_failure_is_an_error_not_an_absent_key() {
    let h = Harness::new(BrokenKeychain, Recording::empty());
    let error = h.call("beacons.art.status", json!({})).await.unwrap_err();
    assert_eq!(error.code, ErrorCode::Unavailable);
    assert!(error.message.contains("keychain"));
    assert!(h.transport.sent().is_empty());
}

#[tokio::test]
async fn logs_errors_results_and_ledger_never_expose_the_simulated_key() {
    let captured = TraceBuffer::default();
    let subscriber = tracing_subscriber::fmt()
        .with_max_level(tracing::Level::TRACE)
        .with_ansi(false)
        .without_time()
        .with_writer(captured.clone())
        .finish();
    tracing::subscriber::set_global_default(subscriber).unwrap();
    let h = Harness::new(
        MemoryStore::present(),
        Recording::background_flow(false, None, false),
    );
    let anchor = h.call("beacons.art.generate", params()).await.unwrap();
    let mut request = params();
    request["reference"] = anchor["assets"][0]["asset"].clone();
    request["quantity"] = json!(2);
    request["remove_background"] = json!(true);
    let result = h.call("beacons.art.generate", request).await.unwrap();
    assert!(!result.to_string().contains(SENTINEL));
    assert!(
        !serde_json::to_string(&h.ledger())
            .unwrap()
            .contains(SENTINEL)
    );
    for transport in [
        Recording::error_fixture(),
        Recording::response(200, json!({"error":SENTINEL})),
        Recording::response(401, json!({"error":SENTINEL})),
    ] {
        let h = Harness::new(MemoryStore::present(), transport);
        let error = h.call("beacons.art.generate", params()).await.unwrap_err();
        assert!(
            !format!("{error:?} {}", serde_json::to_string(&error).unwrap()).contains(SENTINEL)
        );
        assert!(h.ledger().is_empty());
    }
    assert!(
        captured.text().contains("simulated transport request"),
        "log capture is active"
    );
    assert!(!captured.text().contains(SENTINEL));
}

#[tokio::test]
async fn fixture_registry_registers_art_without_accessing_native_keys() {
    let root = tempfile::tempdir().unwrap();
    let registry =
        Registry::with_fixture_root(root.path(), Arc::new(EventHub::new(8).unwrap())).unwrap();
    assert!(registry.methods().contains(&"beacons.art.status"));
    assert!(registry.methods().contains(&"beacons.art.generate"));
    let request = cc_types::parse_request(
        &serde_json::to_vec(&json!({"method":"beacons.art.status","params":{}})).unwrap(),
    )
    .unwrap();
    assert_eq!(
        registry.dispatch(&request).await.unwrap(),
        json!({"available":false})
    );
}
