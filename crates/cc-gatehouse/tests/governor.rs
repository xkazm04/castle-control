//! Simulated room populations and an injected clock; no live bridge or executor.
mod common;
mod offline_common;

use cc_gatehouse::governor::{Governor, GovernorConfig, RoomModeIntent, RoomSetting};
use cc_types::{RoomMode, Tier, Verdict};
use common::TestClock;
use offline_common::{at, recorded, screened};
use std::sync::{Arc, Mutex};

fn config() -> GovernorConfig {
    GovernorConfig {
        borders: [10, 20, 30],
        margin: 2,
        hysteresis_s: 30,
        lease_s: 60,
        plans: std::array::from_fn(|_| Vec::new()),
    }
}

struct Room {
    governor: Governor,
    clock: Arc<TestClock>,
}

impl Room {
    fn new(config: GovernorConfig) -> Self {
        let clock = Arc::new(TestClock(Mutex::new(String::from(at(0)))));
        let governor = Governor::new(config, clock.clone()).unwrap();
        Self { governor, clock }
    }

    fn set(&self, seconds: i64) {
        self.clock.set(&String::from(at(seconds)));
    }

    fn feed(&mut self, id: usize, seconds: i64, verdict: Verdict) {
        self.governor
            .observe_chat(&screened(recorded(id, seconds, "simulated chat"), verdict))
            .unwrap();
    }

    fn population(&mut self, count: usize, seconds: i64) {
        self.set(seconds);
        for id in 0..count {
            self.feed(id, seconds, Verdict::Pass);
        }
    }

    fn tick(&mut self, seconds: i64) -> cc_gatehouse::governor::GovernorUpdate {
        self.set(seconds);
        self.governor.tick().unwrap()
    }
}

#[test]
fn distinct_passed_chatters_use_event_time_and_expire_at_ten_minutes() {
    let mut room = Room::new(config());
    room.feed(1, 0, Verdict::Pass);
    room.set(100);
    room.feed(1, 100, Verdict::Pass);
    room.feed(1, 0, Verdict::Pass); // delayed duplicate cannot shorten presence
    room.feed(2, 100, Verdict::Hold);
    room.feed(3, 100, Verdict::Bar);
    let mut mismatched = screened(recorded(4, 100, "simulated"), Verdict::Pass);
    mismatched.decision.message_id = "simulated-other".to_owned().try_into().unwrap();
    room.governor.observe_chat(&mismatched).unwrap();
    assert_eq!(room.tick(599).chatters, 1);
    assert_eq!(room.tick(600).chatters, 1);
    assert_eq!(room.tick(699).chatters, 1);
    assert_eq!(room.tick(700).chatters, 0);
    room.feed(5, 0, Verdict::Pass); // stale arrival cannot revive an expired chatter
    assert_eq!(room.tick(700).chatters, 0);
}

#[test]
fn tiers_cross_margins_only_after_a_continuous_window() {
    for (count, expected) in [(12, Tier::M), (22, Tier::L), (32, Tier::Xl)] {
        let mut room = Room::new(config());
        room.population(count, 0);
        assert_eq!(room.tick(0).tier, Tier::S);
        assert_eq!(room.tick(29).tier, Tier::S);
        assert_eq!(room.tick(30).tier, expected);
        assert_eq!(room.tick(600).tier, expected);
        assert_eq!(room.tick(629).tier, expected);
        assert_eq!(room.tick(630).tier, Tier::S);
    }
}

#[test]
fn oscillating_border_never_switches_twice_within_a_hysteresis_window() {
    let mut room = Room::new(config());
    let mut transitions = Vec::new();
    let mut tier = Tier::S;
    // Renew eight baseline chatters; four extra chatters arrive in short bursts.
    // Old extras age out after 600 s, repeatedly crossing both margin edges.
    for second in 0..=4_000 {
        room.population(8, second);
        if second % 1_240 < 20 {
            room.population(12, second);
        }
        let next = room.tick(second).tier;
        if next != tier {
            transitions.push(second);
            tier = next;
        }
    }
    assert!(
        transitions.len() >= 6,
        "simulation must exercise both edges"
    );
    assert!(transitions.windows(2).all(|pair| pair[1] - pair[0] >= 30));
}

#[test]
fn a_short_border_excursion_does_not_count_toward_the_next_window() {
    let mut room = Room::new(config());
    room.population(12, 0);
    room.tick(0);
    // No ticks while idle: at 600 the candidate is invalid and must be reset.
    assert_eq!(room.tick(600).tier, Tier::S);
    room.population(12, 601);
    assert_eq!(room.tick(601).tier, Tier::S);
    assert_eq!(room.tick(630).tier, Tier::S);
    assert_eq!(room.tick(631).tier, Tier::M);
}

