//! Bounded recent contributions only; this read grants no routing authority.
use crate::Contribution;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

pub const BEACONS_MAX_PAGE_SIZE: u32 = 100;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(try_from = "u32", into = "u32")]
#[schemars(with = "u32", extend("minimum" = 1, "maximum" = 100))]
pub struct ContributionReadLimit(u32);

impl TryFrom<u32> for ContributionReadLimit {
    type Error = &'static str;
    fn try_from(value: u32) -> Result<Self, Self::Error> {
        (1..=BEACONS_MAX_PAGE_SIZE)
            .contains(&value)
            .then_some(Self(value))
            .ok_or("contribution read limit must be between 1 and 100")
    }
}
impl From<ContributionReadLimit> for u32 {
    fn from(value: ContributionReadLimit) -> Self {
        value.0
    }
}

/// Latest accepted contributions for the connected channel, newest first.
/// Required limit bounds the recent window; this is not a history export.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ContributionListParams {
    pub limit: ContributionReadLimit,
}

/// At most the requested limit, never more than 100. No viewer data is fabricated.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ContributionListResult {
    #[serde(deserialize_with = "items")]
    #[schemars(length(max = 100))]
    pub items: Vec<Contribution>,
}

fn items<'de, D: serde::Deserializer<'de>>(d: D) -> Result<Vec<Contribution>, D::Error> {
    let values = Vec::<Contribution>::deserialize(d)?;
    if values.len() > BEACONS_MAX_PAGE_SIZE as usize {
        Err(serde::de::Error::custom(
            "contribution page exceeds maximum",
        ))
    } else {
        Ok(values)
    }
}
