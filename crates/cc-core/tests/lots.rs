#[path = "lots_support/display.rs"]
mod display;
mod lots_support;
use cc_core::{
    Registry,
    lots::{LotsClock, LotsModule},
};
use cc_lots::{Intake, PassedMessage};
use cc_types::{ErrorCode, EventKind, LotsEventPayload, LotsWrit, Verdict, parse_request};
use lots_support::*;
use serde_json::json;
use std::sync::{Arc, atomic::Ordering};

#[tokio::test]
async fn seven_methods_validate_and_streamer_writ_verifies_without_client_winners() {
    let h = Harness::new();
    assert_eq!(h.registry.methods(), {
        let mut methods = LotsModule::METHODS.to_vec();
        methods.sort();
        methods
    });
    assert_eq!(
        h.call("lots.draw.list", json!({})).await,
        json!({"draws":[]})
    );
    h.upsert().await;
    assert_eq!(
        h.call("lots.draw.list", json!({})).await,
        json!({"draws":[draw()]})
    );
    assert_eq!(
        h.call("lots.draw.check", json!({"policy":draw()["policy"]}))
            .await,
        json!({"result":"ok","reasons":[]})
    );
    assert_eq!(h.add("1"), Intake::Added);
    assert_eq!(h.add("2"), Intake::Added);
    let lookup = h
        .call(
            "lots.roll.lookup",
            json!({"draw_id":"simulated-draw","user_id":"1"}),
        )
        .await;
    assert_eq!(lookup["entry"]["user_id"], "1");
    let sealed = h.seal("streamer_commit").await;
    assert_eq!(
        error(&h.registry, "lots.draw.upsert", json!({"draw":draw()})).await,
        ErrorCode::Conflict
    );
    assert_eq!(
        error(
            &h.registry,
            "lots.roll.seal",
            json!({"draw_id":"simulated-draw","source":"streamer_commit","margin_s":1})
        )
        .await,
        ErrorCode::Conflict
    );
    let run = &sealed["draw_run_id"];
    assert!(
        parse_request(
            &serde_json::to_vec(
                &json!({"method":"lots.cast","params":{"draw_run_id":run,"winners":["2"]}})
            )
            .unwrap()
        )
        .is_err()
    );
    let cast = h.call("lots.cast", json!({"draw_run_id":run})).await;
    let count = h.events.since(0).unwrap().len();
    assert_eq!(h.call("lots.cast", json!({"draw_run_id":run})).await, cast);
    assert_eq!(h.events.since(0).unwrap().len(), count);
    let writ = h
        .call("lots.writ.get", json!({"writ_id":cast["writ_id"]}))
        .await;
    let verified = cc_verify::verify_writ_json(&writ.to_string(), None).unwrap();
    assert_eq!(serde_json::to_value(verified).unwrap(), cast["cast"]);
    assert_eq!(writ["seal"], sealed["sealed"]["seal"]);
    assert!(writ.get("draw_run_id").is_none());
    assert_eq!(cast["cast"]["label"], "streamer-controlled");
}

#[tokio::test]
async fn typed_payload_sink_matches_invalidations_and_recorded_quicknet_cast() {
    let h = Harness::new();
    let mut sink = h.module.subscribe();
    h.upsert().await;
    for user in ["1", "2", "3"] {
        assert_eq!(h.add(user), Intake::Added);
    }
    assert_eq!(h.add("1"), Intake::AlreadyEntered);
    let sealed = h.seal("drand_quicknet").await;
    assert_eq!(sealed["sealed"]["roll"]["randomness"]["round"], "2");
    let cast = h
        .call("lots.cast", json!({"draw_run_id":sealed["draw_run_id"]}))
        .await;
    let writ = h
        .call("lots.writ.get", json!({"writ_id":cast["writ_id"]}))
        .await;
    let verified = cc_verify::verify_writ_json(&writ.to_string(), Some(&chain())).unwrap();
    assert_eq!(serde_json::to_value(verified).unwrap(), cast["cast"]);
    let mut payloads = Vec::new();
    while let Ok(payload) = sink.try_recv() {
        payloads.push(payload);
    }
    let events = h.events.since(0).unwrap();
    assert_eq!(events.len(), payloads.len());
    assert_eq!(payloads.len(), 6);
    for (event, payload) in events.iter().zip(&payloads) {
        let wire = serde_json::to_value(payload).unwrap();
        assert_eq!(
            serde_json::from_value::<LotsEventPayload>(wire.clone()).unwrap(),
            *payload
        );
        assert_eq!(serde_json::to_value(event.kind).unwrap(), wire["kind"]);
        assert_eq!(
            serde_json::to_value(event)
                .unwrap()
                .as_object()
                .unwrap()
                .len(),
            3
        );
    }
    assert_eq!(
        serde_json::to_value(&payloads[4]).unwrap(),
        json!({"kind":"lots.sealed","payload":sealed})
    );
    assert_eq!(
        serde_json::to_value(&payloads[5]).unwrap(),
        json!({"kind":"lots.cast","payload":cast})
    );
    match &payloads[3] {
        LotsEventPayload::Roll(roll) => {
            assert_eq!(roll.weight_table.rows.len(), 3);
            assert!(
                roll.weight_table
                    .rows
                    .iter()
                    .all(|row| row.weight.get() == 1)
            );
        }
        _ => panic!("expected typed roll"),
    }
}

