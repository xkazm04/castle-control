mod common;
mod offline_common;

use cc_store::Clock;
use cc_types::{ConsensusFilter, ConsensusGetParams, Verdict};
use common::Fixture;
use offline_common::{recorded, screened};

fn params(window: u32) -> ConsensusGetParams {
    ConsensusGetParams {
        window_s: window.try_into().unwrap(),
        filter: ConsensusFilter::All {},
    }
}

#[test]
fn service_consensus_reads_only_post_verdict_intake_at_its_clock() {
    let mut f = Fixture::new();
    for verdict in [Verdict::Hold, Verdict::Bar] {
        assert!(
            screened(recorded(1, 0, "simulated withheld"), verdict)
                .for_consensus()
                .is_none()
        );
    }
    assert!(
        f.gate
            .consensus_get(params(60))
            .unwrap()
            .directions
            .is_empty()
    );
    f.clock.set("2026-10-25T12:00:01Z");
    f.gate
        .consensus_ingest(
            screened(recorded(2, 1, "simulated released"), Verdict::Pass)
                .for_consensus()
                .unwrap(),
        )
        .unwrap();
    let result = f.gate.consensus_get(params(60)).unwrap();
    assert_eq!(String::from(result.at), f.clock.now().as_rfc3339());
    assert_eq!(result.directions.len(), 1);
    assert_eq!(result.directions[0].messages, 1);
    assert_eq!(result.shed_count, 0);
    assert!(result.directions[0].delta_3m.is_none());
    f.clock.set("2026-10-25T12:15:00Z");
    assert!(
        f.gate
            .consensus_get(params(60))
            .unwrap()
            .directions
            .is_empty()
    );
}

#[test]
fn service_reports_shedding_even_after_all_directions_expire() {
    let mut f = Fixture::new();
    for id in 0..4_200 {
        f.gate
            .consensus_ingest(
                screened(recorded(id, 1, "simulated retained"), Verdict::Pass)
                    .for_consensus()
                    .unwrap(),
            )
            .unwrap();
    }
    f.gate
        .consensus_ingest(
            screened(recorded(4_201, 899, "simulated shed"), Verdict::Pass)
                .for_consensus()
                .unwrap(),
        )
        .unwrap();
    f.clock.set("2026-10-25T12:15:00Z");
    let result = f.gate.consensus_get(params(2)).unwrap();
    assert_eq!(String::from(result.at), f.clock.now().as_rfc3339());
    assert!(result.directions.is_empty());
    assert_eq!(result.shed_count, 1);
    f.clock.set("2026-10-25T12:15:02Z");
    assert_eq!(f.gate.consensus_get(params(2)).unwrap().shed_count, 0);
}
