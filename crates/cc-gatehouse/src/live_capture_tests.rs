//! Generated, labelled simulated messages; counters are isolated per test thread.
use crate::{
    Classifier, ClassifierError, GatePath, Gatehouse, IngestedMessage, store::RECORD_READS,
};
use async_trait::async_trait;
use cc_store::TwitchUserId;
use cc_types::Timestamp;
use std::time::Instant;

struct RulesOnly;
#[async_trait]
impl Classifier for RulesOnly {
    async fn classify(&self, _: &str, _: &str) -> Result<String, ClassifierError> {
        Err(ClassifierError::RulesOnly)
    }
}

fn message(user: usize, text: &str) -> IngestedMessage {
    IngestedMessage {
        message_id: format!("simulated-{user}-{}", ulid::Ulid::new())
            .try_into()
            .unwrap(),
        user_id: TwitchUserId::parse(&(1000 + user).to_string()).unwrap(),
        login: format!("simulated_{user}"),
        text: text.into(),
        at: Timestamp::now(),
        simulated: true,
        metadata: None,
    }
}

const ORDINARY: &str = "Ordinary simulated chat";
const DISCLOSURE: &str = "Simulated disclosure: I need help";

async fn capture(gate: &mut Gatehouse, user: usize, text: &str) -> GatePath {
    gate.capture_live_shadow(message(user, text), &RulesOnly, vec![])
        .await
        .unwrap()
        .path
}

/// Instrument: ledger reads and wall time per message as the ledger grows.
/// Run with `--nocapture` for the figures.
#[tokio::test]
async fn steady_state_capture_does_not_rescan_the_ledger() {
    let root = tempfile::tempdir().unwrap();
    let mut gate = Gatehouse::open(root.path()).unwrap();
    capture(&mut gate, 0, DISCLOSURE).await;
    let mut steady_reads = 0;
    for phase in 0..4 {
        RECORD_READS.set(0);
        let start = Instant::now();
        for n in 0..100 {
            let user = 1 + phase * 100 + n;
            assert_eq!(
                capture(&mut gate, user, ORDINARY).await,
                GatePath::FoundNothing
            );
        }
        let micros = start.elapsed().as_micros() / 100;
        println!(
            "ledger~{:>3} msgs: records() reads {:>3}, {micros} us/message",
            phase * 100,
            RECORD_READS.get()
        );
        if phase > 0 {
            steady_reads += RECORD_READS.get();
        }
    }
    assert_eq!(steady_reads, 0, "steady state must not re-read the ledger");
}

#[tokio::test]
async fn care_recorded_by_this_gatehouse_joins_the_cached_set() {
    let root = tempfile::tempdir().unwrap();
    let mut gate = Gatehouse::open(root.path()).unwrap();
    assert_eq!(
        capture(&mut gate, 1, ORDINARY).await,
        GatePath::FoundNothing
    );
    assert_eq!(capture(&mut gate, 2, DISCLOSURE).await, GatePath::Care);
    RECORD_READS.set(0);
    assert_eq!(capture(&mut gate, 2, ORDINARY).await, GatePath::Care);
    assert_eq!(
        capture(&mut gate, 3, ORDINARY).await,
        GatePath::FoundNothing
    );
    assert_eq!(RECORD_READS.get(), 0, "grown cache needs no rescan");
}

#[tokio::test]
async fn forget_and_purge_invalidate_the_warm_cache_once() {
    for forget in [true, false] {
        let root = tempfile::tempdir().unwrap();
        let mut gate = Gatehouse::open(root.path()).unwrap();
        assert_eq!(capture(&mut gate, 1, DISCLOSURE).await, GatePath::Care);
        assert_eq!(capture(&mut gate, 1, ORDINARY).await, GatePath::Care);
        let before = gate.store().viewer_erasure_generation().unwrap();
        let now = cc_store::Timestamp::now();
        if forget {
            gate.store.forget_user("simulated_1", now).unwrap();
        } else {
            gate.store.purge_all(now).unwrap();
        }
        assert_ne!(before, gate.store().viewer_erasure_generation().unwrap());
        RECORD_READS.set(0);
        assert_eq!(
            capture(&mut gate, 1, ORDINARY).await,
            GatePath::FoundNothing
        );
        assert_eq!(RECORD_READS.get(), 1);
        assert_eq!(
            capture(&mut gate, 1, ORDINARY).await,
            GatePath::FoundNothing
        );
        assert_eq!(RECORD_READS.get(), 1, "rebuilt cache is warm again");
    }
}

#[tokio::test]
async fn unreadable_generation_rebuilds_uncached_and_is_reported() {
    let root = tempfile::tempdir().unwrap();
    let mut gate = Gatehouse::open(root.path()).unwrap();
    assert_eq!(capture(&mut gate, 1, DISCLOSURE).await, GatePath::Care);
    super::FAIL_GENERATION.set(true);
    RECORD_READS.set(0);
    assert_eq!(capture(&mut gate, 1, ORDINARY).await, GatePath::Care);
    assert_eq!(capture(&mut gate, 1, ORDINARY).await, GatePath::Care);
    super::FAIL_GENERATION.set(false);
    assert_eq!(RECORD_READS.get(), 2, "every faulted call rebuilds");
    let (faults, last) = gate.care_generation_faults();
    assert_eq!(faults, 2);
    assert!(last.is_some_and(|text| text.contains("simulated generation fault")));
}
