//! Night sequence against real post-moderation records, clock, persistence and OBS reads.
use super::*;

// Exercise the exact producer used by the night executable, not a second fixture spelling.
#[path = "../../../examples/e2e-night/ballots.rs"]
mod night_ballots;

async fn setup(root: &Path) -> (Arc<TiltyardModule>, Arc<GatehouseModule>, Arc<EventHub>) {
    let gatehouse = Arc::new(GatehouseModule::open_shadow(root.join("gatehouse")).unwrap());
    let events = Arc::new(EventHub::new(128).unwrap());
    let module = TiltyardModule::open(
        root.join("tiltyard"),
        gatehouse.clone(),
        events.clone(),
        None,
    )
    .unwrap();
    let fixture: Value = serde_json::from_str(include_str!(
        "../../../../cc-types/tests/fixtures/tiltyard-transitions.json"
    ))
    .unwrap();
    let mut start = fixture["cases"][0]["start"].clone();
    start["window_ms"] = 15000.into();
    module
        .turn(&serde_json::from_value(start).unwrap())
        .await
        .unwrap();
    (module, gatehouse, events)
}
async fn ballots(gatehouse: &GatehouseModule) {
    for index in 0..9 {
        gatehouse
            .screen_live_shadow(
                cc_gatehouse::IngestedMessage {
                    message_id: format!("simulated-night-{index}").try_into().unwrap(),
                    user_id: cc_store::TwitchUserId::parse(&(9000 + index).to_string()).unwrap(),
                    login: format!("simulated_viewer_{}", 9000 + index),
                    text: night_ballots::text(index).into(),
                    at: Timestamp::now(),
                    simulated: true,
                    metadata: None,
                },
                &crate::live::RulesOnly,
                vec![],
            )
            .await
            .unwrap();
    }
    // Pausing Tokio does not pause UTC message timestamps. Keep the next
    // match's inclusive millisecond window strictly after these records.
    std::thread::sleep(Duration::from_millis(2));
}
async fn advance(ms: u64) {
    tokio::task::yield_now().await;
    tokio::time::advance(Duration::from_millis(ms)).await;
    tokio::task::yield_now().await;
}
async fn session(module: &TiltyardModule) -> TiltyardSession {
    tokio::time::timeout(Duration::from_secs(1), module.stage())
        .await
        .expect("stage must not deadlock behind the clock or Gatehouse")
        .unwrap()
        .session
        .unwrap()
}
async fn picture(module: &TiltyardModule) -> TiltyardRenderSnapshot {
    tokio::time::timeout(Duration::from_secs(1), module.snapshot())
        .await
        .expect("OBS/SSE snapshot must not deadlock behind a turn")
        .unwrap()
        .unwrap()
}
fn persisted(root: &Path, expected: &TiltyardSession) {
    let saved = storage::load(&root.join("tiltyard")).unwrap();
    assert_eq!(saved.session.as_ref(), Some(expected));
}

#[tokio::test(start_paused = true)]
async fn night_ballots_call_against_counts_keeps_the_pair_for_3000ms_then_advances() {
    let root = tempfile::tempdir().unwrap();
    let (module, gatehouse, events) = setup(root.path()).await;
    ballots(&gatehouse).await;
    let live = session(&module).await;
    assert_eq!(live.counted, TiltyardCounted { left: 6, right: 3 });
    assert!(live.simulated);
    let open = picture(&module).await;
    assert_eq!((open.left.count, open.right.count), (6, 3));
    assert_eq!(open.phase, TiltyardRenderPhase::Open);

    let closed = module
        .turn(&TiltyardAction::Pick {
            side: TiltyardWinner::Right,
        })
        .await
        .unwrap()
        .session
        .unwrap();
    let verdict = closed.verdict.as_ref().unwrap();
    assert_eq!(
        verdict.verdict,
        TiltyardVerdict {
            side: TiltyardWinner::Right,
            how: TiltyardDecision::Call
        }
    );
    assert_eq!(closed.calls[0].counted, live.counted);
    assert_eq!(closed.remaining_ms, 3000);
    assert_eq!(picture(&module).await.phase, TiltyardRenderPhase::Called);
    persisted(root.path(), &closed);

    advance(2999).await;
    let theatre = session(&module).await;
    assert_eq!(theatre.phase, TiltyardSessionPhase::Verdict);
    assert_eq!(theatre.remaining_ms, 1);
    let held = picture(&module).await;
    assert_eq!(
        (held.left.label, held.right.label),
        (open.left.label, open.right.label)
    );
    assert_eq!((held.left.count, held.right.count), (6, 3));
    advance(1).await;
    let next = session(&module).await;
    assert_eq!(next.phase, TiltyardSessionPhase::Live);
    assert_ne!(next.match_key, live.match_key);
    assert_eq!(next.history.len(), 1);
    assert!(next.verdict.is_none());
    assert_eq!(next.calls, closed.calls);
    assert_eq!(picture(&module).await.phase, TiltyardRenderPhase::Open);
    persisted(root.path(), &next);
    assert_eq!(next.counted, TiltyardCounted { left: 0, right: 0 });
    assert!(
        events
            .since(0)
            .unwrap()
            .iter()
            .any(|event| event.kind == EventKind::Turn)
    );
}

#[tokio::test(start_paused = true)]
async fn night_deadline_close_freezes_tally_and_late_pick_only_skips_4000ms_theatre() {
    let root = tempfile::tempdir().unwrap();
    let (module, gatehouse, _) = setup(root.path()).await;
    ballots(&gatehouse).await;
    assert_eq!(
        session(&module).await.counted,
        TiltyardCounted { left: 6, right: 3 }
    );
    advance(15000).await;
    let closed = session(&module).await;
    assert_eq!(closed.phase, TiltyardSessionPhase::Verdict);
    assert_eq!(closed.remaining_ms, 4000);
    assert_eq!(closed.elapsed_ms, 15000);
    let verdict = closed.verdict.as_ref().unwrap();
    assert_eq!(
        verdict.verdict,
        TiltyardVerdict {
            side: TiltyardWinner::Left,
            how: TiltyardDecision::Tally
        }
    );
    assert_eq!(picture(&module).await.phase, TiltyardRenderPhase::Closed);
    persisted(root.path(), &closed);
    advance(3999).await;
    assert_eq!(session(&module).await.remaining_ms, 1);
    let next = module
        .turn(&TiltyardAction::Pick {
            side: TiltyardWinner::Right,
        })
        .await
        .unwrap()
        .session
        .unwrap();
    assert_eq!(next.phase, TiltyardSessionPhase::Live);
    assert!(next.calls.is_empty());
    assert_eq!(next.history.len(), 1);
    assert_eq!(
        next.bracket.rounds[0].0[0].winner.as_ref(),
        Some(&verdict.a)
    );
    assert_eq!(picture(&module).await.phase, TiltyardRenderPhase::Open);
    persisted(root.path(), &next);
    // The next live call must still work after the close/late-pick boundary.
    module
        .turn(&TiltyardAction::Pick {
            side: TiltyardWinner::Right,
        })
        .await
        .unwrap();
    let advanced = module
        .turn(&TiltyardAction::Enter {})
        .await
        .unwrap()
        .session
        .unwrap();
    assert_eq!(advanced.phase, TiltyardSessionPhase::Live);
    assert_eq!(advanced.history.len(), 2);
    assert_eq!(String::from(picture(&module).await.round_label), "Final");
    persisted(root.path(), &advanced);
}
