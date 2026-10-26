use crate::{Result, error};
use cc_types::ErrorCode;
use std::time::Duration;

/// Local measurement, not a new wire contract. Separate upstream spans must be
/// provided by the host; the offline harness uses an explicitly simulated clock.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct HoldBudget {
    pub twitch_delay: Duration,
    pub scheduling_wait: Duration,
    pub admission: Duration,
    pub rules: Duration,
    pub model: Duration,
    pub gate: Duration,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BudgetSummary {
    pub n: usize,
    pub p95: HoldBudget,
}

pub struct MeasuredBatch {
    pub messages: Vec<crate::ScreenedMessage>,
    pub budgets: Vec<HoldBudget>,
}

impl HoldBudget {
    /// Stagewise nearest-rank p95, not the sum or p95 of total latency. Refuse an
    /// empty sample rather than reporting zeros that resemble measurements.
    pub fn summarise(samples: &[Self]) -> Result<BudgetSummary> {
        if samples.is_empty() {
            return Err(error(ErrorCode::Invalid, "empty hold-budget sample"));
        }
        let percentile = |get: fn(&Self) -> Duration| {
            let mut values: Vec<_> = samples.iter().map(get).collect();
            values.sort_unstable();
            values[samples.len() - samples.len() / 20 - 1]
        };
        Ok(BudgetSummary {
            n: samples.len(),
            p95: Self {
                twitch_delay: percentile(|s| s.twitch_delay),
                scheduling_wait: percentile(|s| s.scheduling_wait),
                admission: percentile(|s| s.admission),
                rules: percentile(|s| s.rules),
                model: percentile(|s| s.model),
                gate: percentile(|s| s.gate),
            },
        })
    }
}
