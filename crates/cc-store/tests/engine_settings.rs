mod common;

use cc_store::{DataStore, MIN_RETENTION_S, Purge, Store};
use cc_types::Settings;
use common::*;
use rusqlite::Connection;
use serde_json::json;
use sha2::{Digest, Sha256};
use std::path::Path;

fn settings(value: serde_json::Value) -> Settings {
    serde_json::from_value(json!({"values": value})).unwrap()
}

fn version(root: &Path) -> u32 {
    Connection::open(root.join("store.sqlite3"))
        .unwrap()
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .unwrap()
}

#[test]
fn fresh_database_is_v3_and_engine_settings_round_trip_after_reopen() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(dir.path()).unwrap();
    assert_eq!(version(dir.path()), 3);
    assert!(store.engine_settings().unwrap().values.is_empty());
    let path = dir.path().join("simulated-program.exe");
    let expected = settings(json!({
        "engine.cli_provider": "codex_cli",
        "engine.live_endpoint": "http://127.0.0.1:11434/v1",
        "engine.cloud_opt_in": false,
        "engine.claude_exe_path": path,
        "engine.codex_exe_path": path,
        "engine.posture_helper_path": path,
        "engine.model_local": "simulated-local",
        "engine.model_claude": "simulated-claude",
        "engine.model_codex": "simulated-codex"
    }));
    store.set_engine_settings(&expected).unwrap();
    drop(store);
    let mut reopened = Store::open(dir.path()).unwrap();
    assert_eq!(reopened.engine_settings().unwrap(), expected);
    // Whole-map replacement allows optional overrides to be removed.
    reopened.set_engine_settings(&settings(json!({}))).unwrap();
    assert!(reopened.engine_settings().unwrap().values.is_empty());
}

#[test]
fn v1_migrates_to_v3_preserving_retention_viewer_data_and_ledger_bytes() {
    let dir = tempfile::tempdir().unwrap();
    // Frozen v1 schema: no v2 implementation is used to construct the fixture.
    let conn = Connection::open(dir.path().join("store.sqlite3")).unwrap();
    conn.execute_batch(
        "CREATE TABLE viewer_mappings (user_id TEXT NOT NULL, login TEXT PRIMARY KEY NOT NULL);
         CREATE TABLE settings (key TEXT PRIMARY KEY CHECK(key='retention_s'), value INTEGER NOT NULL CHECK(value>=86400));
         CREATE TABLE purge_state (id INTEGER PRIMARY KEY CHECK(id=1));
         INSERT INTO settings VALUES ('retention_s',86400);
         PRAGMA user_version=1;",
    ).unwrap();
    for table in ["recordings", "rollups", "caches", "exports", "writs"] {
        conn.execute_batch(&format!(
            "CREATE TABLE {table} (id TEXT PRIMARY KEY NOT NULL, at TEXT NOT NULL,
             user_ids TEXT NOT NULL CHECK(json_valid(user_ids)), item TEXT NOT NULL CHECK(json_valid(item)));
             CREATE INDEX {table}_at ON {table}(at);"
        )).unwrap();
    }
    let item = item(1, 0, vec![user(1)]);
    conn.execute(
        "INSERT INTO viewer_mappings VALUES ('1','simulated_login')",
        [],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO recordings VALUES (?1,?2,?3,?4)",
        rusqlite::params![
            item.id.to_string(),
            item.at.as_rfc3339(),
            "[\"1\"]",
            serde_json::to_string(&item).unwrap()
        ],
    )
    .unwrap();
    drop(conn);
    assert_eq!(version(dir.path()), 1);
    // Frozen v1 event shape; digest computed independently of the store writer.
    let unsigned = r#"{"event":{"action":"would_act","decision_id":"00000000000000000000000001","kind":"decision","user_id":"1"},"event_at":"2026-10-25T00:00:01.000000000Z","recorded_at":"2026-10-25T00:00:02.000000000Z","schema_version":1}"#;
    let digest = format!("{:x}", Sha256::digest(unsigned.as_bytes()));
    let ledger = format!("{{\"digest\":\"{digest}\",{}\n", &unsigned[1..]);
    std::fs::write(dir.path().join("decisions.jsonl"), ledger.as_bytes()).unwrap();
    let mut store = Store::open(dir.path()).unwrap();
    assert_eq!(version(dir.path()), 3);
    assert_eq!(store.retention_s().unwrap(), MIN_RETENTION_S);
    assert_eq!(store.items(DataStore::Recordings).unwrap(), vec![item]);
    assert_eq!(
        std::fs::read(dir.path().join("decisions.jsonl")).unwrap(),
        ledger.as_bytes()
    );
    store
        .set_engine_settings(&settings(json!({"engine.cloud_opt_in": false})))
        .unwrap();
    assert_eq!(store.retention_s().unwrap(), MIN_RETENTION_S);
    drop(store);
    let conn = Connection::open(dir.path().join("store.sqlite3")).unwrap();
    assert!(
        conn.execute(
            "INSERT INTO settings VALUES ('engine.cloud_opt_in',86400)",
            []
        )
        .is_err()
    );
    assert!(conn.execute("UPDATE settings SET value=1", []).is_err());
}

