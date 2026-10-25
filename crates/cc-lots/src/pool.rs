use crate::{Error, Result, WeightCurve, WeightRow, WeightTable};
use cc_store::TwitchUserId;
use cc_types::{MessageId, Verdict};
use chrono::{DateTime, Utc};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Pool {
    Chatters,
    Followers,
    Subscribers,
    Redeemers,
    Keyword(String),
}

/// Supplied by the future post-verdict adapter; membership/cohorts must come
/// from verified metadata, never claims in message text. No monetary units.
#[derive(Clone, Debug)]
pub struct MessageFacts {
    pub message_id: MessageId,
    pub user_id: TwitchUserId,
    pub at: DateTime<Utc>,
    pub text: String,
    pub follower: bool,
    pub subscriber: bool,
    pub redeemed: bool,
    pub activity_units: u16,
    pub cohorts: BTreeSet<String>,
}

/// Private payload; there is no constructor that skips the verdict check.
#[derive(Debug)]
pub struct PassedMessage(MessageFacts);

impl PassedMessage {
    pub fn from_verdict(message: MessageFacts, verdict: Verdict) -> Result<Self> {
        if verdict != Verdict::Pass {
            return Err(Error::NotPassed);
        }
        Ok(Self(message))
    }
}

#[derive(Clone, Debug)]
pub struct CohortCap {
    cohort: String,
    numerator: u16,
    denominator: u16,
}

impl CohortCap {
    pub fn new(cohort: String, numerator: u16, denominator: u16) -> Result<Self> {
        if cohort.trim().is_empty() || denominator == 0 || numerator > denominator {
            return Err(Error::Invalid("cohort cap"));
        }
        Ok(Self {
            cohort,
            numerator,
            denominator,
        })
    }

    /// Rounds down, so even small winner sets never exceed the declared share.
    pub fn limit(&self, winner_count: u16) -> usize {
        (u64::from(winner_count) * u64::from(self.numerator) / u64::from(self.denominator)) as usize
    }
}

#[derive(Clone, Debug)]
pub struct RollRules {
    pub pool: Pool,
    pub winner_count: u16,
    pub cooldown_s: u32,
    pub cohort_caps: Vec<CohortCap>,
    pub weight_curve: WeightCurve,
    /// A free !join path admits everyone with the same weight, including
    /// members of a restricted pool. It never means merely a discounted entry.
    pub free_join_equal_odds: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Entry {
    pub user_id: TwitchUserId,
    pub source_message_id: MessageId,
    pub entered_at: DateTime<Utc>,
    pub cohorts: BTreeSet<String>,
    pub weight: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Intake {
    Added,
    AlreadyEntered,
    Ineligible,
    Cooldown,
}

/// Eligibility only: never chooses a winner. Future proof-core integration must
/// separately authorize the draw with GuardedDraw before deriving any result.
pub struct Roll {
    rules: RollRules,
    entries: BTreeMap<String, Entry>,
    last_wins: BTreeMap<String, DateTime<Utc>>,
}

impl Roll {
    pub fn new(rules: RollRules) -> Result<Self> {
        if rules.winner_count == 0 {
            return Err(Error::Invalid("winner count must be positive"));
        }
        if let Pool::Keyword(keyword) = &rules.pool
            && (keyword.is_empty() || keyword.chars().any(char::is_whitespace))
        {
            return Err(Error::Invalid("keyword must be one nonempty token"));
        }
        let mut caps = BTreeSet::new();
        if rules.cohort_caps.iter().any(|c| !caps.insert(&c.cohort)) {
            return Err(Error::Invalid("duplicate cohort cap"));
        }
        Ok(Self {
            rules,
            entries: BTreeMap::new(),
            last_wins: BTreeMap::new(),
        })
    }

    fn curve(&self) -> WeightCurve {
        if self.rules.free_join_equal_odds {
            WeightCurve::Equal
        } else {
            self.rules.weight_curve
        }
    }

    pub fn intake(&mut self, passed: PassedMessage) -> Intake {
        let message = passed.0;
        let eligible = match &self.rules.pool {
            Pool::Chatters => true,
            Pool::Followers => message.follower,
            Pool::Subscribers => message.subscriber,
            Pool::Redeemers => message.redeemed,
            Pool::Keyword(keyword) => message
                .text
                .split_whitespace()
                .any(|token| token.eq_ignore_ascii_case(keyword)),
        } || (self.rules.free_join_equal_odds
            && message.text.trim().eq_ignore_ascii_case("!join"));
        if !eligible {
            return Intake::Ineligible;
        }
        if self.cooling(&message.user_id, message.at) {
            return Intake::Cooldown;
        }
        if self.entries.contains_key(message.user_id.as_str()) {
            return Intake::AlreadyEntered;
        }
        let entry = Entry {
            weight: self.curve().weight(message.activity_units),
            user_id: message.user_id,
            source_message_id: message.message_id,
            entered_at: message.at,
            cohorts: message.cohorts,
        };
        self.entries
            .insert(entry.user_id.as_str().to_owned(), entry);
        Intake::Added
    }

    fn cooling(&self, user: &TwitchUserId, at: DateTime<Utc>) -> bool {
        self.last_wins.get(user.as_str()).is_some_and(|last| {
            // A time moving backwards must not bypass a cooldown.
            at.signed_duration_since(*last)
                < chrono::Duration::seconds(i64::from(self.rules.cooldown_s))
        })
    }

    pub fn lookup(&self, user: &TwitchUserId, at: DateTime<Utc>) -> Option<&Entry> {
        self.entries
            .get(user.as_str())
            .filter(|entry| entry.entered_at <= at && !self.cooling(user, at))
    }

    pub fn weight_table(&self, at: DateTime<Utc>) -> WeightTable {
        let rows = self
            .entries
            .values()
            .filter(|e| self.lookup(&e.user_id, at).is_some())
            .map(|e| WeightRow {
                user_id: e.user_id.clone(),
                weight: e.weight,
            })
            .collect();
        WeightTable::new(rows, self.curve())
    }

    /// Check an externally derived complete result. There is no sampling,
    /// randomness, seal, beacon or writ implementation in this crate.
    pub fn validate_winners(&self, winners: &[TwitchUserId], at: DateTime<Utc>) -> Result<()> {
        if winners.len() != usize::from(self.rules.winner_count) {
            return Err(Error::Winners("wrong winner count"));
        }
        let mut seen = BTreeSet::new();
        for user in winners {
            if !seen.insert(user.as_str()) {
                return Err(Error::Winners("duplicate winner"));
            }
            if self.lookup(user, at).is_none() {
                return Err(Error::Winners("not an eligible entrant or in cooldown"));
            }
        }
        for cap in &self.rules.cohort_caps {
            let count = winners
                .iter()
                .filter(|user| self.entries[user.as_str()].cohorts.contains(&cap.cohort))
                .count();
            if count > cap.limit(self.rules.winner_count) {
                return Err(Error::Winners("cohort cap exceeded"));
            }
        }
        Ok(())
    }

    /// Atomically remember a validated result for eligibility in the next roll.
    /// This does not authorize publication or select any winners.
    pub fn record_winners(&mut self, winners: &[TwitchUserId], at: DateTime<Utc>) -> Result<()> {
        self.validate_winners(winners, at)?;
        for user in winners {
            self.last_wins.insert(user.as_str().to_owned(), at);
        }
        Ok(())
    }

    /// Open a fresh entry pool while preserving winner cooldown history.
    pub fn clear_entries(&mut self) {
        self.entries.clear();
    }
}
