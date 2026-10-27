//! WP 3.4 wire boundary. Provider URLs and keychain labels stay behind the host.
use crate::{ArtCallId, DesignId, LocalAssetPath};
use schemars::{JsonSchema, Schema};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ArtStatusResult {
    /// Local key presence only. Keychain failure is an error, not unavailable.
    pub available: bool,
}

/// An absent reference generates one anchor. A reference selects an imported
/// generated image in this design; the host resolves its original provider ID.
/// Neither the caller nor the result can supply a provider URL or public flag.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(try_from = "ArtGenerateFields")]
#[schemars(with = "ArtGenerateFields", transform = generation_schema)]
pub struct ArtGenerateParams {
    pub design_id: DesignId,
    pub prompt: String,
    pub model_id: ArtModelId,
    pub width: ArtDimension,
    pub height: ArtDimension,
    pub quantity: ArtQuantity,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reference: Option<LocalAssetPath>,
    pub remove_background: bool,
}

#[derive(Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct ArtGenerateFields {
    design_id: DesignId,
    // Use Rust's Unicode whitespace set, as LotsKeyword does, rather than JS \S.
    #[schemars(length(max = 1500), extend("pattern" = r"[^\u0009-\u000D\u0020\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]"))]
    prompt: String,
    model_id: ArtModelId,
    width: ArtDimension,
    height: ArtDimension,
    quantity: ArtQuantity,
    #[serde(default, deserialize_with = "crate::present")]
    #[schemars(with = "LocalAssetPath")]
    reference: Option<LocalAssetPath>,
    remove_background: bool,
}
impl TryFrom<ArtGenerateFields> for ArtGenerateParams {
    type Error = &'static str;
    fn try_from(value: ArtGenerateFields) -> Result<Self, Self::Error> {
        if value.prompt.trim().is_empty() || value.prompt.chars().count() > 1500 {
            return Err("expected nonblank prompt of at most 1500 characters");
        }
        if value.reference.is_none() && u8::from(value.quantity.clone()) != 1 {
            return Err("anchor generation requires exactly one image");
        }
        Ok(Self {
            design_id: value.design_id,
            prompt: value.prompt,
            model_id: value.model_id,
            width: value.width,
            height: value.height,
            quantity: value.quantity,
            reference: value.reference,
            remove_background: value.remove_background,
        })
    }
}
fn generation_schema(schema: &mut Schema) {
    schema.insert(
        "allOf".into(),
        serde_json::json!([{
            "if":{"properties":{"reference":true},"required":["reference"]},
            "else":{"properties":{"quantity":{"const":1}}}
        }]),
    );
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ArtGenerateResult {
    pub design_id: DesignId,
    /// Only successfully imported package assets. Moderated output may be empty.
    #[serde(deserialize_with = "assets")]
    #[schemars(length(max = 8))]
    pub assets: Vec<GeneratedArtAsset>,
    /// One receipt per paid call, including each background-removal call.
    /// Empty output never discards the original submission receipt.
    #[serde(deserialize_with = "costs")]
    #[schemars(length(min = 1))]
    pub costs: Vec<ArtCostReceipt>,
}

/// An imported asset-list entry. Hosts retain these labels beside the local
/// path; a generated file is never presented as a manually supplied asset.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct GeneratedArtAsset {
    pub asset: LocalAssetPath,
    #[serde(deserialize_with = "generated")]
    #[schemars(extend("const" = true))]
    pub generated: bool,
    pub provenance: ArtProvenance,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ArtProvenance {
    LeonardoGenerated,
    LeonardoBackgroundRemoved,
}

/// Matches cc-beacons::art::CostRecord without importing the provider crate.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ArtCostReceipt {
    pub call_id: ArtCallId,
    pub model: ArtModelId,
    pub charge: ArtCharge,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case", deny_unknown_fields)]
pub enum ArtCharge {
    Credits(ArtCredits),
    /// Preserve the client's integer micro-USD shape, refusing unsafe JS numbers.
    MicroUsd(
        #[serde(deserialize_with = "micro_usd")]
        #[schemars(range(max = 9_007_199_254_740_991_u64))]
        u64,
    ),
}

macro_rules! scalar {
    ($name:ident, $ty:ty, $wire:literal, $schema:meta, $check:expr) => {
        #[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
        #[serde(try_from = $wire, into = $wire)]
        #[$schema]
        pub struct $name($ty);
        impl TryFrom<$ty> for $name {
            type Error = &'static str;
            fn try_from(value: $ty) -> Result<Self, Self::Error> {
                if ($check)(&value) {
                    Ok(Self(value))
                } else {
                    Err(concat!("invalid ", stringify!($name)))
                }
            }
        }
        impl From<$name> for $ty {
            fn from(value: $name) -> Self {
                value.0
            }
        }
    };
}
scalar!(
    ArtModelId,
    String,
    "String",
    schemars(
        with = "String",
        extend("pattern" = r"^[A-Za-z0-9_-]{1,128}$(?![\s\S])")
    ),
    |v: &String| !v.is_empty()
        && v.len() <= 128
        && v.bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
);
scalar!(
    ArtCredits,
    String,
    "String",
    schemars(
        with = "String",
        extend("pattern" = r"^[0-9]{1,12}(\.[0-9]{1,6})?$(?![\s\S])")
    ),
    |v: &String| {
        let (whole, fraction) = v
            .split_once('.')
            .map_or((v.as_str(), None), |(w, f)| (w, Some(f)));
        !whole.is_empty()
            && whole.len() <= 12
            && whole.bytes().all(|b| b.is_ascii_digit())
            && fraction.is_none_or(|f| {
                !f.is_empty() && f.len() <= 6 && f.bytes().all(|b| b.is_ascii_digit())
            })
    }
);
scalar!(
    ArtDimension,
    u16,
    "u16",
    schemars(
        with = "u32",
        extend("minimum" = 32, "maximum" = 1536, "multipleOf" = 8)
    ),
    |v: &u16| (32..=1536).contains(v) && v.is_multiple_of(8)
);
scalar!(
    ArtQuantity,
    u8,
    "u8",
    schemars(with = "u8", extend("minimum" = 1, "maximum" = 8)),
    |v: &u8| (1..=8).contains(v)
);

fn generated<'de, D: serde::Deserializer<'de>>(d: D) -> Result<bool, D::Error> {
    if bool::deserialize(d)? {
        Ok(true)
    } else {
        Err(serde::de::Error::custom("expected generated asset label"))
    }
}
fn micro_usd<'de, D: serde::Deserializer<'de>>(d: D) -> Result<u64, D::Error> {
    let value = u64::deserialize(d)?;
    if value <= 9_007_199_254_740_991 {
        Ok(value)
    } else {
        Err(serde::de::Error::custom("unsafe integer micro-USD"))
    }
}
fn assets<'de, D: serde::Deserializer<'de>>(d: D) -> Result<Vec<GeneratedArtAsset>, D::Error> {
    let values = Vec::<GeneratedArtAsset>::deserialize(d)?;
    if values.len() <= 8 {
        Ok(values)
    } else {
        Err(serde::de::Error::custom(
            "expected at most eight imported assets",
        ))
    }
}
fn costs<'de, D: serde::Deserializer<'de>>(d: D) -> Result<Vec<ArtCostReceipt>, D::Error> {
    let values = Vec::<ArtCostReceipt>::deserialize(d)?;
    if values.is_empty() {
        Err(serde::de::Error::custom(
            "expected at least one cost receipt",
        ))
    } else {
        Ok(values)
    }
}
