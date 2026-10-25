#![allow(dead_code)]

use cc_lots::{DrawPolicy, MessageFacts, Pool, RollRules, WeightCurve};
use cc_store::{Timestamp, TwitchUserId};
use cc_types::{DrawContent, DrawId, MessageId};
use chrono::{DateTime, TimeZone, Utc};
use std::path::PathBuf;

pub fn at(seconds: i64) -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 10, 25, 0, 0, 0).unwrap() + chrono::Duration::seconds(seconds)
}

pub fn timestamp(seconds: i64) -> Timestamp {
    Timestamp::parse(&at(seconds).to_rfc3339()).unwrap()
}

pub fn user(n: u64) -> TwitchUserId {
    TwitchUserId::parse(&n.to_string()).unwrap()
}

pub fn draw_id() -> DrawId {
    DrawId::try_from("simulated-draw".to_owned()).unwrap()
}

pub fn prize() -> DrawPolicy {
    DrawPolicy {
        content: DrawContent::Prize,
        minimum_age: Some(18),
        regions: vec!["CZ".into()],
        ..DrawPolicy::default()
    }
}

pub fn rules() -> RollRules {
    RollRules {
        pool: Pool::Chatters,
        winner_count: 1,
        cooldown_s: 60,
        cohort_caps: Vec::new(),
        weight_curve: WeightCurve::Equal,
        free_join_equal_odds: false,
    }
}

pub fn simulated_message(n: u64, seconds: i64) -> MessageFacts {
    MessageFacts {
        message_id: MessageId::try_from(format!("simulated-{n}-{seconds}")).unwrap(),
        user_id: user(n),
        at: at(seconds),
        text: "simulated chat".into(),
        follower: false,
        subscriber: false,
        redeemed: false,
        activity_units: 0,
        cohorts: Default::default(),
    }
}

pub struct SimulatedDir(pub PathBuf);

impl SimulatedDir {
    pub fn new() -> Self {
        let dir =
            Self(std::env::temp_dir().join(format!("cc-lots-simulated-{}", ulid::Ulid::new())));
        std::fs::create_dir(&dir.0).unwrap();
        dir
    }
}

impl Drop for SimulatedDir {
    fn drop(&mut self) {
        assert_eq!(self.0.parent(), Some(std::env::temp_dir().as_path()));
        std::fs::remove_dir_all(&self.0).unwrap();
    }
}
