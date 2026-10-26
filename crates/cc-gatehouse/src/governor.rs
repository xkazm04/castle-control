//! Offline room governor. All types here are Rust-only, not wire contracts.
//! It owns no executor, storage, task or transport. Call `tick` even during silence.
use crate::{Result, ScreenedMessage, date, error, internal};
use cc_store::Clock;
use cc_types::{ErrorCode, RoomMode, Tier, Timestamp, Verdict};
use chrono::{DateTime, FixedOffset, TimeDelta};
use std::{collections::BTreeMap, sync::Arc};

type Time = DateTime<FixedOffset>;
const TIERS: [Tier; 4] = [Tier::S, Tier::M, Tier::L, Tier::Xl];

/// A room setting, never an action on a viewer. No serialization is provided.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RoomSetting {
    Slow { interval_s: u32 },
    FollowerOnly { minimum_age_s: u32 },
    EmoteOnly,
    UniqueChat,
}

impl RoomSetting {
    pub fn mode(self) -> RoomMode {
        match self {
            Self::Slow { .. } => RoomMode::Slow,
            Self::FollowerOnly { .. } => RoomMode::FollowerOnly,
            Self::EmoteOnly => RoomMode::EmoteOnly,
            Self::UniqueChat => RoomMode::UniqueChat,
        }
    }
}

/// Exhaustively room-only: neither variant can name a person or punitive action.
/// `End` releases an unyielded lease; it never reverts a human's replacement.
/// These are proposals only, with no live executor or RPC registration.
///
/// ```compile_fail
/// use cc_gatehouse::governor::RoomModeIntent;
/// use cc_types::RoomMode;
/// let intent = RoomModeIntent::End {
///     mode: RoomMode::Slow,
///     user_id: "123".to_owned(), // room intents cannot address a viewer
/// };
/// ```
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RoomModeIntent {
    Apply {
        setting: RoomSetting,
        expires_at: Timestamp,
    },
    End {
        mode: RoomMode,
    },
}

/// Explicit simulation policy; no guessed thresholds or live defaults.
pub struct GovernorConfig {
    /// Ascending S/M, M/L, L/XL borders, measured in distinct passed chatters.
    pub borders: [usize; 3],
    pub margin: usize,
    /// A candidate must continuously clear its border for this whole interval.
    pub hysteresis_s: u32,
    pub lease_s: u32,
    /// Settings on entering S, M, L, XL respectively; empty means no proposals.
    pub plans: [Vec<RoomSetting>; 4],
}

