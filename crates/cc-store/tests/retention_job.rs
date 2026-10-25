mod common;

use cc_store::{
    Clock, DataStore, Error, MIN_RETENTION_S, Store, Timestamp, run_retention_job,
    spawn_retention_task,
};
use common::*;
use std::{
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::sync::watch;

struct SimulatedClock {
    now: Timestamp,
    observed: watch::Sender<bool>,
}

impl Clock for SimulatedClock {
    fn now(&self) -> Timestamp {
        self.observed.send_replace(true);
        self.now.clone()
    }
}

#[tokio::test(start_paused = true)]
async fn scheduled_retention_uses_injected_clock_without_sleep() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(dir.path()).unwrap();
    store.map_user(user(1), "simulated_login").unwrap();
    store.set_retention_s(MIN_RETENTION_S).unwrap();
    store
        .insert(DataStore::Recordings, &item(1, 0, vec![user(1)]))
        .unwrap();
    store
        .insert(DataStore::Recordings, &item(2, 1, vec![user(1)]))
        .unwrap();
    let (observed, mut observations) = watch::channel(false);
    let clock = Arc::new(SimulatedClock {
        now: at(MIN_RETENTION_S + 1),
        observed,
    });
    let store = Arc::new(Mutex::new(store));
    let (shutdown, receiver) = watch::channel(false);
    let task =
        spawn_retention_task(Arc::clone(&store), clock, Duration::from_secs(60), receiver).unwrap();
    tokio::task::yield_now().await;
    assert!(!*observations.borrow());
    tokio::time::advance(Duration::from_secs(60)).await;
    observations.changed().await.unwrap();
    // The worker holds the store lock when consulting the clock, so acquiring it
    // waits for that purge to finish; no wall-clock sleep or timing assertion.
    assert_eq!(
        store
            .lock()
            .unwrap()
            .items(DataStore::Recordings)
            .unwrap()
            .len(),
        1
    );
    shutdown.send(true).unwrap();
    task.await.unwrap().unwrap();
}

#[test]
fn retention_function_reports_clock_as_of_and_counts() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = populated(dir.path());
    store.set_retention_s(MIN_RETENTION_S).unwrap();
    let (observed, _) = watch::channel(false);
    let clock = SimulatedClock {
        now: at(MIN_RETENTION_S + 1),
        observed,
    };
    let result = run_retention_job(&mut store, &clock).unwrap();
    assert_eq!(result.as_of, clock.now);
    assert_eq!(result.counts["recordings"], 3);
}

#[tokio::test(start_paused = true)]
async fn scheduler_surfaces_job_errors_and_rejects_zero_period() {
    let dir = tempfile::tempdir().unwrap();
    let store = Arc::new(Mutex::new(Store::open(dir.path()).unwrap()));
    let (observed, _) = watch::channel(false);
    let clock = Arc::new(SimulatedClock {
        now: at(MIN_RETENTION_S + 1),
        observed,
    });
    let (_shutdown, receiver) = watch::channel(false);
    assert!(matches!(
        spawn_retention_task(
            Arc::clone(&store),
            clock.clone(),
            Duration::ZERO,
            receiver.clone()
        ),
        Err(Error::Invalid(_))
    ));
    std::fs::write(dir.path().join("simulated_unknown_store"), b"simulated").unwrap();
    let task = spawn_retention_task(store, clock, Duration::from_secs(1), receiver).unwrap();
    tokio::time::advance(Duration::from_secs(1)).await;
    assert!(matches!(task.await.unwrap(), Err(Error::InventoryMismatch)));
}
