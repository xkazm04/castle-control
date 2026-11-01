//! A Steward `setMode` suggestion is not stored until cc-types gains the
//! identifier; the writ store stays readable and other kinds are unchanged.
//! Simulated engine answers and configuration only; no viewers, no credentials.
#[allow(dead_code)]
mod steward_support;

use cc_store::DataStore;
use cc_types::*;
use serde_json::json;
use steward_support::{Harness, fixture};

async fn stored(h: &Harness) -> Vec<Writ> {
    let store = h.store.lock().await;
    store
        .configuration_items(DataStore::Writs)
        .unwrap()
        .into_iter()
        .map(|item| serde_json::from_str(&item.content).unwrap())
        .collect()
}

#[tokio::test]
async fn set_mode_suggestion_stores_no_writ_and_the_store_stays_readable() {
    let links = fixture(1);
    let WritProposal::RulesUpsert(upsert) = &links.proposal else {
        unreachable!()
    };
    // Armed with an acknowledgement is valid as a model answer, but the service
    // strips the acknowledgement when it snapshots, which yields a Writ the
    // contract refuses to read back.
    let mut armed = serde_json::to_value(fixture(2)).unwrap();
    armed["proposal"]["diff"]["after"] = json!({
        "rule_id": "simulated-links",
        "mode": "armed",
        "acknowledgement": {"at": "2026-10-26T00:00:00.000Z", "reason": "simulated"}
    });
    let armed: Writ = serde_json::from_value(armed).unwrap();
    let h = Harness::new(&[armed, links.clone()]).await;
    h.registry
        .dispatch(&RpcRequest::RulesUpsert(upsert.after.clone()))
        .await
        .unwrap();
    let before = h.configuration().await;
    let asked = h
        .registry
        .dispatch(&RpcRequest::Ask(AskParams {
            chamber: WritChamber::Gatehouse,
            prompt: "Simulated: switch the links rule mode".into(),
            writ_id: None,
        }))
        .await;
    assert!(asked.is_err(), "a setMode suggestion must not yield a writ");
    assert!(stored(&h).await.is_empty(), "nothing invalid is stored");
    assert_eq!(before, h.configuration().await);
    // Other proposal kinds are unchanged and the store still reads.
    let next = h.ask(WritChamber::Gatehouse, "Simulated: links rule").await;
    assert_eq!(next.status, WritStatus::Proposed);
    let rows = stored(&h).await;
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].writ_id, next.writ_id);
}
