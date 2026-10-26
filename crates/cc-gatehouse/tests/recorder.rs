mod common;
mod offline_common;
use cc_store::{DataStore, LedgerKind, Store, TwitchUserId};
use cc_types::{BridgeGap, RecordingImportParams};
use common::{Fake, Fixture, NOW};
use offline_common::*;

fn owner() -> TwitchUserId {
    TwitchUserId::parse("999").unwrap()
}

#[test]
fn imported_sources_and_gaps_survive_restart_and_paths_are_inert() {
    let mut f = Fixture::new();
    let gap = BridgeGap {
        from: at(-10),
        to: at(-5),
    };
    let result = f
        .gate
        .recorder(owner(), at(-60))
        .import(RecordingImportParams {
            source: text("simulated file:///not-a-location.json"),
            messages: vec![recorded(1, -2, "simulated chat")],
            gaps: vec![gap.clone()],
        })
        .unwrap();
    assert_eq!(result.message_count, 1);
    assert_eq!(result.gaps, vec![gap]);
    let root = f.root.path().to_owned();
    drop(f.gate);
    let mut gate = cc_gatehouse::Gatehouse::with_clock(&root, f.clock.clone()).unwrap();
    let recorder = gate.recorder(owner(), at(-60));
    let recording = recorder.resolve(&result.recording).unwrap();
    assert_eq!(recording.source, result.source);
    assert_eq!(recording.gaps, result.gaps);
    assert!(recorder.resolve(&text("../../rules.json")).is_err());
    assert!(
        recorder
            .resolve(&text("https://simulated.invalid/log"))
            .is_err()
    );
}

#[tokio::test]
async fn live_batches_start_at_install_and_share_existing_erasure_inventory() {
    let mut f = Fixture::new();
    let msg = recorded(1, 0, "simulated live chat");
    // Establish the actual login alias through the existing live service.
    f.gate
        .screen_batch(vec![ingested(&msg)], &Fake::new("[]"))
        .await
        .unwrap();
    let imported = {
        let mut recorder = f.gate.recorder(owner(), at(-1));
        assert!(
            recorder
                .record_live(
                    text("simulated channel"),
                    &[ingested(&recorded(2, -2, "simulated old"))],
                    vec![]
                )
                .is_err()
        );
        recorder
            .record_live(text("simulated channel"), &[ingested(&msg)], vec![])
            .unwrap()
    };
    let root = f.root.path().to_owned();
    drop(f.gate);
    let mut store = Store::open(root.join("store")).unwrap();
    assert!(
        store
            .items(DataStore::Recordings)
            .unwrap()
            .iter()
            .all(|item| item.simulated)
    );
    store
        .forget_user("sim_101", cc_store::Timestamp::parse(NOW).unwrap())
        .unwrap();
    drop(store);
    let mut gate = cc_gatehouse::Gatehouse::with_clock(&root, f.clock).unwrap();
    assert!(
        gate.recorder(owner(), at(-1))
            .resolve(&imported.recording)
            .is_err()
    );
}

#[test]
fn retention_is_enforced_on_import_resolution_and_scheduled_expiry() {
    let mut f = Fixture::new();
    let imported = f
        .gate
        .recorder(owner(), at(-1))
        .import(RecordingImportParams {
            source: text("simulated retention"),
            messages: vec![recorded(1, 0, "simulated")],
            gaps: vec![],
        })
        .unwrap();
    f.clock.set("2026-12-01T12:00:00Z");
    let mut recorder = f.gate.recorder(owner(), at(-1));
    assert!(recorder.resolve(&imported.recording).is_err());
    assert!(
        recorder
            .import(RecordingImportParams {
                source: text("simulated expired"),
                messages: vec![recorded(2, 0, "simulated expired")],
                gaps: vec![]
            })
            .is_err()
    );
    let root = f.root.path().to_owned();
    drop(f.gate);
    let mut store = Store::open(root.join("store")).unwrap();
    store
        .purge_expired(cc_store::Timestamp::parse("2026-12-01T12:00:00Z").unwrap())
        .unwrap();
    assert!(store.items(DataStore::Recordings).unwrap().is_empty());
}

#[test]
fn empty_and_gap_only_recordings_work_and_purge_revokes_references() {
    let mut f = Fixture::new();
    let imported = f
        .gate
        .recorder(owner(), at(-60))
        .import(RecordingImportParams {
            source: text("simulated missing interval"),
            messages: vec![],
            gaps: vec![BridgeGap {
                from: at(-10),
                to: at(0),
            }],
        })
        .unwrap();
    assert_eq!(imported.message_count, 0);
    let root = f.root.path().to_owned();
    drop(f.gate);
    let mut store = Store::open(root.join("store")).unwrap();
    store
        .purge_all(cc_store::Timestamp::parse(NOW).unwrap())
        .unwrap();
    for kind in LedgerKind::ALL {
        assert!(store.read_ledger(kind).unwrap().is_empty());
    }
    drop(store);
    let mut gate = cc_gatehouse::Gatehouse::with_clock(&root, f.clock).unwrap();
    assert!(
        gate.recorder(owner(), at(-60))
            .resolve(&imported.recording)
            .is_err()
    );
}

#[test]
fn duplicate_unordered_future_and_reversed_gap_imports_fail_before_insert() {
    let mut f = Fixture::new();
    for (messages, gaps) in [
        (
            vec![recorded(1, 0, "simulated"), recorded(1, 0, "simulated")],
            vec![],
        ),
        (
            vec![recorded(1, 0, "simulated"), recorded(2, -1, "simulated")],
            vec![],
        ),
        (vec![recorded(1, 1, "simulated future")], vec![]),
        (
            vec![],
            vec![BridgeGap {
                from: at(0),
                to: at(-1),
            }],
        ),
    ] {
        assert!(
            f.gate
                .recorder(owner(), at(-60))
                .import(RecordingImportParams {
                    source: text("simulated invalid"),
                    messages,
                    gaps
                })
                .is_err()
        );
    }
    let root = f.root.path().to_owned();
    drop(f.gate);
    assert!(
        Store::open(root.join("store"))
            .unwrap()
            .items(DataStore::Recordings)
            .unwrap()
            .is_empty()
    );
}
