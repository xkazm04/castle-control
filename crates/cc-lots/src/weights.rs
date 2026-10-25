use crate::{Error, Result};
use cc_store::TwitchUserId;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum WeightCurve {
    #[default]
    Equal,
    /// Integer diminishing increments: c, c-1, ..., 1, then zero.
    /// Baseline c; weight(n) = c + n(2c - n + 1)/2, n=min(units,c).
    Concave(std::num::NonZeroU16),
}

impl WeightCurve {
    pub fn concave(max_units: u16) -> Result<Self> {
        std::num::NonZeroU16::new(max_units)
            .map(Self::Concave)
            .ok_or(Error::Invalid("weight cap must be positive"))
    }

    pub fn weight(self, activity_units: u16) -> u64 {
        match self {
            Self::Equal => 1,
            Self::Concave(cap) => {
                let c = u64::from(cap.get());
                let n = u64::from(activity_units).min(c);
                c + n * (2 * c - n + 1) / 2
            }
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WeightRow {
    pub user_id: TwitchUserId,
    pub weight: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WeightTable {
    pub rows: Vec<WeightRow>,
    pub newcomer_weight: u64,
    pub heaviest_weight: u64,
    /// Smallest number with strictly greater combined weight; absent for no entries.
    pub newcomers_to_outweigh_heaviest: Option<u64>,
}

impl WeightTable {
    pub(crate) fn new(rows: Vec<WeightRow>, curve: WeightCurve) -> Self {
        let newcomer_weight = curve.weight(0);
        let heaviest_weight = rows.iter().map(|r| r.weight).max().unwrap_or(0);
        Self {
            newcomers_to_outweigh_heaviest: (!rows.is_empty())
                .then_some(heaviest_weight / newcomer_weight + 1),
            rows,
            newcomer_weight,
            heaviest_weight,
        }
    }
}
