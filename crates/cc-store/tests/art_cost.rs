//! Generated simulated art receipts; no provider calls or real viewer data.
use cc_store::{ImageProvider, ImageProviderAmount, LedgerEvent, LedgerKind, Store, Timestamp};
use cc_types::{ArtCallId, ArtCredits};
use serde_json::{Value, json};
use std::fs;

fn receipt(credits: &str, cost: Option<u64>) -> Value {
    let mut event = json!({
        "kind": "image_provider_cost",
        "provider": "leonardo",
        "credits": credits,
        "call_id": "00000000000000000000000001"
    });
    if let Some(cost) = cost {
        event["cost_microusd"] = json!(cost);
    }
    event
}

fn at() -> Timestamp {
    Timestamp::parse("2026-10-28T00:00:00Z").unwrap()
}

#[test]
fn dollar_only_amount_roundtrips_without_inventing_credits() {
    let mut value = receipt("1", None);
    value.as_object_mut().unwrap().remove("credits");
    for cost in [0, 104_700, u64::MAX] {
        value["micro_usd"] = json!(cost);
        let event: LedgerEvent = serde_json::from_value(value.clone()).unwrap();
        assert!(matches!(
            &event,
            LedgerEvent::ImageProviderCost {
                amount: ImageProviderAmount::MicroUsd(amount),
                cost_microusd: None,
                ..
            } if *amount == cost
        ));
        assert_eq!(serde_json::to_value(&event).unwrap(), value);
        let dir = tempfile::tempdir().unwrap();
        let mut store = Store::open(dir.path()).unwrap();
        let line = store.append_ledger(at(), at(), event).unwrap();
        assert_eq!(line.schema_version, 1);
        assert_eq!(
            store.read_ledger(LedgerKind::Engine).unwrap().as_slice(),
            std::slice::from_ref(&line)
        );
        drop(store);
        let reopened = Store::open(dir.path()).unwrap();
        assert_eq!(reopened.read_ledger(LedgerKind::Engine).unwrap(), [line]);
    }
}

#[test]
fn image_cost_requires_exactly_one_primary_amount() {
    let mut both = receipt("1.25", None);
    both["micro_usd"] = json!(104_700);
    assert!(serde_json::from_value::<LedgerEvent>(both).is_err());
    let mut neither = receipt("1.25", None);
    neither.as_object_mut().unwrap().remove("credits");
    assert!(serde_json::from_value::<LedgerEvent>(neither).is_err());
    for invalid in [
        Value::Null,
        json!(-1),
        json!(1.5),
        json!("104700"),
        json!(true),
    ] {
        let mut value = receipt("1", None);
        value.as_object_mut().unwrap().remove("credits");
        value["micro_usd"] = invalid;
        assert!(serde_json::from_value::<LedgerEvent>(value).is_err());
    }
    for value in [json!({}), json!({"credits":"1", "micro_usd":5})] {
        assert!(serde_json::from_value::<ImageProviderAmount>(value).is_err());
    }
}