#[tokio::test]
async fn only_passed_messages_enter_and_lookup_uses_service_time() {
    let h = Harness::new();
    h.upsert().await;
    for verdict in [Verdict::Bar, Verdict::Hold] {
        assert!(PassedMessage::from_verdict(facts("1", at()), verdict).is_err());
        assert_eq!(
            h.call(
                "lots.roll.lookup",
                json!({"draw_id":"simulated-draw","user_id":"1"})
            )
            .await,
            json!({"draw_id":"simulated-draw"})
        );
    }
    assert!(parse_request(br#"{"method":"lots.roll.intake","params":{}}"#).is_err());
    let future = h.clock.now() + chrono::Duration::seconds(1);
    h.module
        .intake(
            &"simulated-draw".to_owned().try_into().unwrap(),
            PassedMessage::from_verdict(facts("1", future), Verdict::Pass).unwrap(),
        )
        .unwrap();
    assert!(
        h.call(
            "lots.roll.lookup",
            json!({"draw_id":"simulated-draw","user_id":"1"})
        )
        .await
        .get("entry")
        .is_none()
    );
    *h.clock.0.lock().unwrap() = future;
    assert!(
        h.call(
            "lots.roll.lookup",
            json!({"draw_id":"simulated-draw","user_id":"1"})
        )
        .await
        .get("entry")
        .is_some()
    );
}

#[tokio::test]
async fn blocked_policy_and_invalid_beacon_never_emit_a_cast() {
    let h = Harness::new();
    let mut blocked = draw();
    blocked["policy"]["content"] = json!("prize");
    blocked["policy"]["paid_entry"] = json!(true);
    let check = h
        .call("lots.draw.check", json!({"policy":blocked["policy"]}))
        .await;
    assert_eq!(check["result"], "blocked");
    assert!(
        check["reasons"]
            .as_array()
            .unwrap()
            .contains(&json!("paid_entry"))
    );
    h.call("lots.draw.upsert", json!({"draw":blocked})).await;
    assert_eq!(h.add("1"), Intake::Added);
    assert_eq!(
        error(
            &h.registry,
            "lots.roll.seal",
            json!({"draw_id":"simulated-draw","source":"streamer_commit","margin_s":1})
        )
        .await,
        ErrorCode::BlockedByPolicy
    );
    h.upsert().await;
    assert_eq!(h.add("1"), Intake::Added);
    let sealed = h.seal("drand_quicknet").await;
    h.beacon.0.store(true, Ordering::SeqCst);
    assert_eq!(
        error(
            &h.registry,
            "lots.cast",
            json!({"draw_run_id":sealed["draw_run_id"]})
        )
        .await,
        ErrorCode::Invalid
    );
    assert_eq!(
        error(
            &h.registry,
            "lots.cast",
            json!({"draw_run_id":sealed["draw_run_id"]})
        )
        .await,
        ErrorCode::NotFound
    );
    assert!(
        h.events
            .since(0)
            .unwrap()
            .iter()
            .all(|e| e.kind != EventKind::Cast)
    );
    assert_eq!(
        h.call("lots.draw.list", json!({})).await["draws"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
}

#[tokio::test]
async fn writs_configuration_and_cooldowns_survive_reopen_and_reconfiguration() {
    let h = Harness::new();
    h.upsert().await;
    h.add("1");
    let sealed = h.seal("streamer_commit").await;
    let cast = h
        .call("lots.cast", json!({"draw_run_id":sealed["draw_run_id"]}))
        .await;
    let writ = h
        .call("lots.writ.get", json!({"writ_id":cast["writ_id"]}))
        .await;
    h.upsert().await;
    assert_eq!(h.add("1"), Intake::Cooldown);
    let Harness {
        directory,
        module,
        registry,
        events,
        clock,
        beacon,
    } = h;
    drop(registry);
    drop(module);
    let module =
        Arc::new(LotsModule::open(directory.path(), events, beacon, clock.clone(), true).unwrap());
    let mut registry = Registry::default();
    registry.register(module.clone()).unwrap();
    assert_eq!(
        rpc(&registry, "lots.draw.list", json!({})).await,
        json!({"draws":[draw()]})
    );
    assert_eq!(
        rpc(
            &registry,
            "lots.writ.get",
            json!({"writ_id":cast["writ_id"]})
        )
        .await,
        writ
    );
    assert_eq!(
        rpc(
            &registry,
            "lots.cast",
            json!({"draw_run_id":sealed["draw_run_id"]})
        )
        .await,
        cast
    );
    let id = "simulated-draw".to_owned().try_into().unwrap();
    let passed = |time| PassedMessage::from_verdict(facts("1", time), Verdict::Pass).unwrap();
    assert_eq!(
        module.intake(&id, passed(clock.now())).unwrap(),
        Intake::Cooldown
    );
    *clock.0.lock().unwrap() += chrono::Duration::seconds(61);
    assert_eq!(
        module.intake(&id, passed(clock.now())).unwrap(),
        Intake::Added
    );
    drop(registry);
    drop(module);
    let mut store = cc_store::Store::open(directory.path().join("store")).unwrap();
    assert_eq!(store.items(cc_store::DataStore::Writs).unwrap().len(), 1);
    assert_eq!(
        store
            .read_ledger(cc_store::LedgerKind::Draws)
            .unwrap()
            .len(),
        2
    );
    store
        .forget_user("simulated_1", cc_store::Timestamp::now())
        .unwrap();
    assert!(store.items(cc_store::DataStore::Writs).unwrap().is_empty());
    let _: LotsWrit = serde_json::from_value(writ).unwrap();
}
