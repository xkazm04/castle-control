//! Real Gatehouse ledger seam with generated SIMULATED records only.
use super::*;

async fn send(gatehouse: &GatehouseModule, id: u32, text: &str, at: Timestamp) {
    gatehouse
        .screen_live_shadow(
            cc_gatehouse::IngestedMessage {
                message_id: format!("simulated-tiltyard-{id}").try_into().unwrap(),
                user_id: cc_store::TwitchUserId::parse(&id.to_string()).unwrap(),
                login: format!("simulated_viewer_{id}"),
                text: text.into(),
                at,
                simulated: true,
                metadata: None,
            },
            &crate::live::RulesOnly,
            vec![],
        )
        .await
        .unwrap();
}
async fn separate_timestamps() {
    tokio::time::sleep(Duration::from_millis(5)).await;
}
#[tokio::test]
async fn ledger_windows_exclude_prestart_and_paused_chat_freeze_close_and_refresh_undo() {
    let root = tempfile::tempdir().unwrap();
    let gatehouse = Arc::new(GatehouseModule::open_shadow(root.path().join("gatehouse")).unwrap());
    send(
        &gatehouse,
        10,
        "1 SIMULATED",
        timestamp(ballots::millis(&Timestamp::now()) - 1000).unwrap(),
    )
    .await;
    let module = TiltyardModule::open(
        root.path().join("tiltyard"),
        gatehouse.clone(),
        Arc::new(EventHub::new(128).unwrap()),
        None,
    )
    .unwrap();
    module
        .turn(&serde_json::from_value(fixture()["actions"][0].clone()).unwrap())
        .await
        .unwrap();
    send(&gatehouse, 11, "2! SIMULATED", Timestamp::now()).await;
    let live = module.stage().await.unwrap().session.unwrap();
    assert_eq!(live.counted, TiltyardCounted { left: 0, right: 1 });
    assert!(live.simulated);
    module.turn(&TiltyardAction::Cancel {}).await.unwrap();
    separate_timestamps().await;
    send(&gatehouse, 12, "1 SIMULATED", Timestamp::now()).await;
    separate_timestamps().await;
    module.turn(&TiltyardAction::Enter {}).await.unwrap();
    assert_eq!(
        module.stage().await.unwrap().session.unwrap().counted,
        live.counted
    );
    module
        .turn(&TiltyardAction::Pick {
            side: TiltyardWinner::Right,
        })
        .await
        .unwrap();
    separate_timestamps().await;
    send(&gatehouse, 13, "1 SIMULATED", Timestamp::now()).await;
    let closed = module.snapshot().await.unwrap().unwrap();
    assert_eq!(closed.ballots, 1);
    assert!(closed.simulated);
    assert_eq!(closed.phase, TiltyardRenderPhase::Called);
    separate_timestamps().await;
    module.turn(&TiltyardAction::Undo {}).await.unwrap();
    let undone = module.stage().await.unwrap().session.unwrap();
    assert_eq!(undone.counted, ballots::empty());
    assert!(!undone.simulated);
    assert_eq!(undone.calls.len(), 1);
    send(&gatehouse, 14, "1 SIMULATED", Timestamp::now()).await;
    assert_eq!(
        module.stage().await.unwrap().session.unwrap().counted,
        TiltyardCounted { left: 1, right: 0 }
    );
    module.turn(&TiltyardAction::Reset {}).await.unwrap();
    let reset = module.stage().await.unwrap().session.unwrap();
    assert!(reset.calls.is_empty());
    assert_eq!(u32::from(reset.speed), 1);
}