#[test]
fn existing_art_lines_keep_their_amount_metadata_digests_and_bytes() {
    // Frozen v1 art rows; SHA-256 computed independently with Node's crypto.
    let mut legacy = String::new();
    for (cost, digest) in [
        (
            "",
            "530fb8a88228711cfad5ef2ef093e0dd77e4fccd9b5bc434268952f1fcc59516",
        ),
        (
            ",\"cost_microusd\":104700",
            "9335741c1f9e810740792f253aba35d41da754b8a7b1d1fe2810621a33e5eaf1",
        ),
    ] {
        legacy.push_str(&format!(
            "{{\"digest\":\"{digest}\",\"event\":{{\"call_id\":\"00000000000000000000000001\"{cost},\"credits\":\"000012.340000\",\"kind\":\"image_provider_cost\",\"provider\":\"leonardo\"}},\"event_at\":\"2026-10-28T00:00:00.000000000Z\",\"recorded_at\":\"2026-10-28T00:00:00.000000000Z\",\"schema_version\":1}}\n"
        ));
    }
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("engine.jsonl");
    fs::write(&path, &legacy).unwrap();
    let mut store = Store::open(dir.path()).unwrap();
    let old = store.read_ledger(LedgerKind::Engine).unwrap();
    for (line, cost) in old.iter().zip([None, Some(104_700)]) {
        assert_eq!(
            line.event,
            LedgerEvent::ImageProviderCost {
                provider: ImageProvider::Leonardo,
                amount: ImageProviderAmount::Credits(
                    "000012.340000".to_owned().try_into().unwrap()
                ),
                cost_microusd: cost,
                call_id: "00000000000000000000000001".to_owned().try_into().unwrap(),
            }
        );
    }
    assert_eq!(old.len(), 2);
    assert_eq!(fs::read(&path).unwrap(), legacy.as_bytes());
    let mut dollar = receipt("1", None);
    dollar.as_object_mut().unwrap().remove("credits");
    dollar["micro_usd"] = json!(104_700);
    let line = store
        .append_ledger(at(), at(), serde_json::from_value(dollar).unwrap())
        .unwrap();
    assert!(fs::read(&path).unwrap().starts_with(legacy.as_bytes()));
    drop(store);
    let reopened = Store::open(dir.path()).unwrap();
    let lines = reopened.read_ledger(LedgerKind::Engine).unwrap();
    assert_eq!(&lines[..2], old.as_slice());
    assert_eq!(lines[2], line);
}

#[test]
fn image_cost_roundtrips_routes_and_preserves_decimal_bytes() {
    for credits in ["0", "000012.340000", "999999999999.999999"] {
        for cost in [None, Some(0), Some(u64::MAX)] {
            let value = receipt(credits, cost);
            let event: LedgerEvent = serde_json::from_value(value.clone()).unwrap();
            assert_eq!(serde_json::to_value(&event).unwrap(), value);
            assert_eq!(event.ledger_kind(), LedgerKind::Engine);
            let dir = tempfile::tempdir().unwrap();
            let mut store = Store::open(dir.path()).unwrap();
            let line = store.append_ledger(at(), at(), event).unwrap();
            assert_eq!(line.schema_version, 1);
            let bytes = fs::read(dir.path().join("engine.jsonl")).unwrap();
            let exact = format!("\"credits\":\"{credits}\"");
            assert!(
                bytes
                    .windows(exact.len())
                    .any(|part| part == exact.as_bytes())
            );
            assert_eq!(
                store.read_ledger(LedgerKind::Engine).unwrap().as_slice(),
                std::slice::from_ref(&line)
            );
            for kind in [LedgerKind::Draws, LedgerKind::Decisions] {
                assert!(store.read_ledger(kind).unwrap().is_empty());
            }
            drop(store);
            let reopened = Store::open(dir.path()).unwrap();
            assert_eq!(reopened.read_ledger(LedgerKind::Engine).unwrap(), [line]);
            assert_eq!(fs::read(dir.path().join("engine.jsonl")).unwrap(), bytes);
        }
    }
}

#[test]
fn image_cost_rejects_nondecimal_credits_at_the_type_door() {
    for invalid in [
        "",
        "NaN",
        "Infinity",
        "1e2",
        "-1",
        "+1",
        ".5",
        "1.",
        "1.2.3",
        " 1",
        "1\n",
        "１２",
        "1234567890123",
        "1.1234567",
    ] {
        assert!(ArtCredits::try_from(invalid.to_owned()).is_err());
        assert!(serde_json::from_value::<LedgerEvent>(receipt(invalid, None)).is_err());
    }
    for value in [Value::Null, json!(1.5), json!(5), json!(true)] {
        let mut invalid = receipt("1.25", None);
        invalid["credits"] = value;
        assert!(serde_json::from_value::<LedgerEvent>(invalid).is_err());
    }
}

