//! Generated simulated seal metadata; no viewer handles or network data.
use cc_store::{LedgerEvent, LedgerKind, SealDigest, Store, Timestamp};
use serde_json::{Value, json};

fn seal_json() -> Value {
    json!({
        "kind": "draw_sealed",
        "draw_run_id": "00000000000000000000000001",
        "draw_id": "simulated-draw",
        "seal_digest": "0123456789abcdef".repeat(4),
        "entry_count": 3,
        "winner_count": 2
    })
}

#[test]
fn seal_roundtrips_in_draws_ledger_and_reopens() {
    let value = seal_json();
    let event: LedgerEvent = serde_json::from_value(value.clone()).unwrap();
    assert_eq!(serde_json::to_value(&event).unwrap(), value);
    assert_eq!(event.ledger_kind(), LedgerKind::Draws);
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(dir.path()).unwrap();
    let at = Timestamp::parse("2026-10-25T00:00:01Z").unwrap();
    let line = store.append_ledger(at.clone(), at, event.clone()).unwrap();
    assert_eq!(line.schema_version, 1);
    assert_eq!(line.event, event);
    let lines = store.read_ledger(LedgerKind::Draws).unwrap();
    assert_eq!(lines.as_slice(), std::slice::from_ref(&line));
    assert!(store.read_ledger(LedgerKind::Decisions).unwrap().is_empty());
    assert!(store.read_ledger(LedgerKind::Engine).unwrap().is_empty());
    drop(store);
    assert_eq!(
        Store::open(dir.path())
            .unwrap()
            .read_ledger(LedgerKind::Draws)
            .unwrap(),
        [line]
    );
}

#[test]
fn seal_schema_rejects_unknown_fields_missing_fields_and_explicit_nulls() {
    let valid = seal_json();
    for key in ["reason", "viewer_handle", "extra"] {
        let mut invalid = valid.clone();
        invalid[key] = json!("simulated-forbidden");
        assert!(serde_json::from_value::<LedgerEvent>(invalid).is_err());
    }
    for key in valid.as_object().unwrap().keys() {
        let mut missing = valid.clone();
        missing.as_object_mut().unwrap().remove(key);
        assert!(serde_json::from_value::<LedgerEvent>(missing).is_err());
        let mut null = valid.clone();
        null[key] = Value::Null;
        assert!(serde_json::from_value::<LedgerEvent>(null).is_err());
    }
    for key in ["entry_count", "winner_count"] {
        for value in [json!(-1), json!(1.5), json!("2"), json!(u64::MAX)] {
            let mut invalid = valid.clone();
            invalid[key] = value;
            assert!(serde_json::from_value::<LedgerEvent>(invalid).is_err());
        }
    }
}

#[test]
fn seal_digest_validates_at_construction_and_deserialization() {
    let valid = "0123456789abcdef".repeat(4);
    let digest = SealDigest::parse(&valid).unwrap();
    assert_eq!(digest.as_str(), valid);
    assert_eq!(String::from(digest.clone()), valid);
    assert_eq!(SealDigest::try_from(valid).unwrap(), digest);
    for invalid in [
        String::new(),
        "0".repeat(63),
        "0".repeat(65),
        "ABCDEF0123456789".repeat(4),
        "g".repeat(64),
        format!("{}\n", "0".repeat(63)),
        "é".repeat(32),
    ] {
        assert!(SealDigest::parse(&invalid).is_err());
        assert!(SealDigest::try_from(invalid.clone()).is_err());
        assert!(serde_json::from_value::<SealDigest>(json!(invalid)).is_err());
        let mut event = seal_json();
        event["seal_digest"] = json!(invalid);
        assert!(serde_json::from_value::<LedgerEvent>(event).is_err());
    }
}
