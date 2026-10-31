//! WP 3.1–3.3 visual contracts only. Design-package layers belong to WP 3.2.
use crate::{DesignId, MessageId, SimulationLabel, TwitchUserId, VisualId};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::num::NonZeroU32;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ContributionSource {
    Cheer,
    BitsUse,
    Subscribe,
    Gift,
    Resub,
    HypeTrain,
    ChannelPoints,
    Charity,
    Goal,
    PowerUp,
}

/// Native integer units, matching Contribution amounts. No conversion is implied.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum VisualInputUnit {
    Bits,
    Count,
    Level,
    Points,
    MinorCurrency,
}

/// One selected source in its native unit; routing is a later delivery.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(try_from = "VisualInputFields")]
#[schemars(with = "VisualInputFields")]
pub struct VisualInput {
    pub source: ContributionSource,
    pub unit: VisualInputUnit,
}

#[derive(Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
#[schemars(extend("oneOf" = [
    {"type":"object","required":["source","unit"],"additionalProperties":false,
        "properties":{"source":{"enum":["cheer","bits_use"]},"unit":{"const":"bits"}}},
    {"type":"object","required":["source","unit"],"additionalProperties":false,
        "properties":{"source":{"enum":["subscribe","gift","resub","power_up"]},"unit":{"const":"count"}}},
    {"type":"object","required":["source","unit"],"additionalProperties":false,
        "properties":{"source":{"const":"hype_train"},"unit":{"const":"level"}}},
    {"type":"object","required":["source","unit"],"additionalProperties":false,
        "properties":{"source":{"const":"channel_points"},"unit":{"const":"points"}}},
    {"type":"object","required":["source","unit"],"additionalProperties":false,
        "properties":{"source":{"enum":["charity","goal"]},"unit":{"const":"minor_currency"}}}
]))]
struct VisualInputFields {
    source: ContributionSource,
    unit: VisualInputUnit,
}

impl TryFrom<VisualInputFields> for VisualInput {
    type Error = &'static str;
    fn try_from(value: VisualInputFields) -> Result<Self, Self::Error> {
        let expected = match value.source {
            ContributionSource::Cheer | ContributionSource::BitsUse => VisualInputUnit::Bits,
            ContributionSource::Subscribe
            | ContributionSource::Gift
            | ContributionSource::Resub
            | ContributionSource::PowerUp => VisualInputUnit::Count,
            ContributionSource::HypeTrain => VisualInputUnit::Level,
            ContributionSource::ChannelPoints => VisualInputUnit::Points,
            ContributionSource::Charity | ContributionSource::Goal => {
                VisualInputUnit::MinorCurrency
            }
        };
        if value.unit != expected {
            return Err("visual input unit must match the source's native unit");
        }
        Ok(Self {
            source: value.source,
            unit: value.unit,
        })
    }
}

/// Finite fraction, not a percentage. Both schema and Rust reject nonfinite values.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(try_from = "f64", into = "f64")]
#[schemars(with = "f64", extend("minimum" = 0.0, "maximum" = 1.0))]
pub struct Intensity(f64);
impl TryFrom<f64> for Intensity {
    type Error = &'static str;
    fn try_from(value: f64) -> Result<Self, Self::Error> {
        if value.is_finite() && (0.0..=1.0).contains(&value) {
            Ok(Self(value))
        } else {
            Err("expected finite intensity in 0..1")
        }
    }
}
impl From<Intensity> for f64 {
    fn from(value: Intensity) -> Self {
        value.0
    }
}

