//! Generated contestants disclose simulation independently of ballot provenance.
use super::*;

#[tokio::test(start_paused = true)]
async fn sample_cards_disclose_before_ballots_after_restart_and_across_transitions() {
    let root = tempfile::tempdir().unwrap();
    let gatehouse = Arc::new(GatehouseModule::open_shadow(root.path().join("gatehouse")).unwrap());
    let events = Arc::new(EventHub::new(128).unwrap());
    let open = || {
        TiltyardModule::open(
            root.path().join("tiltyard"),
            gatehouse.clone(),
            events.clone(),
            None,
        )
        .unwrap()
    };
    let module = open();
    let action: TiltyardAction = serde_json::from_value(fixture()["actions"][0].clone()).unwrap();
    let TiltyardAction::Start { list, key, .. } = &action else {
        panic!("generated start fixture");
    };
    module
        .start_sample(list.clone(), key.clone(), 60_000.try_into().unwrap())
        .await
        .unwrap();
    let session = module.stage().await.unwrap().session.unwrap();
    assert_eq!(session.counted, ballots::empty());
    assert!(
        !session.simulated,
        "session flag still describes counted ballots"
    );
    let sample = module.snapshot().await.unwrap().unwrap();
    assert_eq!(sample.ballots, 0);
    assert!(sample.simulated, "generated contestants must be disclosed");

    // A rejected client start cannot clear sample provenance.
    let mut broken = list.clone();
    broken.items[1].id = broken.items[0].id.clone();
    assert!(
        module
            .turn(&TiltyardAction::Start {
                list: broken,
                key: key.clone(),
                window_ms: 60_000.try_into().unwrap(),
            })
            .await
            .is_err()
    );
    assert!(module.snapshot().await.unwrap().unwrap().simulated);
    module.turn(&TiltyardAction::Cancel {}).await.unwrap();
    drop(module);
    tokio::task::yield_now().await;

    let module = open();
    assert!(module.snapshot().await.unwrap().unwrap().simulated);
    for action in [
        TiltyardAction::Reset {},
        TiltyardAction::Pick {
            side: TiltyardWinner::Right,
        },
        TiltyardAction::Enter {},
        TiltyardAction::Undo {},
    ] {
        module.turn(&action).await.unwrap();
        let snapshot = module.snapshot().await.unwrap().unwrap();
        assert_eq!(snapshot.ballots, 0);
        assert!(snapshot.simulated);
    }
    // A new client tournament has its own source, even with sample-like labels.
    module.turn(&action).await.unwrap();
    assert!(!module.snapshot().await.unwrap().unwrap().simulated);
}
