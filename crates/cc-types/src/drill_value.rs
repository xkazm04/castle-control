//! Scalar boundaries for the offline Gatehouse contracts; no replay or hashing code.
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// Nonempty opaque text. Recording references are service-owned handles, not paths.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(try_from = "String", into = "String")]
#[schemars(with = "String", extend("minLength" = 1))]
pub struct GatehouseText(String);
impl TryFrom<String> for GatehouseText {
    type Error = &'static str;
    fn try_from(value: String) -> Result<Self, Self::Error> {
        if value.is_empty() {
            Err("expected nonempty Gatehouse text")
        } else {
            Ok(Self(value))
        }
    }
}
impl From<GatehouseText> for String {
    fn from(value: GatehouseText) -> Self {
        value.0
    }
}

/// Canonical SHA-256 digest. Checking its contents against inputs belongs to WP 1.6.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(try_from = "String", into = "String")]
#[schemars(with = "String", extend("pattern" = r"^[0-9a-f]{64}$(?![\s\S])"))]
pub struct InstrumentHash(String);
impl TryFrom<String> for InstrumentHash {
    type Error = &'static str;
    fn try_from(value: String) -> Result<Self, Self::Error> {
        if value.len() == 64
            && value
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        {
            Ok(Self(value))
        } else {
            Err("expected 64 lowercase hexadecimal characters")
        }
    }
}
impl From<InstrumentHash> for String {
    fn from(value: InstrumentHash) -> Self {
        value.0
    }
}

macro_rules! fraction {
    ($name:ident, $min:literal) => {
        #[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
        #[serde(try_from = "f64", into = "f64")]
        #[schemars(with = "f64", extend("minimum" = $min, "maximum" = 1.0))]
        pub struct $name(f64);
        impl TryFrom<f64> for $name {
            type Error = &'static str;
            fn try_from(value: f64) -> Result<Self, Self::Error> {
                if value.is_finite() && ($min..=1.0).contains(&value) {
                    Ok(Self(value))
                } else {
                    Err(concat!("invalid ", stringify!($name)))
                }
            }
        }
        impl From<$name> for f64 {
            fn from(value: $name) -> Self {
                value.0
            }
        }
    };
}
fraction!(ConsensusShare, 0.0);
fraction!(ConsensusDelta, -1.0);
