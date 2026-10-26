//! WP 3.2 design data only; rendering, asset loading and consent are host duties.
use crate::{DesignId, Intensity};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::num::NonZeroU32;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct DesignPackage {
    pub design_id: DesignId,
    /// Claimed SHA-256 content identity. The host must verify it before delivery;
    /// a well-formed digest alone proves neither integrity nor permission.
    pub content_hash: DesignContentHash,
    /// Back-to-front paint order, retained exactly by serialization.
    #[serde(deserialize_with = "nonempty")]
    #[schemars(length(min = 1))]
    pub layers: Vec<DesignLayer>,
    /// Omission grants no script capability. Present null is never omission.
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::present"
    )]
    #[schemars(with = "DesignPrivileges")]
    pub privileges: Option<DesignPrivileges>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum DesignPrivileges {
    DataOnly {},
    /// Explicit script entry points, relative to this package. This declaration
    /// does not authorize execution: the overlay host still checks consent.
    Scripts {
        #[serde(deserialize_with = "nonempty")]
        #[schemars(length(min = 1))]
        scripts: Vec<LocalAssetPath>,
    },
}
impl Default for DesignPrivileges {
    fn default() -> Self {
        Self::DataOnly {}
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum DesignLayer {
    Image {
        asset: LocalAssetPath,
        properties: LayerProperties,
        bindings: Vec<IntensityBinding>,
    },
    Shape {
        shape: ShapeKind,
        properties: LayerProperties,
        bindings: Vec<IntensityBinding>,
    },
    Text {
        #[serde(deserialize_with = "crate::rule::nonblank")]
        #[schemars(extend("pattern" = r"\S"))]
        text: String,
        properties: LayerProperties,
        bindings: Vec<IntensityBinding>,
    },
    ParticlePreset {
        /// A renderer-owned preset lookup name, never code or a resource URL.
        #[serde(deserialize_with = "crate::rule::nonblank")]
        #[schemars(extend("pattern" = r"\S"))]
        preset: String,
        properties: LayerProperties,
        bindings: Vec<IntensityBinding>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ShapeKind {
    Rectangle,
    Ellipse,
}

/// Base layout in logical pixels; scale is a nonnegative multiplier, opacity a
/// fraction. Text is literal text, not HTML; no layer carries arbitrary CSS/JS.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct LayerProperties {
    pub x: DesignNumber,
    pub y: DesignNumber,
    #[schemars(range(min = 1))]
    pub width: NonZeroU32,
    #[schemars(range(min = 1))]
    pub height: NonZeroU32,
    pub scale: DesignScale,
    pub opacity: Intensity,
}

/// Fixed input is Intensity 0..1. Endpoints are outputs at 0 and 1, so descending
/// output ranges are valid. Binding evaluation is separate renderer work.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct BindingRange<T> {
    pub at_zero: T,
    pub at_one: T,
}

/// The property tag also selects the output domain; opacity cannot exceed 1,
/// scale cannot be negative, and positions must be finite. No arbitrary CSS.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "property", rename_all = "snake_case", deny_unknown_fields)]
pub enum IntensityBinding {
    Opacity {
        output_range: BindingRange<Intensity>,
    },
    Scale {
        output_range: BindingRange<DesignScale>,
    },
    X {
        output_range: BindingRange<DesignNumber>,
    },
    Y {
        output_range: BindingRange<DesignNumber>,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(try_from = "f64", into = "f64")]
#[schemars(with = "f64")]
pub struct DesignNumber(f64);
impl TryFrom<f64> for DesignNumber {
    type Error = &'static str;
    fn try_from(value: f64) -> Result<Self, Self::Error> {
        if value.is_finite() {
            Ok(Self(value))
        } else {
            Err("expected finite design number")
        }
    }
}
impl From<DesignNumber> for f64 {
    fn from(value: DesignNumber) -> Self {
        value.0
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(try_from = "f64", into = "f64")]
#[schemars(with = "f64", extend("minimum" = 0.0))]
pub struct DesignScale(f64);
impl TryFrom<f64> for DesignScale {
    type Error = &'static str;
    fn try_from(value: f64) -> Result<Self, Self::Error> {
        if value.is_finite() && value >= 0.0 {
            Ok(Self(value))
        } else {
            Err("expected finite nonnegative design scale")
        }
    }
}
impl From<DesignScale> for f64 {
    fn from(value: DesignScale) -> Self {
        value.0
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(try_from = "String", into = "String")]
#[schemars(with = "String", extend("pattern" = r"^[0-9a-f]{64}$(?![\s\S])"))]
pub struct DesignContentHash(String);
impl TryFrom<String> for DesignContentHash {
    type Error = &'static str;
    fn try_from(value: String) -> Result<Self, Self::Error> {
        if value.len() == 64
            && value
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        {
            Ok(Self(value))
        } else {
            Err("expected lowercase SHA-256 hex digest")
        }
    }
}
impl From<DesignContentHash> for String {
    fn from(value: DesignContentHash) -> Self {
        value.0
    }
}

/// Canonical ASCII package-relative path. No scheme, authority, root, traversal,
/// percent escapes, backslashes, query or fragment. The host must additionally
/// confine filesystem resolution (including symlinks) to its local asset root.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(try_from = "String", into = "String")]
#[schemars(with = "String", extend("pattern" = r"^[A-Za-z0-9_-][A-Za-z0-9._-]*(/[A-Za-z0-9_-][A-Za-z0-9._-]*)*$(?![\s\S])"))]
pub struct LocalAssetPath(String);
impl TryFrom<String> for LocalAssetPath {
    type Error = &'static str;
    fn try_from(value: String) -> Result<Self, Self::Error> {
        let valid = value.split('/').all(|part| {
            part.bytes()
                .next()
                .is_some_and(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
                && part
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
        });
        if valid {
            Ok(Self(value))
        } else {
            Err("expected canonical package-relative asset path")
        }
    }
}
impl From<LocalAssetPath> for String {
    fn from(value: LocalAssetPath) -> Self {
        value.0
    }
}

fn nonempty<'de, D, T>(d: D) -> Result<Vec<T>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    let values = Vec::<T>::deserialize(d)?;
    if values.is_empty() {
        Err(serde::de::Error::custom("expected nonempty list"))
    } else {
        Ok(values)
    }
}
