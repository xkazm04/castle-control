mod common;

use cc_store::{
    ConfigurationItem, DataStore, Error, ForgetPolicy, Purge, PurgePolicy, STORE_INVENTORY, Store,
};
use common::*;
use ulid::Ulid;

fn configuration(id: u64) -> ConfigurationItem {
    ConfigurationItem::new(
        Ulid::from(u128::from(id)),
        at(0),
        format!("simulated configuration {id}"),
        true,
    )
}

#[test]
fn viewer_free_writ_round_trips_without_mapping_alongside_legacy_writ() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(dir.path()).unwrap();
    let config = configuration(1);
    store
        .insert_configuration(DataStore::Writs, &config)
        .unwrap();
    store.map_user(user(1), "simulated_login").unwrap();
    let legacy = item(2, 0, vec![user(1)]);
    store.insert(DataStore::Writs, &legacy).unwrap();
    drop(store);

    let store = Store::open(dir.path()).unwrap();
    assert_eq!(
        store.configuration_items(DataStore::Writs).unwrap(),
        vec![config]
    );
    // The existing Lot Chamber reader must never see Steward configuration content.
    assert_eq!(store.items(DataStore::Writs).unwrap(), vec![legacy]);
    let conn = rusqlite::Connection::open(dir.path().join("store.sqlite3")).unwrap();
    let associations: String = conn
        .query_row(
            "SELECT user_ids FROM writs WHERE id=?1",
            [Ulid::from(1u128).to_string()],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(associations, "[]");
    let version: u32 = conn
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .unwrap();
    assert_eq!(version, 1);
}

#[test]
fn only_writs_is_allowlisted_and_every_other_store_refuses_configuration() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(dir.path()).unwrap();
    for kind in DataStore::ALL {
        assert_eq!(kind.allows_configuration(), kind == DataStore::Writs);
        if kind == DataStore::Writs {
            continue;
        }
        assert!(matches!(
            store.insert_configuration(kind, &configuration(1)),
            Err(Error::ConfigurationStoreNotAllowed(actual)) if actual == kind
        ));
        assert!(matches!(
            store.configuration_items(kind),
            Err(Error::ConfigurationStoreNotAllowed(actual)) if actual == kind
        ));
        assert!(store.items(kind).unwrap().is_empty());
    }
    assert!(
        store
            .preview(Purge::All, at(1))
            .unwrap()
            .counts
            .values()
            .all(|n| *n == 0)
    );
}

#[test]
fn ordinary_items_still_require_nonempty_and_fully_mapped_viewers_in_every_store() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(dir.path()).unwrap();
    store.map_user(user(1), "simulated_login").unwrap();
    for kind in DataStore::ALL {
        assert!(matches!(
            store.insert(kind, &item(1, 0, vec![])),
            Err(Error::Invalid("item without viewer associations"))
        ));
        assert!(matches!(
            store.insert(kind, &item(1, 0, vec![user(1), user(2)])),
            Err(Error::Invalid("unmapped viewer association"))
        ));
        assert!(store.items(kind).unwrap().is_empty());
    }
}

#[test]
fn forget_preserves_configuration_but_deletes_any_matching_viewer_writ_with_exact_counts() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = populated(dir.path());
    let config = configuration(4);
    store
        .insert_configuration(DataStore::Writs, &config)
        .unwrap();
    store.map_user(user(1), "simulated_alias").unwrap();
    let before = store.preview(Purge::All, at(10)).unwrap();
    let preview = store
        .preview(Purge::ForgetUser("simulated_login".into()), at(10))
        .unwrap();
    assert_eq!(preview.counts["writs"], 2);
    assert_eq!(
        store.configuration_items(DataStore::Writs).unwrap(),
        vec![config.clone()]
    );
    assert_eq!(store.items(DataStore::Writs).unwrap().len(), 3);
    assert_eq!(
        store.forget_user("simulated_login", at(10)).unwrap(),
        preview
    );
    let after = store.preview(Purge::All, at(10)).unwrap();
    for kind in DataStore::ALL {
        assert_eq!(
            before.counts[kind.name()] - after.counts[kind.name()],
            preview.counts[kind.name()]
        );
        assert_eq!(store.items(kind).unwrap(), vec![item(2, 0, vec![user(2)])]);
    }
    assert_eq!(
        before.counts["viewer_mappings"] - after.counts["viewer_mappings"],
        preview.counts["viewer_mappings"]
    );
    assert_eq!(store.lookup_user("simulated_alias").unwrap(), None);
    assert_eq!(
        store.configuration_items(DataStore::Writs).unwrap(),
        vec![config.clone()]
    );
    let unknown = store
        .preview(Purge::ForgetUser("simulated_login".into()), at(11))
        .unwrap();
    assert!(unknown.counts.values().all(|n| *n == 0));
    assert_eq!(
        store.forget_user("simulated_login", at(11)).unwrap(),
        unknown
    );
    assert_eq!(
        store.configuration_items(DataStore::Writs).unwrap(),
        vec![config]
    );
}

