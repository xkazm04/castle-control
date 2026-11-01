mod common;

use cc_store::{Clock, ConfigurationItem, DataStore, Store, Timestamp};
use common::*;
use std::sync::Arc;
use ulid::Ulid;

struct FixedClock(Timestamp);
impl Clock for FixedClock {
    fn now(&self) -> Timestamp {
        self.0.clone()
    }
}

fn ts(value: &str) -> Timestamp {
    Timestamp::parse(value).unwrap()
}

#[test]
fn far_future_at_is_clamped_to_now_plus_skew_but_past_and_present_are_kept() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(dir.path()).unwrap();
    store.set_clock(Arc::new(FixedClock(ts("2026-10-25T12:00:00Z"))));
    store.map_user(user(1), "simulated_login").unwrap();
    let cases = [
        (1, "2026-10-20T00:00:00Z", "2026-10-20T00:00:00Z"),
        (2, "2026-10-25T12:00:00Z", "2026-10-25T12:00:00Z"),
        (3, "2026-10-25T12:04:00Z", "2026-10-25T12:04:00Z"),
        (4, "2099-01-01T00:00:00Z", "2026-10-25T12:05:00Z"),
    ];
    for (id, given, _) in cases {
        let mut it = item(id, 0, vec![user(1)]);
        it.at = ts(given);
        store.insert(DataStore::Recordings, &it).unwrap();
    }
    let stored = store.items(DataStore::Recordings).unwrap();
    for (id, _, expected) in cases {
        let got = stored.iter().find(|i| i.id == Ulid::from(u128::from(id)));
        assert_eq!(got.unwrap().at, ts(expected), "item {id}");
    }
    // Clamped items still expire: retention no longer misses them.
    let later = ts("2026-12-30T00:00:00Z");
    assert_eq!(store.purge_expired(later).unwrap().counts["recordings"], 4);
}

#[test]
fn far_future_configuration_at_is_clamped_too() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(dir.path()).unwrap();
    store.set_clock(Arc::new(FixedClock(ts("2026-10-25T12:00:00Z"))));
    let cfg = ConfigurationItem::new(
        Ulid::from(9u128),
        ts("2099-01-01T00:00:00Z"),
        "simulated".into(),
        true,
    );
    store.insert_configuration(DataStore::Writs, &cfg).unwrap();
    let got = store.configuration_items(DataStore::Writs).unwrap();
    assert_eq!(got[0].at, ts("2026-10-25T12:05:00Z"));
}