/// Control points mapping contribution totals to intensity, interpolated by WP 3.1.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct IntensityRange {
    pub total: u32,
    pub intensity: Intensity,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum IntensityDecay {
    None {},
    Exponential {
        #[schemars(range(min = 1))]
        half_life_s: NonZeroU32,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct IntensityCurve {
    #[serde(deserialize_with = "ranges")]
    #[schemars(length(min = 1))]
    pub ranges: Vec<IntensityRange>,
    pub decay: IntensityDecay,
}
fn ranges<'de, D: serde::Deserializer<'de>>(d: D) -> Result<Vec<IntensityRange>, D::Error> {
    let values = Vec::<IntensityRange>::deserialize(d)?;
    if values.is_empty() {
        Err(serde::de::Error::custom("expected at least one range"))
    } else {
        Ok(values)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Visual {
    pub visual_id: VisualId,
    #[serde(deserialize_with = "crate::rule::nonblank")]
    #[schemars(extend("pattern" = r"\S"))]
    pub name: String,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::present"
    )]
    #[schemars(with = "DesignId")]
    pub design_id: Option<DesignId>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::present"
    )]
    #[schemars(with = "VisualInput")]
    pub input: Option<VisualInput>,
    pub curve: IntensityCurve,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct VisualListResult {
    pub visuals: Vec<Visual>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct VisualUpsertParams {
    pub visual: Visual,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::present"
    )]
    #[schemars(with = "crate::Display")]
    pub display: Option<crate::Display>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct CurveSetParams {
    pub visual_id: VisualId,
    pub curve: IntensityCurve,
}

/// Units: Bits for cheer/bits_use; counts for subs/gifts/resubs/power-ups;
/// level for hype_train; points for channel_points; minor currency units for
/// charity/goal. WP 3.1 must configure compatible inputs before aggregating totals.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Contribution {
    pub source: ContributionSource,
    pub broadcaster_id: TwitchUserId,
    pub event_id: MessageId,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::present"
    )]
    #[schemars(with = "TwitchUserId")]
    pub user_id: Option<TwitchUserId>,
    pub amount: u32,
    /// Canonical underlying contribution identity, scoped by broadcaster, NOT
    /// the transport event ID or source. Overlapping cheer/bits_use use one key.
    #[serde(deserialize_with = "crate::rule::nonblank")]
    #[schemars(extend("pattern" = r"\S"))]
    pub dedupe_key: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct BeaconsIntensity {
    pub visual_id: VisualId,
    pub intensity: Intensity,
}

/// Synthetic input, never client-provided Twitch identities or live ledger events.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct SimulatedBurst {
    pub source: ContributionSource,
    pub amount: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct BeaconsSimulateParams {
    pub visual_id: VisualId,
    pub burst: SimulatedBurst,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct BeaconsSimulateResult {
    pub label: SimulationLabel,
    pub intensity: BeaconsIntensity,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct SourceUrlParams {
    pub visual_id: VisualId,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct SourceUrlResult {
    pub url: LoopbackSourceUrl,
}

/// Canonical HTTP overlay URL: exact loopback host, explicit port, ASCII path/query.
/// WP 3.2 supplies this from its isolated read-only origin, never the RPC origin.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(try_from = "String", into = "String")]
#[schemars(with = "String", extend("pattern" = r"^http://(?:localhost|127\.0\.0\.1|\[::1\]):(?:[1-9][0-9]{0,3}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5])/(?:[A-Za-z0-9_~./?&=+-]|%[0-9A-Fa-f]{2})*$(?![\s\S])"))]
pub struct LoopbackSourceUrl(String);
impl TryFrom<String> for LoopbackSourceUrl {
    type Error = &'static str;
    fn try_from(value: String) -> Result<Self, Self::Error> {
        let valid = value
            .strip_prefix("http://")
            .and_then(|v| v.split_once('/'))
            .is_some_and(|(authority, path)| {
                let Some((host, port)) = authority.rsplit_once(':') else {
                    return false;
                };
                ["localhost", "127.0.0.1", "[::1]"].contains(&host)
                    && port
                        .parse::<u16>()
                        .is_ok_and(|p| p > 0 && p.to_string() == port)
                    && url_path(path)
            });
        if valid {
            Ok(Self(value))
        } else {
            Err("expected canonical loopback overlay URL")
        }
    }
}
impl From<LoopbackSourceUrl> for String {
    fn from(value: LoopbackSourceUrl) -> Self {
        value.0
    }
}

fn url_path(path: &str) -> bool {
    let mut bytes = path.bytes();
    while let Some(b) = bytes.next() {
        if b == b'%' {
            if !bytes.next().is_some_and(|b| b.is_ascii_hexdigit())
                || !bytes.next().is_some_and(|b| b.is_ascii_hexdigit())
            {
                return false;
            }
        } else if !b.is_ascii_alphanumeric() && !b"_~./?&=+-".contains(&b) {
            return false;
        }
    }
    true
}