impl GovernorConfig {
    fn validate(&self) -> Result<()> {
        if self.margin == 0
            || self.hysteresis_s == 0
            || self.lease_s == 0
            || self.borders[0] <= self.margin
            || self.borders.windows(2).any(|p| p[0] >= p[1])
            || self
                .borders
                .iter()
                .any(|b| b.checked_add(self.margin).is_none())
        {
            return Err(error(
                ErrorCode::Invalid,
                "invalid governor thresholds or windows",
            ));
        }
        for plan in &self.plans {
            let mut seen = [false; 4];
            for setting in plan {
                let slot = &mut seen[mode_index(setting.mode())];
                if *slot
                    || matches!(setting, RoomSetting::Slow { interval_s } if !(3..=120).contains(interval_s))
                {
                    return Err(error(
                        ErrorCode::Invalid,
                        "duplicate or invalid room setting",
                    ));
                }
                *slot = true;
            }
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RoomLease {
    pub setting: RoomSetting,
    pub expires_at: Timestamp,
    pub yielded: bool,
}

/// A snapshot contains room information and room-mode intents only.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GovernorUpdate {
    pub tier: Tier,
    pub chatters: usize,
    pub intents: Vec<RoomModeIntent>,
}

struct Lease {
    setting: RoomSetting,
    end: Time,
    expires_at: Timestamp,
    yielded: bool,
}

pub struct Governor {
    config: GovernorConfig,
    clock: Arc<dyn Clock>,
    watermark: Time,
    last_seen: BTreeMap<String, Time>,
    tier_index: usize,
    candidate: Option<(usize, Time)>,
    leases: [Option<Lease>; 4],
    issued: [bool; 4],
}

impl Governor {
    pub fn new(config: GovernorConfig, clock: Arc<dyn Clock>) -> Result<Self> {
        config.validate()?;
        let watermark = now(clock.as_ref())?;
        Ok(Self {
            config,
            clock,
            watermark,
            last_seen: BTreeMap::new(),
            tier_index: 0,
            candidate: None,
            leases: std::array::from_fn(|_| None),
            issued: [false; 4],
        })
    }

    fn time(&self) -> Result<Time> {
        let at = now(self.clock.as_ref())?;
        if at < self.watermark {
            return Err(error(
                ErrorCode::Invalid,
                "governor clock must be monotonic",
            ));
        }
        Ok(at)
    }

    fn prune(&mut self, at: Time) {
        self.watermark = at;
        // The trailing window is (now - 600 s, now], including subsecond time.
        self.last_seen
            .retain(|_, seen| at - *seen < TimeDelta::seconds(600));
        // A delayed tick/arrival cannot bridge a period with too few chatters.
        if self
            .candidate
            .is_some_and(|(target, _)| self.target() != target)
        {
            self.candidate = None;
        }
    }

    /// Consume only final passed moderation results. Stale events do not revive
    /// a chatter, and out-of-order duplicates never move last-seen backward.
    pub fn observe_chat(&mut self, screened: &ScreenedMessage) -> Result<()> {
        let at = self.time()?;
        let seen = date(&screened.message.at)?;
        if seen > at {
            return Err(error(ErrorCode::Invalid, "governor chat is in the future"));
        }
        self.prune(at);
        if screened.decision.verdict == Verdict::Pass
            && screened.decision.message_id == screened.message.message_id
            && at - seen < TimeDelta::seconds(600)
        {
            self.last_seen
                .entry(screened.message.user_id.as_str().to_owned())
                .and_modify(|last| *last = (*last).max(seen))
                .or_insert(seen);
        }
        Ok(())
    }

    /// The caller must distinguish an observed human change from our own echo.
    /// Preserve the original expiry; yielding never renews a lease. A late human
    /// observation also suppresses an expired lease's pending End proposal.
    pub fn observe_human_change(&mut self, mode: RoomMode) -> Result<()> {
        let at = self.time()?;
        self.prune(at);
        let index = mode_index(mode);
        if let Some(lease) = &mut self.leases[index] {
            lease.yielded = true;
        }
        self.issued[index] = true;
        Ok(())
    }

    /// Advance the pure state machine, including expiry when no chat arrives.
    /// A plan issues each setting once per tier activation, never auto-renewing.
    /// Existing leases (including yielded ones) keep their original deadline
    /// across tier changes; a new tier's setting waits for that deadline.
    pub fn tick(&mut self) -> Result<GovernorUpdate> {
        let at = self.time()?;
        let end = at
            .checked_add_signed(TimeDelta::seconds(i64::from(self.config.lease_s)))
            .ok_or_else(|| error(ErrorCode::Invalid, "governor lease time overflow"))?;
        let expires_at = stamp(end)?;
        self.prune(at);
        let target = self.target();
        if target == self.tier_index {
            self.candidate = None;
        } else {
            let since = match self.candidate {
                Some((previous, since)) if previous == target => since,
                _ => at,
            };
            self.candidate = Some((target, since));
            if at - since >= TimeDelta::seconds(i64::from(self.config.hysteresis_s)) {
                self.tier_index = target;
                self.candidate = None;
                self.issued = [false; 4];
            }
        }
        let mut intents = Vec::new();
        for slot in &mut self.leases {
            if slot.as_ref().is_some_and(|lease| at >= lease.end) {
                let lease = slot.take().expect("checked lease");
                if !lease.yielded {
                    intents.push(RoomModeIntent::End {
                        mode: lease.setting.mode(),
                    });
                }
            }
        }
        for &setting in &self.config.plans[self.tier_index] {
            let index = mode_index(setting.mode());
            if !self.issued[index] && self.leases[index].is_none() {
                self.leases[index] = Some(Lease {
                    setting,
                    end,
                    expires_at: expires_at.clone(),
                    yielded: false,
                });
                self.issued[index] = true;
                intents.push(RoomModeIntent::Apply {
                    setting,
                    expires_at: expires_at.clone(),
                });
            }
        }
        Ok(GovernorUpdate {
            tier: TIERS[self.tier_index],
            chatters: self.last_seen.len(),
            intents,
        })
    }

    /// Snapshot as of the last tick/observation. Call tick to process deadlines.
    pub fn leases(&self) -> Vec<RoomLease> {
        self.leases
            .iter()
            .flatten()
            .map(|lease| RoomLease {
                setting: lease.setting,
                expires_at: lease.expires_at.clone(),
                yielded: lease.yielded,
            })
            .collect()
    }

    fn target(&self) -> usize {
        let count = self.last_seen.len();
        let mut target = self.tier_index;
        while target < 3 && count >= self.config.borders[target] + self.config.margin {
            target += 1;
        }
        while target > 0 && count <= self.config.borders[target - 1] - self.config.margin {
            target -= 1;
        }
        target
    }
}

fn mode_index(mode: RoomMode) -> usize {
    match mode {
        RoomMode::Slow => 0,
        RoomMode::FollowerOnly => 1,
        RoomMode::EmoteOnly => 2,
        RoomMode::UniqueChat => 3,
    }
}

fn now(clock: &dyn Clock) -> Result<Time> {
    date(&clock.now().as_rfc3339().try_into().map_err(internal)?)
}

fn stamp(at: Time) -> Result<Timestamp> {
    at.to_rfc3339_opts(chrono::SecondsFormat::AutoSi, true)
        .try_into()
        .map_err(internal)
}