#[test]
fn full_and_revoked_authorization_purge_delete_both_writ_shapes_with_exact_counts() {
    for revoked in [false, true] {
        let dir = tempfile::tempdir().unwrap();
        let mut store = populated(dir.path());
        store
            .insert_configuration(DataStore::Writs, &configuration(4))
            .unwrap();
        let spec = STORE_INVENTORY
            .iter()
            .find(|spec| spec.name == "writs")
            .unwrap();
        assert_eq!(spec.forget_user, ForgetPolicy::DeleteAssociatedItem);
        assert_eq!(spec.purge_all, PurgePolicy::DeleteRows);
        let preview = store.preview(Purge::All, at(10)).unwrap();
        assert_eq!(preview.counts["writs"], 4);
        let executed = if revoked {
            let on_revoked = |store: &mut Store| store.purge_all(at(10));
            on_revoked(&mut store).unwrap()
        } else {
            store.purge_all(at(10)).unwrap()
        };
        assert_eq!(executed, preview);
        assert!(store.items(DataStore::Writs).unwrap().is_empty());
        assert!(
            store
                .configuration_items(DataStore::Writs)
                .unwrap()
                .is_empty()
        );
        assert!(
            store
                .preview(Purge::All, at(10))
                .unwrap()
                .counts
                .values()
                .all(|n| *n == 0)
        );
        drop(store);
        let reopened = Store::open(dir.path()).unwrap();
        assert!(reopened.items(DataStore::Writs).unwrap().is_empty());
        assert!(
            reopened
                .configuration_items(DataStore::Writs)
                .unwrap()
                .is_empty()
        );
    }
}

#[test]
fn configuration_does_not_change_inventory_fail_closed_behavior() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(dir.path()).unwrap();
    store
        .insert_configuration(DataStore::Writs, &configuration(1))
        .unwrap();
    store.verify_inventory().unwrap();
    let conn = rusqlite::Connection::open(dir.path().join("store.sqlite3")).unwrap();
    conn.execute(
        "CREATE TABLE simulated_unlisted_configuration (id TEXT)",
        [],
    )
    .unwrap();
    assert!(matches!(
        store.verify_inventory(),
        Err(Error::InventoryMismatch)
    ));
    assert!(matches!(
        store.preview(Purge::All, at(1)),
        Err(Error::InventoryMismatch)
    ));
}

#[test]
fn configuration_shape_cannot_carry_viewer_associations_or_nulls() {
    let value = serde_json::to_value(configuration(1)).unwrap();
    assert_eq!(
        serde_json::from_value::<ConfigurationItem>(value.clone()).unwrap(),
        configuration(1)
    );
    assert_eq!(value["kind"], "configuration");
    assert!(value.get("user_ids").is_none());
    for forbidden in [
        serde_json::json!([]),
        serde_json::json!(["1"]),
        serde_json::Value::Null,
    ] {
        let mut invalid = value.clone();
        invalid["user_ids"] = forbidden;
        assert!(serde_json::from_value::<ConfigurationItem>(invalid).is_err());
    }
    let mut invalid = value.clone();
    invalid["kind"] = serde_json::json!("viewer");
    assert!(serde_json::from_value::<ConfigurationItem>(invalid).is_err());
    for field in ["kind", "id", "at", "content", "simulated"] {
        let mut invalid = value.clone();
        invalid[field] = serde_json::Value::Null;
        assert!(serde_json::from_value::<ConfigurationItem>(invalid).is_err());
        let mut invalid = value.clone();
        invalid.as_object_mut().unwrap().remove(field);
        assert!(serde_json::from_value::<ConfigurationItem>(invalid).is_err());
    }
}

#[test]
fn readers_refuse_empty_viewer_items_and_configuration_in_nonallowlisted_tables() {
    let dir = tempfile::tempdir().unwrap();
    let store = Store::open(dir.path()).unwrap();
    let conn = rusqlite::Connection::open(dir.path().join("store.sqlite3")).unwrap();
    for kind in DataStore::ALL {
        let invalid = item(1, 0, vec![]);
        conn.execute(
            &format!(
                "INSERT INTO {} (id,at,user_ids,item) VALUES (?1,?2,'[]',?3)",
                kind.name()
            ),
            rusqlite::params![
                invalid.id.to_string(),
                invalid.at.as_rfc3339(),
                serde_json::to_string(&invalid).unwrap()
            ],
        )
        .unwrap();
        assert!(matches!(
            store.items(kind),
            Err(Error::Invalid("item without viewer associations"))
        ));
        if kind == DataStore::Writs {
            assert!(matches!(
                store.configuration_items(kind),
                Err(Error::Invalid("item without viewer associations"))
            ));
        }
        conn.execute(&format!("DELETE FROM {}", kind.name()), [])
            .unwrap();
        if kind == DataStore::Writs {
            continue;
        }
        conn.execute(
            &format!(
                "INSERT INTO {} (id,at,user_ids,item) VALUES (?1,?2,'[]',?3)",
                kind.name()
            ),
            rusqlite::params![
                Ulid::from(1u128).to_string(),
                at(0).as_rfc3339(),
                serde_json::to_string(&configuration(1)).unwrap()
            ],
        )
        .unwrap();
        assert!(
            matches!(store.items(kind), Err(Error::ConfigurationStoreNotAllowed(actual)) if actual == kind)
        );
    }
}

#[test]
fn interrupted_full_purge_erases_configuration_before_reopen_serves_data() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = populated(dir.path());
    store
        .insert_configuration(DataStore::Writs, &configuration(4))
        .unwrap();
    drop(store);
    let conn = rusqlite::Connection::open(dir.path().join("store.sqlite3")).unwrap();
    conn.execute("INSERT INTO purge_state (id) VALUES (1)", [])
        .unwrap();
    drop(conn);
    let reopened = Store::open(dir.path()).unwrap();
    assert!(
        reopened
            .configuration_items(DataStore::Writs)
            .unwrap()
            .is_empty()
    );
    assert!(reopened.items(DataStore::Writs).unwrap().is_empty());
    assert!(
        reopened
            .preview(Purge::All, at(10))
            .unwrap()
            .counts
            .values()
            .all(|n| *n == 0)
    );
}
