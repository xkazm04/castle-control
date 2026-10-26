//! Audit identity associations use cc-store's existing erasure inventory.
mod common;
mod gate_common;
use cc_gatehouse::{
    Gatehouse,
    gate::{ExternalAction, ModerationEvent},
};
use cc_store::{LedgerKind, Store};
use common::*;

#[test]
fn forgetting_either_external_actor_or_subject_erases_attributed_metadata() {
    for login in ["sim_moderator", "sim_100"] {
        let mut f = Fixture::new();
        f.gate
            .ingest_moderation(
                ModerationEvent {
                    moderator: gate_common::actor(),
                    action: ExternalAction::Warn,
                    message: Some(message(1, 100, "simulated external action")),
                    at: at(NOW),
                },
                None,
            )
            .unwrap();
        drop(f.gate);
        let mut store = Store::open(f.root.path().join("store")).unwrap();
        store
            .forget_user(login, cc_store::Timestamp::parse(NOW).unwrap())
            .unwrap();
        assert_eq!(store.read_ledger(LedgerKind::Decisions).unwrap().len(), 1);
        drop(store);
        let gate = Gatehouse::with_clock(f.root.path(), f.clock).unwrap();
        assert!(gate.gate_roll().unwrap().is_empty());
    }
}

#[tokio::test]
async fn erasing_an_external_moderator_cannot_reopen_resolution_authority() {
    use cc_gatehouse::gate::AutoModHeld;
    use cc_types::{ErrorCode, HeldOutcome, HeldResolveParams};
    let mut f = Fixture::new();
    let msg = message(1, 100, "simulated durable original");
    f.gate
        .automod_hold(AutoModHeld {
            message: msg.clone(),
        })
        .unwrap();
    f.gate
        .ingest_moderation(
            ModerationEvent {
                moderator: gate_common::actor(),
                action: ExternalAction::AllowHeld,
                message: Some(msg.clone()),
                at: at(NOW),
            },
            None,
        )
        .unwrap();
    drop(f.gate);
    let mut store = Store::open(f.root.path().join("store")).unwrap();
    store
        .forget_user("sim_moderator", cc_store::Timestamp::parse(NOW).unwrap())
        .unwrap();
    drop(store);
    let mut gate = Gatehouse::with_clock(f.root.path(), f.clock).unwrap();
    let error = gate
        .held_resolve(
            HeldResolveParams {
                message_id: msg.message_id,
                outcome: HeldOutcome::Allow,
            },
            std::time::Duration::from_secs(1),
            |_, _| async { panic!("erased completion cannot grant authority") },
        )
        .await
        .unwrap_err();
    assert_eq!(error.code, ErrorCode::NeedsHuman);
}
