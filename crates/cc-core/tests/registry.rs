use cc_core::{EventHub, Module, Registry};
use cc_types::{ErrorCode, ErrorEnvelope, EventKind, RpcRequest, parse_request};
use futures::future::BoxFuture;
use serde_json::{Value, json};
use std::sync::Arc;

struct SimulatedModule(&'static [&'static str]);
impl Module for SimulatedModule {
    fn methods(&self) -> &'static [&'static str] {
        self.0
    }
    fn call<'a>(&'a self, _: &'a RpcRequest) -> BoxFuture<'a, Result<Value, ErrorEnvelope>> {
        Box::pin(async { Ok(json!({"simulated_invalid_result": true})) })
    }
}

#[tokio::test]
async fn modules_are_checked_atomically_and_results_use_the_generated_schema_door() {
    let mut registry = Registry::default();
    for methods in [
        &["status.get", "simulated.undeclared"][..],
        &["status.get", "status.get"],
        &[],
    ] {
        assert!(
            registry
                .register(Arc::new(SimulatedModule(methods)))
                .is_err()
        );
        assert!(registry.methods().is_empty());
    }
    registry
        .register(Arc::new(SimulatedModule(&["status.get"])))
        .unwrap();
    assert_eq!(
        registry
            .register(Arc::new(SimulatedModule(&["status.get"])))
            .unwrap_err()
            .code,
        ErrorCode::Conflict
    );
    let request = parse_request(br#"{"method":"status.get","params":{}}"#).unwrap();
    assert_eq!(
        registry.dispatch(&request).await.unwrap_err().code,
        ErrorCode::Internal
    );
    let request = parse_request(br#"{"method":"settings.get","params":{}}"#).unwrap();
    assert_eq!(
        registry.dispatch(&request).await.unwrap_err().code,
        ErrorCode::Unavailable
    );
}

#[tokio::test]
async fn concurrent_publish_is_totally_ordered_and_retention_boundaries_are_exact() {
    let hub = Arc::new(EventHub::new(200).unwrap());
    let mut producers = Vec::new();
    for _ in 0..10 {
        let hub = Arc::clone(&hub);
        producers.push(tokio::spawn(async move {
            for _ in 0..20 {
                hub.publish(EventKind::BridgeStatus).unwrap();
            }
        }));
    }
    for producer in producers {
        producer.await.unwrap();
    }
    assert_eq!(
        hub.since(0)
            .unwrap()
            .iter()
            .map(|e| e.seq)
            .collect::<Vec<_>>(),
        (1..=200).collect::<Vec<_>>()
    );
    hub.publish(EventKind::ObsStatus).unwrap();
    assert_eq!(hub.since(0).unwrap()[0].kind, EventKind::Resync);
    assert_eq!(hub.since(1).unwrap().len(), 200);
    assert!(hub.since(201).unwrap().is_empty());
    assert!(hub.publish(EventKind::Resync).is_err());
    assert!(EventHub::new(0).is_err());
}
