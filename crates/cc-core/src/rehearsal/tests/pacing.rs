//! Scenario pacing is injectable; virtual time pins the production timer path.
use super::*;

#[tokio::test(start_paused = true)]
async fn zero_delay_bursts_finish_without_advancing_time() {
    let h = Harness::new().await;
    call(&h.module, "rehearsal.start", json!({})).await;
    let mut receiver = h.module.door.sender.subscribe();
    let before = tokio::time::Instant::now();
    call(
        &h.module,
        "rehearsal.scenario.run",
        json!({"scenario":"vote_round"}),
    )
    .await;
    finish_scenarios(&h.module).await;
    let messages = collect(&mut receiver, 30).await;
    assert_eq!(messages.len(), 30);
    assert_eq!(tokio::time::Instant::now(), before);
    assert!(receiver.try_recv().is_err());
    h.close().await;
}

#[tokio::test(start_paused = true)]
async fn injected_delay_controls_each_message_and_stop_cancels_it() {
    let delay = Duration::from_millis(180);
    let h = Harness::with_message_delay(delay).await;
    call(&h.module, "rehearsal.start", json!({})).await;
    let mut receiver = h.module.door.sender.subscribe();
    call(
        &h.module,
        "rehearsal.scenario.run",
        json!({"scenario":"vote_round"}),
    )
    .await;
    provenance(&receiver.recv().await.unwrap());
    assert!(receiver.try_recv().is_err());
    tokio::time::advance(delay - Duration::from_millis(1)).await;
    tokio::task::yield_now().await;
    assert!(receiver.try_recv().is_err());
    tokio::time::advance(Duration::from_millis(1)).await;
    tokio::task::yield_now().await;
    provenance(&receiver.recv().await.unwrap());
    assert!(receiver.try_recv().is_err());
    call(&h.module, "rehearsal.stop", json!({})).await;
    tokio::time::advance(Duration::from_secs(10)).await;
    assert!(receiver.try_recv().is_err());
    h.close().await;
}
