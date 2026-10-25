mod common;

use cc_store::{
    DataStore, DecisionAction, Error, LedgerEvent, LedgerKind, Purge, Store, StoredItem, Timestamp,
    TwitchUserId,
};
use common::*;
use sha2::{Digest, Sha256};
use std::fs;
use ulid::Ulid;

#[test]
fn canonical_ledger_has_independently_recomputed_digest() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(dir.path()).unwrap();
    let line = store.append_ledger(at(1), at(2), decision(1)).unwrap();
    let unsigned = r#"{"event":{"action":"would_act","decision_id":"00000000000000000000000001","kind":"decision","user_id":"1"},"event_at":"2026-10-25T00:00:01.000000000Z","recorded_at":"2026-10-25T00:00:02.000000000Z","schema_version":1}"#;
    assert_eq!(
        line.digest,
        format!("{:x}", Sha256::digest(unsigned.as_bytes()))
    );
    let expected = format!("{{\"digest\":\"{}\",{}\n", line.digest, &unsigned[1..]);
    assert_eq!(
        fs::read_to_string(dir.path().join("decisions.jsonl")).unwrap(),
        expected
    );
}

#[test]
fn ledger_omits_absent_ids_and_schema_rejects_text_null_and_unknown_fields() {
    let event = LedgerEvent::Decision {
        decision_id: Ulid::from(1u128),
        user_id: None,
        action: DecisionAction::Held,
    };
    let value = serde_json::to_value(&event).unwrap();
    assert!(value.get("user_id").is_none());
    assert_eq!(
        serde_json::from_value::<LedgerEvent>(value.clone()).unwrap(),
        event
    );
    for forbidden in [
        serde_json::json!({"user_id": null}),
        serde_json::json!({"message": "simulated message"}),
        serde_json::json!({"login": "simulated_login"}),
        serde_json::json!({"user_id": "simulated_login"}),
    ] {
        let mut invalid = value.clone();
        invalid
            .as_object_mut()
            .unwrap()
            .extend(forbidden.as_object().unwrap().clone());
        assert!(serde_json::from_value::<LedgerEvent>(invalid).is_err());
    }
    for id in ["", "0", "01", "simulated_login"] {
        assert!(TwitchUserId::parse(id).is_err());
    }
    assert_eq!(
        TwitchUserId::parse("9007199254740993").unwrap().as_str(),
        "9007199254740993"
    );
    assert!(Timestamp::parse("2026-10-25T01:00:00+01:00").is_err());
    assert_eq!(
        Timestamp::parse("2026-10-25T00:00:00+00:00").unwrap(),
        at(0)
    );
}

#[test]
fn ledger_tampering_and_incomplete_tail_fail_closed_without_rewriting() {
    for partial in [false, true] {
        let dir = tempfile::tempdir().unwrap();
        let mut store = Store::open(dir.path()).unwrap();
        store.append_ledger(at(1), at(2), decision(1)).unwrap();
        let path = dir.path().join("decisions.jsonl");
        let bytes = fs::read_to_string(&path).unwrap();
        let corrupted = if partial {
            format!("{bytes}{{")
        } else {
            bytes.replace("would_act", "timed_out")
        };
        fs::write(&path, &corrupted).unwrap();
        assert!(store.read_ledger(LedgerKind::Decisions).is_err());
        assert!(matches!(
            store.append_ledger(at(3), at(4), decision(2)),
            Err(Error::LedgerIntegrity)
        ));
        drop(store);
        assert!(Store::open(dir.path()).is_err());
        assert_eq!(fs::read_to_string(path).unwrap(), corrupted);
    }
}

#[test]
fn interrupted_full_purge_resumes_before_data_can_be_read() {
    let dir = tempfile::tempdir().unwrap();
    let store = populated(dir.path());
    drop(store);
    let conn = rusqlite::Connection::open(dir.path().join("store.sqlite3")).unwrap();
    conn.execute("INSERT INTO purge_state (id) VALUES (1)", [])
        .unwrap();
    drop(conn);
    // Simulate interruption during the first ledger truncate.
    fs::write(dir.path().join("decisions.jsonl"), b"{simulated_partial").unwrap();
    let mut reopened = Store::open(dir.path()).unwrap();
    assert!(
        reopened
            .preview(Purge::All, at(1))
            .unwrap()
            .counts
            .values()
            .all(|n| *n == 0)
    );
    reopened.append_ledger(at(1), at(2), decision(1)).unwrap();
    assert_eq!(
        reopened.read_ledger(LedgerKind::Decisions).unwrap().len(),
        1
    );
}

#[test]
fn forget_removes_all_login_aliases_and_shared_artifacts() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = populated(dir.path());
    store.map_user(user(1), "simulated_renamed").unwrap();
    let result = store.forget_user("simulated_login", at(1)).unwrap();
    assert_eq!(result.counts["viewer_mappings"], 2);
    assert_eq!(store.lookup_user("simulated_renamed").unwrap(), None);
    assert_eq!(store.items(DataStore::Writs).unwrap().len(), 1);
}

#[test]
fn store_requires_viewer_associations_and_exclusive_writer() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(dir.path()).unwrap();
    assert!(Store::open(dir.path()).is_err());
    assert!(
        store
            .insert(DataStore::Recordings, &item(1, 0, vec![]))
            .is_err()
    );
    assert!(
        store
            .insert(DataStore::Recordings, &item(1, 0, vec![user(1)]))
            .is_err()
    );
    store.map_user(user(1), "simulated_login").unwrap();
    let bad = serde_json::json!({"id": Ulid::from(1u128), "at": "2026-10-25T00:00:00Z", "user_ids": ["1"], "content": "simulated", "simulated": true, "extra": true});
    assert!(serde_json::from_value::<StoredItem>(bad).is_err());
    store
        .insert(DataStore::Recordings, &item(1, 0, vec![user(1)]))
        .unwrap();
    drop(store);
    assert_eq!(
        Store::open(dir.path())
            .unwrap()
            .items(DataStore::Recordings)
            .unwrap()
            .len(),
        1
    );
}

#[test]
fn full_purge_remains_available_after_detected_ledger_corruption() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = populated(dir.path());
    fs::write(dir.path().join("decisions.jsonl"), b"{simulated_partial").unwrap();
    assert!(store.read_ledger(LedgerKind::Decisions).is_err());
    let preview = store.preview(Purge::All, at(1)).unwrap();
    assert_eq!(preview.counts["decisions.jsonl"], 1);
    assert_eq!(store.purge_all(at(1)).unwrap(), preview);
    store.append_ledger(at(1), at(2), decision(1)).unwrap();
    assert_eq!(store.read_ledger(LedgerKind::Decisions).unwrap().len(), 1);
}
