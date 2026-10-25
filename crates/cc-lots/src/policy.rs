use crate::{Error, Result};
use cc_store::{DrawRiskSetting, DrawSlug, LedgerEvent, Store, Timestamp};
use cc_types::{CheckResult, DrawContent, DrawId};

/// Rust-only settings. Amounts use integer USD cents, never floating point.
#[derive(Clone, Debug)]
pub struct DrawPolicy {
    pub content: DrawContent,
    pub paid_entry: bool,
    pub paid_weight: bool,
    pub subscriber_only: bool,
    pub channel_points: bool,
    pub free_entry_equal_odds: bool,
    pub minimum_age: Option<u8>,
    pub regions: Vec<String>,
    pub prize_value_usd_cents: u64,
    pub registration_confirmed: bool,
    pub official_rules: bool,
    pub twitch_disclaimer: bool,
}

impl Default for DrawPolicy {
    fn default() -> Self {
        Self {
            content: DrawContent::Question,
            paid_entry: false,
            paid_weight: false,
            subscriber_only: false,
            channel_points: false,
            free_entry_equal_odds: true,
            minimum_age: None,
            regions: Vec::new(),
            prize_value_usd_cents: 0,
            registration_confirmed: false,
            official_rules: true,
            twitch_disclaimer: true,
        }
    }
}

/// Reasons are local domain data, not new contract identifiers.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum PolicyReason {
    PaidEntry,
    PaidWeight,
    PrizeValueOverCap,
    SubscriberOnly,
    PointsWithoutFreePath,
    MissingAge,
    MissingRegion,
    MissingRules,
    MissingDisclaimer,
}

impl PolicyReason {
    fn risk_setting(&self) -> Option<DrawRiskSetting> {
        match self {
            Self::PaidEntry => Some(DrawRiskSetting::PaidEntry),
            Self::PaidWeight => Some(DrawRiskSetting::PaidWeight),
            Self::PrizeValueOverCap => Some(DrawRiskSetting::PrizeValueOverCap),
            _ => None,
        }
    }

    fn blocks(&self) -> bool {
        self.risk_setting().is_some()
            || matches!(self, Self::MissingRules | Self::MissingDisclaimer)
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DrawCheck {
    pub result: CheckResult,
    pub reasons: Vec<PolicyReason>,
}

impl DrawCheck {
    fn from_reasons(reasons: Vec<PolicyReason>) -> Self {
        let result = if reasons.iter().any(PolicyReason::blocks) {
            CheckResult::Blocked
        } else if reasons.is_empty() {
            CheckResult::Ok
        } else {
            CheckResult::Warn
        };
        Self { result, reasons }
    }
}

/// Pure default policy, independent of storage, clocks and previous checks.
pub fn check_draw(policy: &DrawPolicy) -> DrawCheck {
    if policy.content != DrawContent::Prize {
        return DrawCheck::from_reasons(Vec::new());
    }
    let mut reasons = Vec::new();
    for (condition, reason) in [
        (policy.paid_entry, PolicyReason::PaidEntry),
        (policy.paid_weight, PolicyReason::PaidWeight),
        (
            policy.prize_value_usd_cents > 500_000 && !policy.registration_confirmed,
            PolicyReason::PrizeValueOverCap,
        ),
        (policy.subscriber_only, PolicyReason::SubscriberOnly),
        (
            policy.channel_points && !policy.free_entry_equal_odds,
            PolicyReason::PointsWithoutFreePath,
        ),
        (policy.minimum_age.is_none(), PolicyReason::MissingAge),
        (
            policy.regions.is_empty() || policy.regions.iter().any(|r| r.trim().is_empty()),
            PolicyReason::MissingRegion,
        ),
        (!policy.official_rules, PolicyReason::MissingRules),
        (!policy.twitch_disclaimer, PolicyReason::MissingDisclaimer),
    ] {
        if condition {
            reasons.push(reason);
        }
    }
    DrawCheck::from_reasons(reasons)
}

/// Acknowledgements belong to this configured draw. Reconfiguration constructs
/// a fresh value, so a previous acknowledgement cannot unlock changed settings.
pub struct GuardedDraw {
    draw_id: DrawId,
    policy: DrawPolicy,
    acknowledged: Vec<DrawRiskSetting>,
}

impl GuardedDraw {
    pub fn new(draw_id: DrawId, policy: DrawPolicy) -> Self {
        Self {
            draw_id,
            policy,
            acknowledged: Vec::new(),
        }
    }

    pub fn check(&self) -> DrawCheck {
        let reasons = check_draw(&self.policy)
            .reasons
            .into_iter()
            .filter(|reason| {
                !reason
                    .risk_setting()
                    .is_some_and(|s| self.acknowledged.contains(&s))
            })
            .collect();
        DrawCheck::from_reasons(reasons)
    }

    /// Acknowledge a paid-entry/paid-weight risk. Returns false on an already
    /// acknowledged setting; it never appends a duplicate acknowledgement.
    /// Over-cap prizes require `confirm_registration`, not a general override.
    pub fn unlock(
        &mut self,
        setting: DrawRiskSetting,
        store: &mut Store,
        event_at: Timestamp,
        recorded_at: Timestamp,
    ) -> Result<bool> {
        if setting == DrawRiskSetting::PrizeValueOverCap {
            return Err(Error::Invalid("confirm registration for over-cap prizes"));
        }
        self.acknowledge(setting, store, event_at, recorded_at)
    }

    /// The caller explicitly confirms registration. The audit must be durable
    /// before either registration confirmation or the unlock takes effect.
    pub fn confirm_registration(
        &mut self,
        store: &mut Store,
        event_at: Timestamp,
        recorded_at: Timestamp,
    ) -> Result<bool> {
        let changed = self.acknowledge(
            DrawRiskSetting::PrizeValueOverCap,
            store,
            event_at,
            recorded_at,
        )?;
        self.policy.registration_confirmed = true;
        Ok(changed)
    }

    fn acknowledge(
        &mut self,
        setting: DrawRiskSetting,
        store: &mut Store,
        event_at: Timestamp,
        recorded_at: Timestamp,
    ) -> Result<bool> {
        if self.acknowledged.contains(&setting) {
            return Ok(false);
        }
        if !check_draw(&self.policy)
            .reasons
            .iter()
            .any(|r| r.risk_setting() == Some(setting))
        {
            return Err(Error::Invalid("setting is not blocked on this draw"));
        }
        store.append_ledger(
            event_at,
            recorded_at,
            LedgerEvent::DrawRiskAcknowledged {
                draw_id: DrawSlug::parse(self.draw_id.as_str())?,
                setting,
            },
        )?;
        self.acknowledged.push(setting);
        Ok(true)
    }
}