#[test]
fn counts_inside_the_margin_keep_the_current_tier_in_both_directions() {
    let mut room = Room::new(config());
    room.population(11, 0);
    room.tick(0);
    assert_eq!(room.tick(300).tier, Tier::S);
    room.population(12, 301);
    room.tick(301);
    assert_eq!(room.tick(331).tier, Tier::M);
    // Keep nine chatters active while the other three age out.
    room.population(9, 600);
    assert_eq!(room.tick(901).chatters, 9);
    assert_eq!(room.tick(901).tier, Tier::M);
    assert_eq!(room.tick(1_000).tier, Tier::M);
}

#[test]
fn arrivals_after_an_idle_gap_restart_the_pending_window() {
    let mut room = Room::new(config());
    room.population(12, 0);
    room.tick(0);
    room.population(12, 700); // population expired before this delayed observation
    assert_eq!(room.tick(700).tier, Tier::S);
    assert_eq!(room.tick(729).tier, Tier::S);
    assert_eq!(room.tick(730).tier, Tier::M);
}

fn all_settings() -> Vec<RoomSetting> {
    vec![
        RoomSetting::Slow { interval_s: 10 },
        RoomSetting::FollowerOnly { minimum_age_s: 0 },
        RoomSetting::EmoteOnly,
        RoomSetting::UniqueChat,
    ]
}

#[test]
fn every_lease_expires_once_without_chat_or_automatic_renewal() {
    let mut cfg = config();
    cfg.plans[0] = all_settings();
    let mut room = Room::new(cfg);
    let started = room.tick(0);
    assert_eq!(started.intents.len(), 4);
    for (intent, setting) in started.intents.iter().zip(all_settings()) {
        assert_eq!(
            *intent,
            RoomModeIntent::Apply {
                setting,
                expires_at: at(60)
            }
        );
    }
    assert!(room.tick(59).intents.is_empty());
    assert_eq!(room.governor.leases().len(), 4);
    let ended = room.tick(60);
    assert_eq!(ended.intents.len(), 4);
    assert!(
        ended
            .intents
            .iter()
            .all(|i| matches!(i, RoomModeIntent::End { .. }))
    );
    assert!(room.governor.leases().is_empty());
    assert!(room.tick(10_000).intents.is_empty());
}

#[test]
fn human_override_suppresses_only_its_setting_until_original_expiry() {
    let mut cfg = config();
    cfg.plans[0] = all_settings();
    cfg.plans[1] = all_settings();
    let mut room = Room::new(cfg);
    room.tick(0);
    room.set(1);
    room.governor.observe_human_change(RoomMode::Slow).unwrap();
    room.population(12, 1);
    room.tick(1);
    assert!(room.tick(31).intents.is_empty()); // tier change cannot renew or override
    assert_eq!(
        room.governor.leases().iter().filter(|l| l.yielded).count(),
        1
    );
    assert!(room.tick(59).intents.is_empty());
    let expired = room.tick(60);
    assert!(!expired.intents.contains(&RoomModeIntent::End {
        mode: RoomMode::Slow
    }));
    assert_eq!(
        expired
            .intents
            .iter()
            .filter(|i| matches!(i, RoomModeIntent::End { .. }))
            .count(),
        3
    );
    // A new tier activation may claim the setting only after the old lease ends.
    assert!(expired.intents.contains(&RoomModeIntent::Apply {
        setting: RoomSetting::Slow { interval_s: 10 },
        expires_at: at(120),
    }));
}

#[test]
fn yielded_lease_expires_without_reverting_a_humans_setting() {
    let mut cfg = config();
    cfg.plans[0] = vec![RoomSetting::EmoteOnly];
    let mut room = Room::new(cfg);
    room.tick(0);
    room.set(5);
    room.governor
        .observe_human_change(RoomMode::EmoteOnly)
        .unwrap();
    assert!(room.tick(59).intents.is_empty());
    assert!(room.tick(60).intents.is_empty());
    assert!(room.governor.leases().is_empty());
    assert!(room.tick(120).intents.is_empty());
}

#[test]
fn late_human_change_suppresses_an_expired_leases_pending_end() {
    let mut cfg = config();
    cfg.plans[0] = vec![RoomSetting::EmoteOnly];
    let mut room = Room::new(cfg);
    room.tick(0);
    room.set(61); // lease deadline passed, but tick has not drained its End yet
    room.governor
        .observe_human_change(RoomMode::EmoteOnly)
        .unwrap();
    assert!(room.tick(61).intents.is_empty());
    assert!(room.governor.leases().is_empty());
}

