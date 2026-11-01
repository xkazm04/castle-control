//! Seal ordering against a simulated store whose audit append is made to fail.
#[allow(dead_code)]
mod steward_support;

use cc_store::{ConfigurationItem, DataStore};
use cc_types::*;
use steward_support::{Harness, fixture};
use ulid::Ulid;

#[tokio::test]
async fn audit_failure_never_leaves_change_applied_with_writ_proposed() {
    let source = fixture(0);
    let h = Harness::new(std::slice::from_ref(&source)).await;
    let writ = h.ask(source.chamber, "Simulated").await;
    assert_eq!(writ.status, WritStatus::Proposed);
    // An audit row with the maximum ID leaves no next ID, so appends fail.
    let mut other = writ.clone();
    other.writ_id = WritId::mint();
    other.status = WritStatus::Torn;
    h.store
        .lock()
        .await
        .insert_configuration(
            DataStore::Writs,
            &ConfigurationItem::new(
                Ulid::from(u128::MAX),
                cc_store::Timestamp::now(),
                serde_json::to_string(&other).unwrap(),
                true,
            ),
        )
        .unwrap();
    let before = h.configuration().await;
    assert!(h.seal(&writ.writ_id).await.is_err());
    let applied = before != h.configuration().await;
    let stored = h
        .store
        .lock()
        .await
        .configuration_items(DataStore::Writs)
        .unwrap()
        .into_iter()
        .filter_map(|item| serde_json::from_str::<Writ>(&item.content).ok())
        .rfind(|w| w.writ_id == writ.writ_id)
        .unwrap();
    assert!(
        !(applied && stored.status == WritStatus::Proposed),
        "change applied while the writ is still Proposed"
    );
    assert!(!applied, "an unauditable seal must not apply");
}
