mod common;

use cc_store::Store;
use common::*;

fn raw_application_id(dir: &std::path::Path) -> i32 {
    rusqlite::Connection::open(dir.join("store.sqlite3"))
        .unwrap()
        .query_row("PRAGMA application_id", [], |row| row.get(0))
        .unwrap()
}

#[test]
fn every_erasure_path_moves_the_generation() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = populated(dir.path());
    let start = store.erasure_generation().unwrap();
    let viewer = store.viewer_erasure_generation().unwrap();

    // Expiry that deletes nothing moves neither counter (it runs per capture).
    store.purge_expired(at(1)).unwrap();
    assert_eq!(store.erasure_generation().unwrap(), start);

    // Expiry that deletes recordings moves the full word, not the viewer half.
    let late = at(400 * 24 * 3600);
    let preview = store.purge_expired(late).unwrap();
    assert!(preview.counts["recordings"] > 0);
    let expired = store.erasure_generation().unwrap();
    assert_ne!(expired, start);
    assert_eq!(store.viewer_erasure_generation().unwrap(), viewer);

    store.forget_user("simulated_login", at(2)).unwrap();
    let forgotten = store.erasure_generation().unwrap();
    assert_ne!(forgotten, expired);
    let viewer_forgotten = store.viewer_erasure_generation().unwrap();
    assert_ne!(viewer_forgotten, viewer);

    store.purge_all(at(3)).unwrap();
    assert_ne!(store.erasure_generation().unwrap(), forgotten);
    assert_ne!(store.viewer_erasure_generation().unwrap(), viewer_forgotten);
}

#[test]
fn generation_is_sqlite_visible_and_survives_reopen() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = populated(dir.path());
    store.purge_all(at(3)).unwrap();
    let generation = store.erasure_generation().unwrap();
    // Another connection to the same database sees the committed value.
    let seen = raw_application_id(dir.path());
    assert_eq!(u32::from_ne_bytes(seen.to_ne_bytes()), generation);
    drop(store);
    let store = Store::open(dir.path()).unwrap();
    assert_eq!(store.erasure_generation().unwrap(), generation);
}

#[test]
fn crash_recovery_of_an_interrupted_purge_moves_the_generation() {
    let dir = tempfile::tempdir().unwrap();
    let store = populated(dir.path());
    let before = store.erasure_generation().unwrap();
    drop(store);
    rusqlite::Connection::open(dir.path().join("store.sqlite3"))
        .unwrap()
        .execute("INSERT INTO purge_state (id) VALUES (1)", [])
        .unwrap();
    let store = Store::open(dir.path()).unwrap();
    assert_ne!(store.erasure_generation().unwrap(), before);
}
