//! Fabricated, simulated recordings only. No network or OS keychain is used.
mod leonardo_support;

use cc_beacons::art::{
    ArtError, Charge, GenerationState, ImageProvider, KeyStore, LeonardoClient, Provenance,
    ReqwestTransport, SecretKey,
};
use leonardo_support::{MemoryStore, Recording, SENTINEL, TraceBuffer, anchor, image_request};
use serde_json::json;

#[tokio::test]
async fn private_anchor_matching_set_and_transparent_asset_follow_recorded_shapes() {
    let transport = Recording::flow();
    let client = LeonardoClient::new(
        transport.clone(),
        MemoryStore::present(),
        "simulated".into(),
    )
    .unwrap();
    let provider: &dyn ImageProvider = &client;
    assert!(provider.available().unwrap());
    let generation = provider.generate_anchor(&image_request()).await.unwrap();
    assert_eq!(generation.cost.charge, Charge::Credits("12".into()));
    assert_eq!(generation.cost.model, image_request().model_id);
    ulid::Ulid::from_string(&generation.cost.call_id).unwrap();
    assert_eq!(
        provider
            .generation_state(&generation.generation_id)
            .await
            .unwrap(),
        GenerationState::Pending
    );
    let GenerationState::Complete(images) = provider
        .generation_state(&generation.generation_id)
        .await
        .unwrap()
    else {
        panic!("simulated anchor must complete")
    };
    let anchor = &images[0];
    assert!(anchor.generated);
    assert_eq!(anchor.provenance, Provenance::LeonardoGenerated);
    let matching = provider
        .generate_matching_set(&image_request(), anchor, 2)
        .await
        .unwrap();
    assert_eq!(matching.cost.charge, Charge::Credits("24.5".into()));
    assert_ne!(generation.cost.call_id, matching.cost.call_id);
    let GenerationState::Complete(images) = provider
        .generation_state(&matching.generation_id)
        .await
        .unwrap()
    else {
        panic!("simulated set must complete")
    };
    assert_eq!(images.len(), 2);
    assert!(images.iter().all(|image| image.generated));
    let cutout = provider.remove_background(&images[0]).await.unwrap();
    assert_eq!(cutout.cost.model, "remove-bg");
    assert_eq!(cutout.cost.charge, Charge::MicroUsd(104_700));
    assert!(cutout.assets[0].generated);
    assert_eq!(
        cutout.assets[0].provenance,
        Provenance::LeonardoBackgroundRemoved
    );
    let serialized = serde_json::to_value(&cutout.assets[0]).unwrap();
    assert!(serialized.get("image_id").is_none());
    let sent = transport.sent();
    assert_eq!(sent.len(), 6);
    for request in &sent {
        if let Some(body) = &request.body {
            assert_eq!(body["public"], false, "all paid request shapes are private");
            assert!(!body.to_string().contains("null"));
        }
    }
    let matching_body = sent[3].body.as_ref().unwrap();
    assert_eq!(
        matching_body["init_generation_image_id"],
        anchor.image_id.as_ref().unwrap().as_str()
    );
    assert_ne!(
        matching_body["init_generation_image_id"],
        generation.generation_id
    );
    transport.assert_finished();
}

#[tokio::test]
async fn missing_or_deleted_key_disables_every_operation_without_a_request() {
    let keys = MemoryStore::default();
    let transport = Recording::empty();
    let client = LeonardoClient::new(transport.clone(), keys.clone(), "simulated".into()).unwrap();
    assert!(!client.available().unwrap());
    assert_eq!(
        client.generate_anchor(&image_request()).await.unwrap_err(),
        ArtError::Unavailable
    );
    assert_eq!(
        client
            .generate_matching_set(&image_request(), &anchor(), 2)
            .await
            .unwrap_err(),
        ArtError::Unavailable
    );
    assert_eq!(
        client.remove_background(&anchor()).await.unwrap_err(),
        ArtError::Unavailable
    );
    assert_eq!(
        client.generation_state("simulated-job").await.unwrap_err(),
        ArtError::Unavailable
    );
    keys.save("simulated", &SecretKey::new(SENTINEL.into()).unwrap())
        .unwrap();
    assert!(client.available().unwrap());
    keys.delete("simulated").unwrap();
    assert!(!client.available().unwrap());
    assert_eq!(
        client.generate_anchor(&image_request()).await.unwrap_err(),
        ArtError::Unavailable
    );
    assert!(transport.sent().is_empty());
}

