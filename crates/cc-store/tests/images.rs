mod common;
use cc_store::{Purge, Store};
use cc_types::{LOCAL_IMAGE_MAX_BYTES, LocalImageContent};
use rusqlite::Connection;
use sha2::{Digest, Sha256};

fn simulated_image() -> LocalImageContent {
    LocalImageContent::try_from(b"\x89PNG\r\n\x1a\nsimulated-signature-only".to_vec()).unwrap()
}

#[test]
fn asset_round_trips_after_reopen_and_deduplicates_inside_app_data() {
    let app_data = tempfile::tempdir().unwrap();
    let mut store = Store::open(app_data.path()).unwrap();
    let image = simulated_image();
    let reference = store.store_image(&image).unwrap();
    assert_eq!(store.store_image(&image).unwrap(), reference);
    let digest = String::from(reference);
    assert_eq!(digest, format!("{:x}", Sha256::digest(image.as_bytes())));
    drop(store);
    let store = Store::open(app_data.path()).unwrap();
    assert_eq!(store.load_image(&digest).unwrap(), Some(image));
    store.verify_inventory().unwrap();
    let conn = Connection::open(app_data.path().join("store.sqlite3")).unwrap();
    let count: u32 = conn
        .query_row("SELECT COUNT(*) FROM image_assets", [], |r| r.get(0))
        .unwrap();
    assert_eq!(count, 1);
    assert_eq!(store.load_image(&"0".repeat(64)).unwrap(), None);
    for path in [
        "../outside.png",
        "assets/../../outside.png",
        "C:\\outside.png",
        "/outside.png",
        "https://example.invalid/image.png",
        "file:///image.png",
        "%2e%2e/image.png",
    ] {
        assert!(store.load_image(path).is_err());
    }
}

#[test]
fn migration_preserves_v2_settings_and_assets_follow_full_purge_policy() {
    let app_data = tempfile::tempdir().unwrap();
    let store = Store::open(app_data.path()).unwrap();
    drop(store);
    let conn = Connection::open(app_data.path().join("store.sqlite3")).unwrap();
    conn.execute_batch(
        "DROP TABLE image_assets; PRAGMA user_version=2;
        INSERT INTO engine_settings VALUES ('engine.cloud_opt_in','false');",
    )
    .unwrap();
    drop(conn);
    let mut store = Store::open(app_data.path()).unwrap();
    assert_eq!(store.engine_settings().unwrap().values.len(), 1);
    let reference = String::from(store.store_image(&simulated_image()).unwrap());
    let forgotten = store
        .forget_user("simulated_viewer", common::at(10))
        .unwrap();
    assert_eq!(forgotten.counts["image_assets"], 0);
    assert!(store.load_image(&reference).unwrap().is_some());
    let preview = store.preview(Purge::All, common::at(10)).unwrap();
    assert_eq!(preview.counts["image_assets"], 1);
    assert_eq!(store.purge_all(common::at(10)).unwrap(), preview);
    assert_eq!(store.load_image(&reference).unwrap(), None);
    drop(store);
    assert_eq!(
        Store::open(app_data.path())
            .unwrap()
            .load_image(&reference)
            .unwrap(),
        None
    );
}

#[test]
fn storage_checks_bounds_and_rejects_corrupted_content() {
    let app_data = tempfile::tempdir().unwrap();
    let mut store = Store::open(app_data.path()).unwrap();
    let reference = String::from(store.store_image(&simulated_image()).unwrap());
    let conn = Connection::open(app_data.path().join("store.sqlite3")).unwrap();
    assert!(
        conn.execute(
            "INSERT INTO image_assets VALUES (?1, ?2)",
            rusqlite::params!["b".repeat(64), vec![0u8; LOCAL_IMAGE_MAX_BYTES + 1]]
        )
        .is_err()
    );
    assert!(
        conn.execute(
            "INSERT INTO image_assets VALUES ('../outside', x'ffd8ff')",
            []
        )
        .is_err()
    );
    conn.execute(
        "UPDATE image_assets SET content=x'ffd8ff' WHERE digest=?1",
        [&reference],
    )
    .unwrap();
    assert!(store.load_image(&reference).is_err());
    assert!(store.store_image(&simulated_image()).is_err());
}
