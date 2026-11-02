//! Custom design vocabulary: asset kinds, providers, normalised anchors and the
//! same-origin art references that overlay snapshots carry. Data only.
use crate::{DesignContentHash, Intensity, LocalAssetPath};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// The four V1 custom design surfaces.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ArtAssetKind {
    Beacon,
    Frame,
    VoteBar,
    DrawVessel,
}

/// Image provider; an omitted provider on generation means Leonardo.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ArtProvider {
    Leonardo,
    Openai,
}

/// Local key presence for one provider; never key material or a keychain label.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ArtProviderStatus {
    pub provider: ArtProvider,
    pub available: bool,
}

/// Requested output background; OpenAI only.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ArtBackground {
    Transparent,
    Opaque,
}

/// A raw `#rrggbb` colour; case is preserved as given.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(try_from = "String", into = "String")]
#[schemars(with = "String", extend("pattern" = r"^#[0-9a-fA-F]{6}$(?![\s\S])"))]
pub struct HexColor(String);
impl TryFrom<String> for HexColor {
    type Error = &'static str;
    fn try_from(value: String) -> Result<Self, Self::Error> {
        match value.strip_prefix('#') {
            Some(hex) if hex.len() == 6 && hex.bytes().all(|b| b.is_ascii_hexdigit()) => {
                Ok(Self(value))
            }
            _ => Err("expected #rrggbb colour"),
        }
    }
}
impl From<HexColor> for String {
    fn from(value: HexColor) -> Self {
        value.0
    }
}

/// Rectangle normalised to the image, each number a fraction in 0..1.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ArtRect {
    pub x: Intensity,
    pub y: Intensity,
    pub w: Intensity,
    pub h: Intensity,
}

/// Point normalised to the image, each number a fraction in 0..1.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ArtPoint {
    pub x: Intensity,
    pub y: Intensity,
}

/// Measured anchors; which keys are present depends on the asset kind.
#[derive(Debug, Clone, PartialEq, Default, Serialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ArtAnchors {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "ArtRect")]
    pub core_rect: Option<ArtRect>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "ArtRect")]
    pub window_rect: Option<ArtRect>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "ArtRect")]
    pub track_rect: Option<ArtRect>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "Intensity")]
    pub track_radius: Option<Intensity>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "ArtRect")]
    pub chamber_rect: Option<ArtRect>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "ArtPoint")]
    pub mouth: Option<ArtPoint>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "[HexColor; 3]")]
    pub segments: Option<[HexColor; 3]>,
}
impl<'de> Deserialize<'de> for ArtAnchors {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        #[derive(Deserialize)]
        #[serde(deny_unknown_fields)]
        struct Fields {
            #[serde(default, deserialize_with = "crate::present")]
            core_rect: Option<ArtRect>,
            #[serde(default, deserialize_with = "crate::present")]
            window_rect: Option<ArtRect>,
            #[serde(default, deserialize_with = "crate::present")]
            track_rect: Option<ArtRect>,
            #[serde(default, deserialize_with = "crate::present")]
            track_radius: Option<Intensity>,
            #[serde(default, deserialize_with = "crate::present")]
            chamber_rect: Option<ArtRect>,
            #[serde(default, deserialize_with = "crate::present")]
            mouth: Option<ArtPoint>,
            #[serde(default, deserialize_with = "crate::present")]
            segments: Option<[HexColor; 3]>,
        }
        let f: Fields = crate::object(d)?;
        Ok(Self {
            core_rect: f.core_rect,
            window_rect: f.window_rect,
            track_rect: f.track_rect,
            track_radius: f.track_radius,
            chamber_rect: f.chamber_rect,
            mouth: f.mouth,
            segments: f.segments,
        })
    }
}

/// Same-origin overlay asset path `/assets/<slug>/<content hash>/<asset path>`,
/// matching the overlay host's asset route. Never a scheme, host or query.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(try_from = "String", into = "String")]
#[schemars(
    with = "String",
    extend("pattern" = r"^/assets/[a-z0-9]+(-[a-z0-9]+)*/[0-9a-f]{64}/[A-Za-z0-9_-][A-Za-z0-9._-]*(/[A-Za-z0-9_-][A-Za-z0-9._-]*)*$(?![\s\S])")
)]
pub struct OverlayAssetUrl(String);
impl TryFrom<String> for OverlayAssetUrl {
    type Error = &'static str;
    fn try_from(value: String) -> Result<Self, Self::Error> {
        let mut parts = value
            .strip_prefix("/assets/")
            .map(|rest| rest.splitn(3, '/'))
            .into_iter()
            .flatten();
        let (Some(owner), Some(hash), Some(path)) = (parts.next(), parts.next(), parts.next())
        else {
            return Err("expected same-origin /assets/ path");
        };
        let owner = !owner.is_empty()
            && owner.split('-').all(|part| {
                !part.is_empty()
                    && part
                        .bytes()
                        .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit())
            });
        if owner
            && DesignContentHash::try_from(hash.to_owned()).is_ok()
            && LocalAssetPath::try_from(path.to_owned()).is_ok()
        {
            Ok(Self(value))
        } else {
            Err("expected same-origin /assets/ path")
        }
    }
}
impl From<OverlayAssetUrl> for String {
    fn from(value: OverlayAssetUrl) -> Self {
        value.0
    }
}

/// Vote bar housing art; the renderer clips the three segments to the track.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct VoteBarArt {
    pub asset_url: OverlayAssetUrl,
    pub track_rect: ArtRect,
    pub track_radius: Intensity,
    pub segments: [HexColor; 3],
}

/// Lots plate image vessel; the entry token sprite is optional.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct VesselArt {
    pub asset_url: OverlayAssetUrl,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::present"
    )]
    #[schemars(with = "OverlayAssetUrl")]
    pub token_url: Option<OverlayAssetUrl>,
    pub chamber_rect: ArtRect,
    pub mouth: ArtPoint,
}

/// Plate render data beside the seal and cast; absent vessel keeps `art_style`.
#[derive(Debug, Clone, PartialEq, Default, Serialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct LotsPlateSnapshot {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "VesselArt")]
    pub vessel: Option<VesselArt>,
}
impl<'de> Deserialize<'de> for LotsPlateSnapshot {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        #[derive(Deserialize)]
        #[serde(deny_unknown_fields)]
        struct Fields {
            #[serde(default, deserialize_with = "crate::present")]
            vessel: Option<VesselArt>,
        }
        let f: Fields = crate::object(d)?;
        Ok(Self { vessel: f.vessel })
    }
}