#[tokio::test]
async fn key_is_redacted_in_debug_display_errors_costs_and_captured_tracing() {
    let captured = TraceBuffer::default();
    let subscriber = tracing_subscriber::fmt()
        .with_max_level(tracing::Level::TRACE)
        .with_ansi(false)
        .without_time()
        .with_writer(captured.clone())
        .finish();
    let _guard = tracing::subscriber::set_default(subscriber);
    let value = SecretKey::new(SENTINEL.into()).unwrap();
    assert_eq!(format!("{value:?}"), "[redacted]");
    assert_eq!(format!("{value}"), "[redacted]");
    tracing::debug!(?value, display = %value, "simulated redaction probe");
    let client = LeonardoClient::new(
        Recording::response(
            200,
            json!({"sdGenerationJob": {
                "generationId": "simulated-job", "apiCreditCost": 1
            }}),
        ),
        MemoryStore::present(),
        "simulated".into(),
    )
    .unwrap();
    let result = client.generate_anchor(&image_request()).await.unwrap();
    let costs = format!(
        "{:?} {}",
        result.cost,
        serde_json::to_string(&result.cost).unwrap()
    );
    assert!(!costs.contains(SENTINEL));
    let transport = Recording::error_fixture();
    let client = LeonardoClient::new(
        transport.clone(),
        MemoryStore::present(),
        "simulated".into(),
    )
    .unwrap();
    let error = client.generate_anchor(&image_request()).await.unwrap_err();
    assert_eq!(error, ArtError::Http(429));
    assert!(!format!("{error:?} {error}").contains(SENTINEL));
    assert!(!format!("{:?}", transport.sent()).contains(SENTINEL));
    assert_eq!(transport.sent().len(), 1, "paid calls are never retried");
    // Even a malicious response echoing Authorization is discarded at the door.
    for status in [200, 401] {
        let client = LeonardoClient::new(
            Recording::response(status, json!({"error": SENTINEL})),
            MemoryStore::present(),
            "simulated".into(),
        )
        .unwrap();
        let error = client.generate_anchor(&image_request()).await.unwrap_err();
        assert!(!format!("{error:?} {error}").contains(SENTINEL));
    }
    let logs = captured.text();
    assert!(
        logs.contains("simulated redaction probe"),
        "capture is active"
    );
    assert!(!logs.contains(SENTINEL));
}

#[tokio::test]
async fn invalid_requests_and_path_injection_never_send_or_expose_a_key() {
    let transport = Recording::empty();
    let client = LeonardoClient::new(
        transport.clone(),
        MemoryStore::present(),
        "simulated".into(),
    )
    .unwrap();
    for change in ["empty", "dimensions", "model", "secret"] {
        let mut request = image_request();
        match change {
            "empty" => request.prompt.clear(),
            "dimensions" => request.width = 33,
            "model" => request.model_id = "../escape".into(),
            "secret" => request.prompt = SENTINEL.into(),
            _ => unreachable!(),
        }
        assert_eq!(
            client.generate_anchor(&request).await.unwrap_err(),
            ArtError::Invalid
        );
    }
    for count in [0, 9] {
        assert_eq!(
            client
                .generate_matching_set(&image_request(), &anchor(), count)
                .await
                .unwrap_err(),
            ArtError::Invalid
        );
    }
    let mut invalid_anchor = anchor();
    invalid_anchor.image_id = None;
    assert_eq!(
        client.remove_background(&invalid_anchor).await.unwrap_err(),
        ArtError::Invalid
    );
    assert_eq!(
        client.generation_state("../../escape").await.unwrap_err(),
        ArtError::Invalid
    );
    assert!(transport.sent().is_empty());
}

#[tokio::test]
async fn schemas_reject_malformed_jobs_unknown_costs_and_unsafe_images() {
    for body in [
        json!({}),
        json!({"sdGenerationJob":{"generationId":"simulated-job"}}),
        json!({"sdGenerationJob":{"generationId":"../escape", "apiCreditCost":1}}),
        json!({"sdGenerationJob":{"generationId":"simulated-job", "apiCreditCost":-1}}),
        json!({"sdGenerationJob":{"generationId":"simulated-job", "cost":{"amount":"NaN","unit":"DOLLARS"}}}),
        json!({"sdGenerationJob":{"generationId":"simulated-job", "cost":{"amount":"0.0000001","unit":"DOLLARS"}}}),
    ] {
        let client = LeonardoClient::new(
            Recording::response(200, body),
            MemoryStore::present(),
            "simulated".into(),
        )
        .unwrap();
        assert_eq!(
            client.generate_anchor(&image_request()).await.unwrap_err(),
            ArtError::Response
        );
    }
    for body in [
        json!({"generations_by_pk":{"id":"wrong-job", "status":"PENDING", "generated_images":[]}}),
        json!({"generations_by_pk":{"id":"simulated-job", "status":"UNKNOWN", "generated_images":[]}}),
        json!({"generations_by_pk":{"id":"simulated-job", "status":"COMPLETE", "generated_images":[{"id":"image", "url":"http://unsafe.invalid/a.png"}]}}),
    ] {
        let client = LeonardoClient::new(
            Recording::response(200, body),
            MemoryStore::present(),
            "simulated".into(),
        )
        .unwrap();
        assert_eq!(
            client.generation_state("simulated-job").await.unwrap_err(),
            ArtError::Response
        );
    }
}

#[tokio::test]
async fn withheld_outputs_keep_the_cost_and_failed_jobs_stay_named() {
    let client = LeonardoClient::new(Recording::response(200, json!({
        "id":"simulated-cutout", "cost":{"amount":"2.000001", "unit":"DOLLARS"}, "results":[]
    })), MemoryStore::present(), "simulated".into()).unwrap();
    let cutout = client.remove_background(&anchor()).await.unwrap();
    assert!(cutout.assets.is_empty());
    assert_eq!(cutout.cost.charge, Charge::MicroUsd(2_000_001));
    let client = LeonardoClient::new(
        Recording::response(
            200,
            json!({
                "generations_by_pk":{"id":"simulated-job", "status":"FAILED", "generated_images":[]}
            }),
        ),
        MemoryStore::present(),
        "simulated".into(),
    )
    .unwrap();
    assert_eq!(
        client.generation_state("simulated-job").await.unwrap(),
        GenerationState::Failed
    );
}

#[test]
fn transport_constructs_without_network_and_invalid_keys_are_typed() {
    assert!(ReqwestTransport::new().is_ok());
    for invalid in ["", "has newline\n", "has space"] {
        assert_eq!(
            SecretKey::new(invalid.into()).unwrap_err(),
            ArtError::Invalid
        );
    }
}
