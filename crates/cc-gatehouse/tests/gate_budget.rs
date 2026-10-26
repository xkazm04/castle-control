//! Offline local timings on seed 1202; host stages are explicit simulation inputs.
mod common;
use cc_gatehouse::{IngestedMessage, gate::HoldBudget, simulation};
use cc_store::TwitchUserId;
use cc_types::Action;
use common::*;
use std::time::Duration;

#[test]
fn p95_is_nearest_rank_per_stage_and_refuses_empty_evidence() {
    assert!(HoldBudget::summarise(&[]).is_err());
    let samples: Vec<_> = (1..=100)
        .map(|i| HoldBudget {
            model: Duration::from_millis(i),
            gate: Duration::from_millis(101 - i),
            ..HoldBudget::default()
        })
        .collect();
    let summary = HoldBudget::summarise(&samples).unwrap();
    assert_eq!(summary.n, 100);
    assert_eq!(summary.p95.model.as_millis(), 95);
    assert_eq!(summary.p95.gate.as_millis(), 95);
}

#[tokio::test]
async fn seeded_simulated_stream_records_all_six_stage_p95s() {
    let mut f = Fixture::new();
    f.upsert(plain(Action::Hold));
    let stream = simulation::generate("1202", 128, at(NOW), &simulation::near_miss_bank()).unwrap();
    let mut samples = Vec::new();
    for (index, msg) in stream.messages.into_iter().enumerate() {
        let message = IngestedMessage {
            message_id: msg.message_id,
            user_id: TwitchUserId::parse(&String::from(msg.user_id)).unwrap(),
            login: format!("sim_budget_{index}"),
            text: msg.text,
            at: msg.at,
            simulated: true,
            metadata: None,
        };
        let measured = f
            .gate
            .screen_batch_measured(
                vec![message],
                &Fake::new("[]"),
                Duration::from_secs(2),
                Duration::ZERO,
                Duration::ZERO,
            )
            .await
            .unwrap();
        assert_eq!(measured.messages.len(), 1);
        assert!(measured.messages[0].decision.simulated);
        samples.extend(measured.budgets);
    }
    let summary = HoldBudget::summarise(&samples).unwrap();
    assert_eq!(summary.n, 128);
    assert_eq!(summary.p95.twitch_delay, Duration::from_secs(2));
    assert!(summary.p95.rules > Duration::ZERO);
    assert!(summary.p95.model > Duration::ZERO);
    assert!(summary.p95.gate > Duration::ZERO);
    println!(
        "simulated seed=1202 n={} p95_us twitch_delay={} scheduling_wait={} admission={} rules={} model={} gate={}",
        summary.n,
        summary.p95.twitch_delay.as_micros(),
        summary.p95.scheduling_wait.as_micros(),
        summary.p95.admission.as_micros(),
        summary.p95.rules.as_micros(),
        summary.p95.model.as_micros(),
        summary.p95.gate.as_micros()
    );
}
