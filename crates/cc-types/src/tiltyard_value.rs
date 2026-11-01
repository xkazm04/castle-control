//! Bounded tournament values, shared by control and overlay schemas.
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

macro_rules! text {
    ($name:ident, $min:literal, $max:literal, $pattern:literal, $check:expr) => {
        #[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
        #[serde(try_from = "String", into = "String")]
        #[schemars(with = "String", extend("minLength" = $min, "maxLength" = $max, "pattern" = $pattern))]
        pub struct $name(String);
        impl TryFrom<String> for $name {
            type Error = &'static str;
            fn try_from(value: String) -> Result<Self, Self::Error> {
                if ($min..=$max).contains(&value.chars().count()) && ($check)(&value) {
                    Ok(Self(value))
                } else {
                    Err(concat!("invalid ", stringify!($name)))
                }
            }
        }
        impl From<$name> for String {
            fn from(value: $name) -> Self {
                value.0
            }
        }
    };
}

// Match JavaScript trim / JSON Schema's ECMAScript \S, including BOM and NEL.
fn nonblank(value: &str) -> bool {
    value.chars().any(|c| {
        !matches!(c, '\u{0009}'..='\u{000d}' | ' ' | '\u{00a0}' | '\u{1680}'
            | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}'
            | '\u{205f}' | '\u{3000}' | '\u{feff}')
    })
}
text!(TiltyardLabel, 1, 256, r"\S", nonblank);
text!(TiltyardNote, 0, 2048, r"[\s\S]*", |_: &str| true);
text!(
    TiltyardId,
    1,
    64,
    r"^[a-z0-9]+(-[a-z0-9]+)*$(?![\s\S])",
    |v: &str| {
        v.split('-').all(|part| {
            !part.is_empty()
                && part
                    .bytes()
                    .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit())
        })
    }
);
// Numeric rank, not an RNG seed. Lower is better; equal ranks favour the left.
text!(
    TiltyardSeed,
    1,
    128,
    r"^(0|[1-9][0-9]*)$(?![\s\S])",
    |v: &str| { v.bytes().all(|b| b.is_ascii_digit()) && (v == "0" || !v.starts_with('0')) }
);
text!(
    TiltyardRound,
    1,
    1,
    r"^[0-2]$(?![\s\S])",
    |v: &str| matches!(v, "0" | "1" | "2")
);
text!(
    TiltyardMatchKey,
    5,
    68,
    r"^[a-z0-9]+(-[a-z0-9]+)*:[0-2]:[0-3]$(?![\s\S])",
    |v: &str| {
        let parts: Vec<_> = v.split(':').collect();
        parts.len() == 3
            && TiltyardId::try_from(parts[0].to_owned()).is_ok()
            && matches!(parts[1], "0" | "1" | "2")
            && matches!(parts[2], "0" | "1" | "2" | "3")
    }
);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(try_from = "u32", into = "u32")]
#[schemars(with = "u32", extend("minimum" = 1))]
pub struct TiltyardWindowMs(u32);
impl TryFrom<u32> for TiltyardWindowMs {
    type Error = &'static str;
    fn try_from(value: u32) -> Result<Self, Self::Error> {
        if value > 0 {
            Ok(Self(value))
        } else {
            Err("expected positive window_ms")
        }
    }
}
impl From<TiltyardWindowMs> for u32 {
    fn from(value: TiltyardWindowMs) -> Self {
        value.0
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(try_from = "u32", into = "u32")]
#[schemars(with = "u32", extend("enum" = [1, 3]))]
pub struct TiltyardSpeed(u32);
impl TryFrom<u32> for TiltyardSpeed {
    type Error = &'static str;
    fn try_from(value: u32) -> Result<Self, Self::Error> {
        if matches!(value, 1 | 3) {
            Ok(Self(value))
        } else {
            Err("invalid speed")
        }
    }
}
impl From<TiltyardSpeed> for u32 {
    fn from(value: TiltyardSpeed) -> Self {
        value.0
    }
}

pub(crate) fn items<'de, D, T>(d: D) -> Result<Vec<T>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    bounded(d, 2, 64)
}
pub(crate) fn seeds<'de, D, T>(d: D) -> Result<Vec<T>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    bounded(d, 2, 8)
}
pub(crate) fn rounds<'de, D, T>(d: D) -> Result<Vec<T>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    bounded(d, 1, 3)
}
pub(crate) fn matches<'de, D, T>(d: D) -> Result<Vec<T>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    bounded(d, 1, 4)
}
pub(crate) fn history<'de, D, T>(d: D) -> Result<Vec<T>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    bounded(d, 0, 7)
}
fn bounded<'de, D, T>(d: D, min: usize, max: usize) -> Result<Vec<T>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    let value = Vec::<T>::deserialize(d)?;
    if (min..=max).contains(&value.len()) {
        Ok(value)
    } else {
        Err(serde::de::Error::custom(
            "invalid tournament collection length",
        ))
    }
}
