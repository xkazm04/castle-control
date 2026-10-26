//! The single projection door between the draw domain and its existing contract.
use cc_lots::{CohortCap, DrawPolicy, PolicyReason, Pool, Roll, RollRules, WeightCurve};
use cc_types::*;
use serde::{Serialize, de::DeserializeOwned};

pub(super) fn internal() -> ErrorEnvelope {
    ErrorEnvelope::new(ErrorCode::Internal, "lots state or persistence unavailable")
}
pub(super) fn domain(error: cc_lots::Error) -> ErrorEnvelope {
    let code = match error {
        cc_lots::Error::Store(_) => ErrorCode::Internal,
        _ => ErrorCode::Invalid,
    };
    ErrorEnvelope::new(code, "draw domain refused the operation")
}
pub(super) fn encode<T: Serialize>(value: T) -> Result<serde_json::Value, ErrorEnvelope> {
    serde_json::to_value(value).map_err(|_| internal())
}
pub(super) fn project<T: DeserializeOwned>(value: impl Serialize) -> Result<T, ErrorEnvelope> {
    serde_json::from_value(encode(value)?).map_err(|_| internal())
}
pub(super) fn policy(value: &LotsDrawPolicy) -> DrawPolicy {
    DrawPolicy {
        content: value.content,
        paid_entry: value.paid_entry,
        paid_weight: value.paid_weight,
        subscriber_only: value.subscriber_only,
        channel_points: value.channel_points,
        free_entry_equal_odds: value.free_entry_equal_odds,
        minimum_age: value.minimum_age,
        regions: value.regions.clone(),
        prize_value_usd_cents: value.prize_value_usd_cents.clone().into(),
        registration_confirmed: value.registration_confirmed,
        official_rules: value.official_rules,
        twitch_disclaimer: value.twitch_disclaimer,
    }
}
pub(super) fn check(value: &LotsDrawPolicy) -> DrawCheckResult {
    let checked = cc_lots::check_draw(&policy(value));
    DrawCheckResult {
        result: checked.result,
        reasons: checked
            .reasons
            .into_iter()
            .map(|reason| {
                match reason {
                    PolicyReason::PaidEntry => "paid_entry",
                    PolicyReason::PaidWeight => "paid_weight",
                    PolicyReason::PrizeValueOverCap => "prize_value_over_cap",
                    PolicyReason::SubscriberOnly => "subscriber_only",
                    PolicyReason::PointsWithoutFreePath => "points_without_free_path",
                    PolicyReason::MissingAge => "missing_age",
                    PolicyReason::MissingRegion => "missing_region",
                    PolicyReason::MissingRules => "missing_rules",
                    PolicyReason::MissingDisclaimer => "missing_disclaimer",
                }
                .to_owned()
            })
            .collect(),
    }
}
pub(super) fn roll(value: &LotsRollRules) -> Result<Roll, ErrorEnvelope> {
    Roll::new(RollRules {
        pool: match &value.pool {
            LotsPool::Chatters => Pool::Chatters,
            LotsPool::Followers => Pool::Followers,
            LotsPool::Subscribers => Pool::Subscribers,
            LotsPool::Redeemers => Pool::Redeemers,
            LotsPool::Keyword { keyword } => Pool::Keyword(keyword.clone().into()),
        },
        winner_count: value.winner_count.get(),
        cooldown_s: value.cooldown_s,
        cohort_caps: value
            .cohort_caps
            .iter()
            .map(|cap| CohortCap::new(cap.cohort.clone(), cap.numerator, cap.denominator.get()))
            .collect::<cc_lots::Result<_>>()
            .map_err(domain)?,
        weight_curve: match value.weight_curve {
            LotsWeightCurve::Equal => WeightCurve::Equal,
            LotsWeightCurve::Concave { max_units } => WeightCurve::Concave(max_units),
        },
        free_join_equal_odds: value.free_join_equal_odds,
    })
    .map_err(domain)
}
pub(super) fn entry(entry: &cc_lots::Entry) -> Result<LotsRollEntry, ErrorEnvelope> {
    Ok(LotsRollEntry {
        user_id: entry
            .user_id
            .as_str()
            .to_owned()
            .try_into()
            .map_err(|_| internal())?,
        source_message_id: entry.source_message_id.clone(),
        entered_at: entry
            .entered_at
            .to_rfc3339_opts(chrono::SecondsFormat::AutoSi, true)
            .try_into()
            .map_err(|_| internal())?,
        cohorts: entry.cohorts.iter().cloned().collect(),
        weight: u32::try_from(entry.weight)
            .ok()
            .and_then(std::num::NonZeroU32::new)
            .ok_or_else(internal)?,
    })
}
pub(super) fn table(table: cc_lots::WeightTable) -> Result<LotsWeightTable, ErrorEnvelope> {
    fn weight(value: u64) -> Result<std::num::NonZeroU32, ErrorEnvelope> {
        u32::try_from(value)
            .ok()
            .and_then(std::num::NonZeroU32::new)
            .ok_or_else(internal)
    }
    Ok(LotsWeightTable {
        rows: table
            .rows
            .into_iter()
            .map(|row| {
                Ok(LotsWeightRow {
                    user_id: row
                        .user_id
                        .as_str()
                        .to_owned()
                        .try_into()
                        .map_err(|_| internal())?,
                    weight: weight(row.weight)?,
                })
            })
            .collect::<Result<_, ErrorEnvelope>>()?,
        newcomer_weight: weight(table.newcomer_weight)?,
        heaviest_weight: table.heaviest_weight.try_into().map_err(|_| internal())?,
        newcomers_to_outweigh_heaviest: table
            .newcomers_to_outweigh_heaviest
            .map(weight)
            .transpose()?,
    })
}