#[test]
fn image_cost_rejects_unknown_missing_null_and_invalid_fields() {
    let valid = receipt("1.25", Some(5));
    for key in valid.as_object().unwrap().keys() {
        let mut invalid = valid.clone();
        invalid[key] = Value::Null;
        assert!(serde_json::from_value::<LedgerEvent>(invalid).is_err());
        if key != "cost_microusd" {
            let mut invalid = valid.clone();
            invalid.as_object_mut().unwrap().remove(key);
            assert!(serde_json::from_value::<LedgerEvent>(invalid).is_err());
        }
    }
    for (key, value) in [
        ("provider", json!("unknown")),
        ("call_id", json!("not-an-art-call-id")),
        ("cost_microusd", json!(-1)),
        ("cost_microusd", json!(1.5)),
        ("cost_microusd", json!("5")),
        ("prompt", json!("simulated forbidden free text")),
    ] {
        let mut invalid = valid.clone();
        invalid[key] = value;
        assert!(serde_json::from_value::<LedgerEvent>(invalid).is_err());
    }
}

#[test]
fn pre_art_v1_ledger_reads_and_append_keeps_old_bytes_unchanged() {
    // Frozen pre-change engine record with independently computed SHA-256.
    let legacy = concat!(
        "{\"digest\":\"6c3f7a77361fe5318cefb48e722f5afdcb7fa781143340e76e3ee3c96e52cede\",",
        "\"event\":{\"call_id\":\"00000000000000000000000001\",\"class\":\"batch\",",
        "\"cost_microusd\":5,\"kind\":\"engine\",\"model_selected\":\"simulated-model\",",
        "\"provider\":\"local_endpoint\"},\"event_at\":\"2026-10-25T00:00:01.000000000Z\",",
        "\"recorded_at\":\"2026-10-25T00:00:02.000000000Z\",\"schema_version\":1}\n"
    );
    let dir = tempfile::tempdir().unwrap();
    fs::write(dir.path().join("engine.jsonl"), legacy).unwrap();
    let mut store = Store::open(dir.path()).unwrap();
    let old = store.read_ledger(LedgerKind::Engine).unwrap();
    assert_eq!(old.len(), 1);
    assert!(matches!(old[0].event, LedgerEvent::Engine { .. }));
    let event = serde_json::from_value(receipt("001.250000", None)).unwrap();
    store.append_ledger(at(), at(), event).unwrap();
    assert!(
        fs::read(dir.path().join("engine.jsonl"))
            .unwrap()
            .starts_with(legacy.as_bytes())
    );
    drop(store);
    let reopened = Store::open(dir.path()).unwrap();
    let lines = reopened.read_ledger(LedgerKind::Engine).unwrap();
    assert_eq!(lines.len(), 2);
    assert_eq!(lines[0], old[0]);
}

#[test]
fn typed_art_receipt_survives_forget_and_full_purge_erases_it() {
    let event = LedgerEvent::ImageProviderCost {
        provider: ImageProvider::Leonardo,
        amount: ImageProviderAmount::Credits(
            ArtCredits::try_from("0001.250000".to_owned()).unwrap(),
        ),
        cost_microusd: None,
        call_id: ArtCallId::try_from("00000000000000000000000001".to_owned()).unwrap(),
    };
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(dir.path()).unwrap();
    store.append_ledger(at(), at(), event).unwrap();
    let path = dir.path().join("engine.jsonl");
    let before = fs::read(&path).unwrap();
    store.forget_user("simulated_viewer", at()).unwrap();
    assert_eq!(fs::read(&path).unwrap(), before);
    let preview = store.preview(cc_store::Purge::All, at()).unwrap();
    assert_eq!(preview.counts["engine.jsonl"], 1);
    assert_eq!(store.purge_all(at()).unwrap(), preview);
    assert!(fs::read(path).unwrap().is_empty());
    store.verify_inventory().unwrap();
}
