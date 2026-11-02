//! The built-in art library, embedded at build time. library.json is parsed
//! here, once, strictly; image bytes come from the build.rs table.
use cc_types::{ArtAnchors, ArtAssetKind, ErrorCode, ErrorEnvelope, HexColor, LibraryAssetId};
use serde::Deserialize;
use std::sync::OnceLock;

include!(concat!(env!("OUT_DIR"), "/library_files.rs"));

const CATALOG: &str = include_str!("../../../../apps/desktop/public/art/library/library.json");

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum LibraryKind {
    Beacon,
    Frame,
    VoteBar,
    DrawVessel,
    /// Library-only; not a V1 custom design kind and never embedded.
    Map,
}
impl LibraryKind {
    pub(crate) fn design_kind(self) -> Option<ArtAssetKind> {
        match self {
            Self::Beacon => Some(ArtAssetKind::Beacon),
            Self::Frame => Some(ArtAssetKind::Frame),
            Self::VoteBar => Some(ArtAssetKind::VoteBar),
            Self::DrawVessel => Some(ArtAssetKind::DrawVessel),
            Self::Map => None,
        }
    }
}

/// How the effect sprite composites: over the body (`screen`) or under it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum EffectBlend {
    Screen,
    Behind,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct Catalog {
    version: u32,
    #[allow(dead_code)]
    simulated_note: String,
    assets: Vec<Entry>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
#[allow(dead_code)]
pub(crate) struct Entry {
    pub id: LibraryAssetId,
    pub kind: LibraryKind,
    pub file: String,
    pub width: u32,
    pub height: u32,
    pub style_name: String,
    pub palette: Vec<HexColor>,
    pub request: String,
    pub tags: Vec<String>,
    pub preset: bool,
    pub source: String,
    #[serde(default)]
    pub token: Option<String>,
    #[serde(default)]
    pub anchors: Option<ArtAnchors>,
    #[serde(default)]
    pub effect: Option<String>,
    #[serde(default)]
    pub effect_blend: Option<EffectBlend>,
}

fn catalog() -> Result<&'static [Entry], ErrorEnvelope> {
    static PARSED: OnceLock<Option<Vec<Entry>>> = OnceLock::new();
    PARSED
        .get_or_init(|| {
            serde_json::from_str::<Catalog>(CATALOG)
                .ok()
                .filter(|catalog| catalog.version == 1)
                .map(|catalog| catalog.assets)
        })
        .as_deref()
        .ok_or_else(|| ErrorEnvelope::new(ErrorCode::Internal, "art library catalog is invalid"))
}

/// The entry for `id` when it is a V1 kind; Invalid on a kind mismatch.
pub(crate) fn entry(
    id: &LibraryAssetId,
    kind: ArtAssetKind,
) -> Result<&'static Entry, ErrorEnvelope> {
    let entry = catalog()?
        .iter()
        .find(|entry| &entry.id == id)
        .ok_or_else(|| ErrorEnvelope::new(ErrorCode::NotFound, "library asset not found"))?;
    if entry.kind.design_kind() != Some(kind) {
        return Err(ErrorEnvelope::new(
            ErrorCode::Invalid,
            "library asset is a different kind",
        ));
    }
    Ok(entry)
}

/// Embedded bytes of a catalog path such as `library/beacon/beacon-01.webp`.
pub(crate) fn bytes(file: &str) -> Result<&'static [u8], ErrorEnvelope> {
    LIBRARY_FILES
        .binary_search_by(|(path, _)| (*path).cmp(file))
        .map(|index| LIBRARY_FILES[index].1)
        .map_err(|_| ErrorEnvelope::new(ErrorCode::Internal, "art library file is missing"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeSet;

    #[test]
    fn every_v1_entry_resolves_its_files_and_required_anchors() {
        let mut referenced = BTreeSet::new();
        let mut v1 = 0;
        for entry in catalog().unwrap() {
            let Some(kind) = entry.kind.design_kind() else {
                assert!(bytes(&entry.file).is_err(), "maps are not embedded");
                continue;
            };
            v1 += 1;
            for file in [
                Some(&entry.file),
                entry.effect.as_ref(),
                entry.token.as_ref(),
            ]
            .into_iter()
            .flatten()
            {
                assert!(bytes(file).unwrap().starts_with(b"RIFF"), "{file}");
                referenced.insert(file.as_str());
            }
            let anchors = entry.anchors.clone().unwrap_or_default();
            match kind {
                ArtAssetKind::VoteBar => assert!(
                    anchors.track_rect.is_some()
                        && anchors.track_radius.is_some()
                        && anchors.segments.is_some(),
                    "{:?}",
                    entry.id
                ),
                ArtAssetKind::Frame => assert!(anchors.window_rect.is_some()),
                ArtAssetKind::Beacon => {
                    assert_eq!(entry.effect.is_some(), anchors.core_rect.is_some())
                }
                ArtAssetKind::DrawVessel => {}
            }
        }
        assert_eq!(v1, 80);
        // The embedded table is exactly the referenced V1 files, sorted.
        let table: BTreeSet<_> = LIBRARY_FILES.iter().map(|(path, _)| *path).collect();
        assert_eq!(table, referenced);
        assert!(LIBRARY_FILES.windows(2).all(|w| w[0].0 < w[1].0));
    }

    #[test]
    fn unknown_ids_and_kind_mismatches_are_refused() {
        let id = |v: &str| LibraryAssetId::try_from(v.to_owned()).unwrap();
        assert_eq!(
            entry(&id("simulated-missing"), ArtAssetKind::Beacon)
                .unwrap_err()
                .code,
            ErrorCode::NotFound
        );
        assert_eq!(
            entry(&id("frame-01"), ArtAssetKind::Beacon)
                .unwrap_err()
                .code,
            ErrorCode::Invalid
        );
        assert_eq!(
            entry(&id("map-02"), ArtAssetKind::Frame).unwrap_err().code,
            ErrorCode::Invalid
        );
        assert!(entry(&id("frame-01"), ArtAssetKind::Frame).is_ok());
    }
}
