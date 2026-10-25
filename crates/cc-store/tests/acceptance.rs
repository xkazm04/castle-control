mod common;

use cc_store::{DEFAULT_RETENTION_S, Error, MIN_RETENTION_S, Purge, STORE_INVENTORY, Store};
use common::*;
use std::fs;

#[test]
fn ledger_append_only_preserves_existing_bytes_and_digest() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(dir.path()).unwrap();
    let first = store.append_ledger(at(1), at(2), decision(1)).unwrap();
    let before = fs::read(dir.path().join("decisions.jsonl")).unwrap();
    store.append_ledger(at(3), at(4), decision(2)).unwrap();
    let after = fs::read(dir.path().join("decisions.jsonl")).unwrap();
    assert!(after.starts_with(&before));
    let lines = store.read_ledger(cc_store::LedgerKind::Decisions).unwrap();
    assert_eq!(lines.len(), 2);
    assert_eq!(lines[0], first);
    assert_eq!(lines[0].event_at, at(1));
    assert_eq!(lines[0].recorded_at, at(2));
    assert!(
        !String::from_utf8(after)
            .unwrap()
            .contains("simulated_login")
    );
    drop(store);
    assert_eq!(
        Store::open(dir.path())
            .unwrap()
            .read_ledger(cc_store::LedgerKind::Decisions)
            .unwrap(),
        lines
    );
}

#[test]
fn forget_user_erases_associations_across_inventory_preserving_ledgers() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = populated(dir.path());
    let preview = store
        .preview(Purge::ForgetUser("SIMULATED_LOGIN".into()), at(10))
        .unwrap();
    assert_eq!(preview.counts["viewer_mappings"], 1);
    for kind in cc_store::DataStore::ALL {
        assert_eq!(preview.counts[kind.name()], 2);
    }
    let before = fs::read(dir.path().join("decisions.jsonl")).unwrap();
    assert_eq!(
        store.forget_user("SIMULATED_LOGIN", at(10)).unwrap(),
        preview
    );
    assert_eq!(store.lookup_user("simulated_login").unwrap(), None);
    for kind in cc_store::DataStore::ALL {
        let items = store.items(kind).unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].user_ids, vec![user(2)]);
    }
    assert_eq!(
        fs::read(dir.path().join("decisions.jsonl")).unwrap(),
        before
    );
    assert!(
        store
            .forget_user("simulated_login", at(10))
            .unwrap()
            .counts
            .values()
            .all(|n| *n == 0)
    );
}

#[test]
fn revocation_callback_purge_all_empties_every_inventory_store() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = populated(dir.path());
    store.set_retention_s(MIN_RETENTION_S).unwrap();
    let expected = store.preview(Purge::All, at(10)).unwrap();
    let on_revoked = |store: &mut Store| store.purge_all(at(10));
    assert_eq!(on_revoked(&mut store).unwrap(), expected);
    assert!(
        store
            .preview(Purge::All, at(10))
            .unwrap()
            .counts
            .values()
            .all(|n| *n == 0)
    );
    assert_eq!(store.retention_s().unwrap(), DEFAULT_RETENTION_S);
    drop(store);
    let reopened = Store::open(dir.path()).unwrap();
    assert!(
        reopened
            .preview(Purge::All, at(10))
            .unwrap()
            .counts
            .values()
            .all(|n| *n == 0)
    );
}

#[test]
fn retention_below_floor_is_refused_without_changing_setting() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(dir.path()).unwrap();
    assert_eq!(store.retention_s().unwrap(), DEFAULT_RETENTION_S);
    store.set_retention_s(MIN_RETENTION_S).unwrap();
    assert!(matches!(
        store.set_retention_s(MIN_RETENTION_S - 1),
        Err(Error::RetentionBelowFloor { .. })
    ));
    assert_eq!(store.retention_s().unwrap(), MIN_RETENTION_S);
    drop(store);
    assert_eq!(
        Store::open(dir.path()).unwrap().retention_s().unwrap(),
        MIN_RETENTION_S
    );
}

#[test]
fn dry_run_counts_and_as_of_match_exact_retention_predicate() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(dir.path()).unwrap();
    store.set_retention_s(MIN_RETENTION_S).unwrap();
    store.map_user(user(1), "simulated_login").unwrap();
    for kind in cc_store::DataStore::ALL {
        for second in [0, 1, 2] {
            store
                .insert(kind, &item(second + 1, second, vec![user(1)]))
                .unwrap();
        }
    }
    let now = at(MIN_RETENTION_S + 1);
    let preview = store
        .preview(Purge::ExpiredRecordings, now.clone())
        .unwrap();
    assert_eq!(preview.as_of, now);
    assert_eq!(preview.counts["recordings"], 1);
    assert_eq!(preview.counts.values().sum::<u64>(), 1);
    assert_eq!(
        store.items(cc_store::DataStore::Recordings).unwrap().len(),
        3
    );
    assert_eq!(store.purge_expired(now).unwrap(), preview);
    assert_eq!(
        store.items(cc_store::DataStore::Recordings).unwrap().len(),
        2
    );
    assert_eq!(store.items(cc_store::DataStore::Writs).unwrap().len(), 3);
}

#[test]
fn inventory_names_every_sqlite_store_and_persistent_file() {
    let dir = tempfile::tempdir().unwrap();
    let store = Store::open(dir.path()).unwrap();
    store.verify_inventory().unwrap();
    let conn = rusqlite::Connection::open(dir.path().join("store.sqlite3")).unwrap();
    conn.execute("CREATE TABLE simulated_uninventoried (id TEXT)", [])
        .unwrap();
    assert!(matches!(
        store.verify_inventory(),
        Err(Error::InventoryMismatch)
    ));
    assert!(!STORE_INVENTORY.is_empty());
}
