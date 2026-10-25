//! Generated simulated audit events; no network or real viewer data.
use cc_store::{
    DrawRiskSetting, DrawSlug, EngineClass, EngineProvider, LedgerEvent, LedgerKind, ModelName,
    Store, Timestamp,
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::fs;
use ulid::Ulid;

fn engine(model_served: Option<ModelName>) -> LedgerEvent {
    engine_with(
        EngineClass::Live,
        EngineProvider::LocalEndpoint,
        model_served,
    )
}

fn engine_with(
    class: EngineClass,
    provider: EngineProvider,
    model_served: Option<ModelName>,
) -> LedgerEvent {
    LedgerEvent::Engine {
        call_id: Ulid::from(1u128),
        cost_microusd: 5,
        class,
        provider,
        model_selected: ModelName::parse("simulated-model").unwrap(),
        model_served,
    }
}

fn risk(setting: DrawRiskSetting) -> LedgerEvent {
    LedgerEvent::DrawRiskAcknowledged {
        draw_id: DrawSlug::parse("simulated-draw-1").unwrap(),
        setting,
    }
}

fn assert_roundtrip(event: LedgerEvent, kind: LedgerKind, canonical_event: &str) {
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(dir.path()).unwrap();
    assert_eq!(event.ledger_kind(), kind);
    let event_at = Timestamp::parse("2026-10-25T00:00:01Z").unwrap();
    let recorded_at = Timestamp::parse("2026-10-25T00:00:02Z").unwrap();
    let line = store
        .append_ledger(event_at.clone(), recorded_at.clone(), event.clone())
        .unwrap();
    let unsigned = format!(
        "{{\"event\":{canonical_event},\"event_at\":\"2026-10-25T00:00:01.000000000Z\",\"recorded_at\":\"2026-10-25T00:00:02.000000000Z\",\"schema_version\":1}}"
    );
    let digest = format!("{:x}", Sha256::digest(unsigned.as_bytes()));
    assert_eq!(line.digest, digest);
    assert_eq!(line.event, event);
    assert_eq!(line.event_at, event_at);
    assert_eq!(line.recorded_at, recorded_at);
    assert_eq!(line.schema_version, 1);
    let expected = format!("{{\"digest\":\"{digest}\",{}\n", &unsigned[1..]);
    assert_eq!(
        fs::read_to_string(dir.path().join(kind.filename())).unwrap(),
        expected
    );
    for ledger in LedgerKind::ALL {
        let expected = if ledger == kind {
            vec![line.clone()]
        } else {
            vec![]
        };
        assert_eq!(store.read_ledger(ledger).unwrap(), expected);
    }
    store.verify_inventory().unwrap();
    drop(store);
    assert_eq!(
        Store::open(dir.path()).unwrap().read_ledger(kind).unwrap(),
        vec![line]
    );
}

#[test]
fn engine_roundtrips_in_engine_ledger_with_canonical_bytes_and_digest() {
    for (class, class_name) in [
        (EngineClass::Live, "live"),
        (EngineClass::NearLive, "near_live"),
        (EngineClass::Batch, "batch"),
        (EngineClass::Offline, "offline"),
    ] {
        for (provider, provider_name) in [
            (EngineProvider::LocalEndpoint, "local_endpoint"),
            (EngineProvider::OpenaiApi, "openai_api"),
            (EngineProvider::ClaudeCli, "claude_cli"),
            (EngineProvider::CodexCli, "codex_cli"),
        ] {
            for answered in [false, true] {
                let served = answered.then(|| ModelName::parse("simulated-served").unwrap());
                let event = engine_with(class, provider, served);
                let served_field = if answered {
                    ",\"model_served\":\"simulated-served\""
                } else {
                    ""
                };
                let expected = format!(
                    "{{\"call_id\":\"00000000000000000000000001\",\"class\":\"{class_name}\",\"cost_microusd\":5,\"kind\":\"engine\",\"model_selected\":\"simulated-model\"{served_field},\"provider\":\"{provider_name}\"}}"
                );
                assert_roundtrip(event, LedgerKind::Engine, &expected);
            }
        }
    }
}

#[test]
fn risk_acknowledgements_roundtrip_in_draws_ledger_before_a_run_exists() {
    for (setting, name) in [
        (DrawRiskSetting::PaidEntry, "paid_entry"),
        (DrawRiskSetting::PaidWeight, "paid_weight"),
        (DrawRiskSetting::PrizeValueOverCap, "prize_value_over_cap"),
    ] {
        let expected = format!(
            "{{\"draw_id\":\"simulated-draw-1\",\"kind\":\"draw_risk_acknowledged\",\"setting\":\"{name}\"}}"
        );
        assert_roundtrip(risk(setting), LedgerKind::Draws, &expected);
    }
}

#[test]
fn event_schemas_reject_unknown_fields_nulls_and_unknown_enum_values() {
    let engine = serde_json::to_value(engine(None)).unwrap();
    assert!(engine.get("model_served").is_none());
    for (key, value) in [
        ("model_served", Value::Null),
        ("class", json!("unknown")),
        ("provider", json!("unknown")),
        ("reason", json!("simulated forbidden free text")),
    ] {
        let mut invalid = engine.clone();
        invalid[key] = value;
        assert!(serde_json::from_value::<LedgerEvent>(invalid).is_err());
    }
    for key in ["class", "provider", "model_selected"] {
        let mut invalid = engine.clone();
        invalid.as_object_mut().unwrap().remove(key);
        assert!(serde_json::from_value::<LedgerEvent>(invalid).is_err());
    }
    let risk = serde_json::to_value(risk(DrawRiskSetting::PaidEntry)).unwrap();
    for (key, value) in [
        ("setting", json!("unknown")),
        ("reason", json!("simulated forbidden free text")),
        ("draw_id", Value::Null),
    ] {
        let mut invalid = risk.clone();
        invalid[key] = value;
        assert!(serde_json::from_value::<LedgerEvent>(invalid).is_err());
    }
}

#[test]
fn model_names_validate_at_construction_and_both_deserialization_fields() {
    for invalid in [
        "".to_owned(),
        " ".to_owned(),
        "x".repeat(129),
        "simulated-模型".to_owned(),
        "simulated model".to_owned(),
        "simulated\nmodel".to_owned(),
        "simulated\\model".to_owned(),
        "simulated?model".to_owned(),
    ] {
        assert!(ModelName::parse(&invalid).is_err());
        assert!(ModelName::try_from(invalid.clone()).is_err());
        assert!(serde_json::from_value::<ModelName>(json!(invalid)).is_err());
        for key in ["model_selected", "model_served"] {
            let mut value = serde_json::to_value(engine(None)).unwrap();
            value[key] = json!(invalid);
            assert!(serde_json::from_value::<LedgerEvent>(value).is_err());
        }
    }
    for valid in ["x".repeat(128), "AZaz09._:/@+-".to_owned()] {
        let name = ModelName::parse(&valid).unwrap();
        assert_eq!(name.as_str(), valid);
        assert_eq!(String::from(name.clone()), valid);
        assert_eq!(
            serde_json::from_value::<ModelName>(json!(valid)).unwrap(),
            name
        );
    }
}

#[test]
fn draw_slug_matches_draw_id_accept_and_reject_cases() {
    // Same cases as cc-types/tests/contract.rs:108-114, without a dependency.
    for valid in [
        "simulated-rule-1".to_owned(),
        "0".to_owned(),
        "a".repeat(256),
    ] {
        let slug = DrawSlug::parse(&valid).unwrap();
        assert_eq!(slug.as_str(), valid);
        assert_eq!(String::from(slug.clone()), valid);
        assert_eq!(DrawSlug::try_from(valid.clone()).unwrap(), slug);
        assert_eq!(
            serde_json::from_value::<DrawSlug>(json!(valid)).unwrap(),
            slug
        );
    }
    for invalid in [
        "",
        "MixedCase",
        "two--parts",
        "-leading",
        "trailing-",
        "has space",
        "under_score",
        "nonascii-é",
        "line\n",
        "slash/part",
    ] {
        assert!(DrawSlug::parse(invalid).is_err());
        assert!(DrawSlug::try_from(invalid.to_owned()).is_err());
        assert!(serde_json::from_value::<DrawSlug>(json!(invalid)).is_err());
        let mut event = serde_json::to_value(risk(DrawRiskSetting::PaidEntry)).unwrap();
        event["draw_id"] = json!(invalid);
        assert!(serde_json::from_value::<LedgerEvent>(event).is_err());
    }
}

#[test]
fn new_events_reject_digest_tampering_and_noncanonical_bytes() {
    for event in [engine(None), risk(DrawRiskSetting::PaidEntry)] {
        for noncanonical in [false, true] {
            let dir = tempfile::tempdir().unwrap();
            let mut store = Store::open(dir.path()).unwrap();
            let kind = event.ledger_kind();
            let at = Timestamp::parse("2026-10-25T00:00:01Z").unwrap();
            store.append_ledger(at.clone(), at, event.clone()).unwrap();
            let path = dir.path().join(kind.filename());
            let original = fs::read_to_string(&path).unwrap();
            let corrupted = if noncanonical {
                format!(" {original}")
            } else {
                original
                    .replace("\"cost_microusd\":5", "\"cost_microusd\":6")
                    .replace("paid_entry", "paid_weight")
            };
            assert_ne!(corrupted, original);
            fs::write(&path, &corrupted).unwrap();
            assert!(store.read_ledger(kind).is_err());
            drop(store);
            assert!(Store::open(dir.path()).is_err());
            assert_eq!(fs::read_to_string(path).unwrap(), corrupted);
        }
    }
}

#[test]
fn new_events_survive_forget_and_are_erased_by_existing_full_purge() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(dir.path()).unwrap();
    store
        .map_user(
            cc_store::TwitchUserId::parse("123").unwrap(),
            "simulated_viewer",
        )
        .unwrap();
    let at = Timestamp::parse("2026-10-25T00:00:01Z").unwrap();
    for event in [engine(None), risk(DrawRiskSetting::PaidEntry)] {
        store.append_ledger(at.clone(), at.clone(), event).unwrap();
    }
    let before: Vec<_> = [LedgerKind::Engine, LedgerKind::Draws]
        .into_iter()
        .map(|kind| (kind, fs::read(dir.path().join(kind.filename())).unwrap()))
        .collect();
    store.forget_user("simulated_viewer", at.clone()).unwrap();
    assert_eq!(store.lookup_user("simulated_viewer").unwrap(), None);
    for (kind, bytes) in before {
        assert_eq!(fs::read(dir.path().join(kind.filename())).unwrap(), bytes);
    }
    let preview = store.preview(cc_store::Purge::All, at.clone()).unwrap();
    assert_eq!(preview.counts["engine.jsonl"], 1);
    assert_eq!(preview.counts["draws.jsonl"], 1);
    assert_eq!(store.purge_all(at).unwrap(), preview);
    store.verify_inventory().unwrap();
    drop(store);
    let reopened = Store::open(dir.path()).unwrap();
    for kind in LedgerKind::ALL {
        assert!(reopened.read_ledger(kind).unwrap().is_empty());
    }
}
