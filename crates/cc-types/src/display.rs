//! Shared on-stream presentation only; no room state or rendering authority.
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// Reuses the rooms' existing S/M/L, corner/center, ink and demo-style values.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Display {
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::present"
    )]
    #[schemars(with = "DisplaySize")]
    pub size: Option<DisplaySize>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::present"
    )]
    #[schemars(with = "DisplayAnchor")]
    pub anchor: Option<DisplayAnchor>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::present"
    )]
    #[schemars(with = "ColourToken")]
    pub colour_token: Option<ColourToken>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::present"
    )]
    #[schemars(with = "ArtStyle")]
    pub art_style: Option<ArtStyle>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::present"
    )]
    #[schemars(with = "DisplayTimingMs")]
    pub timing_ms: Option<DisplayTimingMs>,
}

// Serde's derived struct parser also accepts positional sequences (even []
// when every field is optional). Require a JSON object, exactly as the schema
// does, while retaining duplicate-field and unknown-field rejection.
impl<'de> Deserialize<'de> for Display {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        #[derive(Deserialize)]
        #[serde(deny_unknown_fields)]
        struct Fields {
            #[serde(default, deserialize_with = "crate::present")]
            size: Option<DisplaySize>,
            #[serde(default, deserialize_with = "crate::present")]
            anchor: Option<DisplayAnchor>,
            #[serde(default, deserialize_with = "crate::present")]
            colour_token: Option<ColourToken>,
            #[serde(default, deserialize_with = "crate::present")]
            art_style: Option<ArtStyle>,
            #[serde(default, deserialize_with = "crate::present")]
            timing_ms: Option<DisplayTimingMs>,
        }
        struct Object;
        impl<'de> serde::de::Visitor<'de> for Object {
            type Value = Display;
            fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
                f.write_str("a display object")
            }
            fn visit_map<M: serde::de::MapAccess<'de>>(self, map: M) -> Result<Display, M::Error> {
                let f = Fields::deserialize(serde::de::value::MapAccessDeserializer::new(map))?;
                Ok(Display {
                    size: f.size,
                    anchor: f.anchor,
                    colour_token: f.colour_token,
                    art_style: f.art_style,
                    timing_ms: f.timing_ms,
                })
            }
        }
        d.deserialize_map(Object)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum DisplaySize {
    S,
    M,
    L,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum DisplayAnchor {
    TopLeft,
    TopRight,
    Center,
    BottomLeft,
    BottomRight,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ColourToken {
    Gules,
    Azure,
    Or,
    Key,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ArtStyle {
    Heraldic,
    Pixel,
    Synthwave,
    Watercolor,
    Anime,
    Glass,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(try_from = "u32", into = "u32")]
#[schemars(with = "u32", extend("minimum" = 1, "maximum" = 60000))]
pub struct DisplayTimingMs(u32);
impl TryFrom<u32> for DisplayTimingMs {
    type Error = &'static str;
    fn try_from(value: u32) -> Result<Self, Self::Error> {
        if (1..=60_000).contains(&value) {
            Ok(Self(value))
        } else {
            Err("expected timing_ms in 1..=60000")
        }
    }
}
impl From<DisplayTimingMs> for u32 {
    fn from(value: DisplayTimingMs) -> Self {
        value.0
    }
}
