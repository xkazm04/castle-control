//! Generated SIMULATED OBS 33 removal regressions; no live OBS or credentials.
#[allow(dead_code)]
mod ownership_support;
#[path = "ownership_support/retained.rs"]
mod retained;
use cc_obs::{Error, Ownership};
use ownership_support::{Root, source};
use serde_json::json;

const ENDPOINT: &str = "ws://simulated-obs:4466";

#[tokio::test]
async fn off_air_remove_acknowledgement_retains_items_until_uuid_matched_detachment() {
    let root = Root::new();
    let (mut client, peer) = retained::start().await;
    let mut ledger = Ownership::open(&root.0).unwrap();
    ledger
        .ensure_scene(&mut client, ENDPOINT, "simulated-scene")
        .await
        .unwrap();
    ledger
        .create_source(&mut client, ENDPOINT, &source())
        .await
        .unwrap();
    assert_eq!(
        ledger.create_source(&mut client, ENDPOINT, &source()).await,
        Err(Error::Rejected)
    );
    // Reproduce the old clear's exact failure: OBS acknowledged removal, but
    // the non-program scene and source references remain indefinitely.
    client.remove_input(retained::UUID).await.unwrap();
    assert!(
        client
            .get_scene_item_list("simulated-scene")
            .await
            .unwrap()
            .scene_items
            .iter()
            .any(|item| item.source_uuid == retained::UUID)
    );
    assert_eq!(peer.state.lock().unwrap().acknowledgements, 1);
    drop(ledger);
    let mut ledger = Ownership::open(&root.0).unwrap();
    assert_eq!(ledger.clear(&mut client, ENDPOINT).await.unwrap(), 1);
    let inputs = client.get_input_list().await.unwrap();
    assert_eq!(inputs.inputs.len(), 1);
    assert_eq!(inputs.inputs[0].input_uuid, retained::FOREIGN);
    assert_eq!(peer.state.lock().unwrap().detachments, vec![12]);
    assert!(peer.state.lock().unwrap().scene);
    assert_eq!(root.read()["endpoints"][ENDPOINT]["inputs"], json!([]));
    // The scene stays owned while foreign content prevents its removal.
    peer.state.lock().unwrap().foreign = false;
    assert_eq!(ledger.clear(&mut client, ENDPOINT).await.unwrap(), 0);
    assert!(!peer.state.lock().unwrap().scene);
}

#[tokio::test]
async fn success_status_without_actual_removal_times_out_and_keeps_cleanup_authority() {
    let root = Root::new();
    let (mut client, peer) = retained::start().await;
    let mut ledger = Ownership::open(&root.0).unwrap();
    ledger
        .ensure_scene(&mut client, ENDPOINT, "simulated-scene")
        .await
        .unwrap();
    ledger
        .create_source(&mut client, ENDPOINT, &source())
        .await
        .unwrap();
    peer.state.lock().unwrap().ignore_detach = true;
    assert_eq!(
        ledger.clear(&mut client, ENDPOINT).await,
        Err(Error::Timeout)
    );
    assert_eq!(
        root.read()["endpoints"][ENDPOINT]["inputs"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert!(peer.state.lock().unwrap().owned);
    peer.state.lock().unwrap().ignore_detach = false;
    drop(ledger);
    let mut ledger = Ownership::open(&root.0).unwrap();
    assert_eq!(ledger.clear(&mut client, ENDPOINT).await.unwrap(), 1);
}

#[tokio::test]
async fn foreign_replacement_reusing_source_name_and_item_id_is_never_removed_or_counted() {
    let root = Root::new();
    let (mut client, peer) = retained::start().await;
    let mut ledger = Ownership::open(&root.0).unwrap();
    ledger
        .ensure_scene(&mut client, ENDPOINT, "simulated-scene")
        .await
        .unwrap();
    ledger
        .create_source(&mut client, ENDPOINT, &source())
        .await
        .unwrap();
    {
        let mut state = peer.state.lock().unwrap();
        state.owned = false; // Owner deleted our input by hand.
        state.replacement = true; // A foreign input now uses its name and item ID.
    }
    assert_eq!(
        ledger.create_source(&mut client, ENDPOINT, &source()).await,
        Err(Error::Rejected)
    );
    assert_eq!(ledger.clear(&mut client, ENDPOINT).await.unwrap(), 0);
    assert!(peer.state.lock().unwrap().foreign);
    assert!(peer.state.lock().unwrap().detachments.is_empty());
    assert_eq!(root.read()["endpoints"][ENDPOINT]["inputs"], json!([]));
}