#[test]
fn invalid_or_unknown_engine_settings_write_nothing_and_sql_failure_rolls_back() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(dir.path()).unwrap();
    let initial = settings(json!({"engine.cli_provider": "codex_cli"}));
    store.set_engine_settings(&initial).unwrap();
    for values in [
        json!({"engine.cli_provider":"claude_cli", "engine.cloud_opt_in":"false"}),
        json!({"engine.cli_provider":"claude_cli", "engine.unknown":true}),
        json!({"retention_s":86400}),
        json!({"engine.live_endpoint":"https://user:password@example.invalid"}),
    ] {
        assert!(store.set_engine_settings(&settings(values)).is_err());
        assert_eq!(store.engine_settings().unwrap(), initial);
    }
    let conn = Connection::open(dir.path().join("store.sqlite3")).unwrap();
    conn.execute_batch(
        "CREATE TRIGGER simulated_write_failure BEFORE INSERT ON engine_settings
        WHEN NEW.key='engine.cloud_opt_in' BEGIN SELECT RAISE(ABORT,'simulated failure'); END;",
    )
    .unwrap();
    let replacement =
        settings(json!({"engine.cli_provider":"claude_cli", "engine.cloud_opt_in":true}));
    assert!(store.set_engine_settings(&replacement).is_err());
    assert_eq!(store.engine_settings().unwrap(), initial);
    assert!(
        conn.execute(
            "INSERT INTO engine_settings VALUES ('engine.unknown','true')",
            []
        )
        .is_err()
    );
}

#[test]
fn viewer_free_engine_settings_survive_forget_but_purge_all_clears_configuration() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = populated(dir.path());
    let expected =
        settings(json!({"engine.cli_provider":"codex_cli", "engine.cloud_opt_in":false}));
    store.set_engine_settings(&expected).unwrap();
    let forgotten = store.forget_user("simulated_login", at(10)).unwrap();
    assert_eq!(forgotten.counts["engine_settings"], 0);
    assert_eq!(store.engine_settings().unwrap(), expected);
    let preview = store.preview(Purge::All, at(10)).unwrap();
    assert_eq!(preview.counts["engine_settings"], 2);
    assert_eq!(store.purge_all(at(10)).unwrap(), preview);
    // Match the existing settings policy: full/revoked purge resets configuration,
    // even though these allowlisted settings hold no viewer data.
    assert!(store.engine_settings().unwrap().values.is_empty());
    drop(store);
    assert!(
        Store::open(dir.path())
            .unwrap()
            .engine_settings()
            .unwrap()
            .values
            .is_empty()
    );
}
