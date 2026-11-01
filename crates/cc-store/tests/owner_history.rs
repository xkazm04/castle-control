mod common;

use cc_store::{DataStore, Store};
use common::*;
use rusqlite::Connection;

fn reassigned(path: &std::path::Path) -> Store {
    let mut store = Store::open(path).unwrap();
    store.map_user(user(1), "simulated_foo").unwrap();
    store
        .insert(DataStore::Recordings, &item(1, 0, vec![user(1)]))
        .unwrap();
    // Another account takes the login the first user renamed away from.
    store.map_user(user(2), "simulated_foo").unwrap();
    store
        .insert(DataStore::Recordings, &item(2, 0, vec![user(2)]))
        .unwrap();
    store
}

#[test]
fn reassignment_keeps_the_previous_owner_and_forgetting_the_new_owner_spares_them() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = reassigned(dir.path());
    assert_eq!(store.lookup_user("simulated_foo").unwrap(), Some(user(2)));
    let result = store.forget_user("simulated_foo", at(1)).unwrap();
    assert_eq!(result.counts["recordings"], 1);
    let left = store.items(DataStore::Recordings).unwrap();
    assert_eq!(left.len(), 1);
    assert_eq!(left[0].user_ids, vec![user(1)]);
}

#[test]
fn previous_owner_is_still_reachable_by_id_and_by_a_later_login() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = reassigned(dir.path());
    let preview = store.forget_user_id(&user(1), at(1)).unwrap();
    assert_eq!(preview.counts["recordings"], 1);
    assert_eq!(preview.counts["viewer_mappings"], 1);
    let left = store.items(DataStore::Recordings).unwrap();
    assert_eq!(left.len(), 1);
    assert_eq!(left[0].user_ids, vec![user(2)]);
    assert_eq!(store.lookup_user("simulated_foo").unwrap(), Some(user(2)));

    // A previous owner who took a new login is reached through it too.
    let dir = tempfile::tempdir().unwrap();
    let mut store = reassigned(dir.path());
    store.map_user(user(1), "simulated_bar").unwrap();
    let preview = store.forget_user("simulated_bar", at(1)).unwrap();
    assert_eq!(preview.counts["recordings"], 1);
    assert_eq!(preview.counts["viewer_mappings"], 2);
    assert_eq!(store.items(DataStore::Recordings).unwrap().len(), 1);
}

#[test]
fn same_user_remapping_a_login_is_not_a_second_owner() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(dir.path()).unwrap();
    store.map_user(user(1), "simulated_foo").unwrap();
    store.map_user(user(1), "simulated_foo").unwrap();
    let preview = store.forget_user("simulated_foo", at(1)).unwrap();
    assert_eq!(preview.counts["viewer_mappings"], 1);
}

#[test]
fn v3_with_existing_mappings_migrates_to_v4_preserving_rows_and_order() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(dir.path()).unwrap();
    store.map_user(user(1), "simulated_foo").unwrap();
    store
        .insert(DataStore::Recordings, &item(1, 0, vec![user(1)]))
        .unwrap();
    drop(store);
    // Frozen v3 shape: one row per login, login as the primary key.
    let conn = Connection::open(dir.path().join("store.sqlite3")).unwrap();
    conn.execute_batch(
        "DROP TABLE viewer_mappings;
         CREATE TABLE viewer_mappings (user_id TEXT NOT NULL, login TEXT PRIMARY KEY NOT NULL);
         INSERT INTO viewer_mappings VALUES ('1','simulated_foo');
         INSERT INTO viewer_mappings VALUES ('1','simulated_bar');
         INSERT INTO viewer_mappings VALUES ('2','simulated_baz');
         PRAGMA user_version=3;",
    )
    .unwrap();
    drop(conn);
    let mut store = Store::open(dir.path()).unwrap();
    let version: u32 = Connection::open(dir.path().join("store.sqlite3"))
        .unwrap()
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .unwrap();
    assert_eq!(version, 4);
    assert_eq!(store.lookup_user("simulated_foo").unwrap(), Some(user(1)));
    assert_eq!(store.lookup_user("simulated_baz").unwrap(), Some(user(2)));
    assert_eq!(store.items(DataStore::Recordings).unwrap().len(), 1);
    // The migrated table now keeps history across reassignment.
    store.map_user(user(2), "simulated_foo").unwrap();
    assert_eq!(store.lookup_user("simulated_foo").unwrap(), Some(user(2)));
    let preview = store.forget_user_id(&user(1), at(1)).unwrap();
    assert_eq!(preview.counts["viewer_mappings"], 2);
    assert_eq!(preview.counts["recordings"], 1);
    store.verify_inventory().unwrap();
}