#[test]
fn subsecond_expiry_does_not_end_a_lease_early() {
    let mut cfg = config();
    cfg.plans[0] = vec![RoomSetting::EmoteOnly];
    let mut room = Room::new(cfg);
    room.clock.set("2026-10-25T12:00:00.500Z");
    let started = room.governor.tick().unwrap();
    assert_eq!(
        started.intents,
        vec![RoomModeIntent::Apply {
            setting: RoomSetting::EmoteOnly,
            expires_at: "2026-10-25T12:01:00.500Z".to_owned().try_into().unwrap(),
        }]
    );
    assert!(room.tick(60).intents.is_empty());
    room.clock.set("2026-10-25T12:01:00.500Z");
    assert_eq!(room.governor.tick().unwrap().intents.len(), 1);
}

#[test]
fn nonmonotonic_clock_and_future_chat_are_rejected_without_new_intents() {
    let mut room = Room::new(config());
    assert!(
        room.governor
            .observe_chat(&screened(recorded(1, 1, "simulated"), Verdict::Pass))
            .is_err()
    );
    assert_eq!(room.tick(0).chatters, 0);
    room.tick(10);
    room.set(9);
    assert!(room.governor.tick().is_err());
    assert!(room.governor.observe_human_change(RoomMode::Slow).is_err());
    assert_eq!(room.tick(10).chatters, 0);
}

#[test]
fn invalid_configuration_is_rejected_at_the_rust_only_door() {
    let mut invalid = Vec::new();
    let mut cfg = config();
    cfg.borders = [10, 10, 30];
    invalid.push(cfg);
    let mut cfg = config();
    cfg.margin = 0;
    invalid.push(cfg);
    let mut cfg = config();
    cfg.hysteresis_s = 0;
    invalid.push(cfg);
    let mut cfg = config();
    cfg.lease_s = 0;
    invalid.push(cfg);
    let mut cfg = config();
    cfg.plans[0] = vec![RoomSetting::Slow { interval_s: 2 }];
    invalid.push(cfg);
    let mut cfg = config();
    cfg.plans[0] = vec![RoomSetting::EmoteOnly, RoomSetting::EmoteOnly];
    invalid.push(cfg);
    for cfg in invalid {
        let clock = Arc::new(TestClock(Mutex::new(String::from(at(0)))));
        assert!(Governor::new(cfg, clock).is_err());
    }
}

#[test]
fn output_is_exhaustively_room_modes_and_never_a_person_action() {
    fn room_only(intent: RoomModeIntent) -> RoomMode {
        match intent {
            RoomModeIntent::Apply {
                setting,
                expires_at: _,
            } => match setting {
                RoomSetting::Slow { interval_s: _ } => RoomMode::Slow,
                RoomSetting::FollowerOnly { minimum_age_s: _ } => RoomMode::FollowerOnly,
                RoomSetting::EmoteOnly => RoomMode::EmoteOnly,
                RoomSetting::UniqueChat => RoomMode::UniqueChat,
            },
            RoomModeIntent::End { mode } => mode,
        }
    }
    for setting in all_settings() {
        let mode = room_only(RoomModeIntent::Apply {
            setting,
            expires_at: at(60),
        });
        assert_eq!(room_only(RoomModeIntent::End { mode }), mode);
    }
    let source = include_str!("../src/governor.rs");
    assert!(!source.contains("cc_twitch"));
    assert!({
        let typed = include_str!("../../cc-types/src/methods.rs").contains(
            "LeaseEnd => (\"gatehouse.lease.end\", LeaseEndParams, Decision, \"WP 1.3\")",
        );
        let mut directories =
            vec![std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../cc-core/src")];
        let mut source_files = 0;
        let mut unregistered = true;
        while let Some(directory) = directories.pop() {
            for entry in std::fs::read_dir(directory).expect("read cc-core source directory") {
                let entry = entry.expect("read cc-core source entry");
                let kind = entry.file_type().expect("read cc-core source file type");
                let path = entry.path();
                if kind.is_dir() {
                    directories.push(path);
                } else if kind.is_file() && path.extension().is_some_and(|value| value == "rs") {
                    source_files += 1;
                    let source = std::fs::read_to_string(path).expect("read cc-core Rust source");
                    unregistered &= !source.contains("gatehouse.lease.end");
                }
            }
        }
        typed && source_files > 0 && unregistered
    });
}
