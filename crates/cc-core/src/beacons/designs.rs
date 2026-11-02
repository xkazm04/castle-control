//! Persisted custom and library designs: one directory per design under
//! `<beacons root>/designs/<design id>/` holding `design.json` and its asset
//! files, plus the vote bar selection in `designs/vote-bar.json`. Records
//! are parsed here only; packages are re-verified (hash and bytes) on read.
use super::internal;
use crate::overlay::package::{Asset, VerifiedPackage, package_hash};
use cc_types::{
    ArtAnchors, ArtAssetKind, DesignId, DesignPackage, ErrorCode, ErrorEnvelope, LibraryAssetId,
    LocalAssetPath, OverlayAssetUrl, VesselArt, VoteBarArt,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

/// Designs kept on disk. There is no delete method yet, so this is generous.
const MAX_DESIGNS: usize = 256;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub(crate) enum DesignOrigin {
    /// Writable: created by `beacons.design.create`; art may be generated here.
    Custom {},
    /// Read-only import of a built-in library asset.
    Library { library_id: LibraryAssetId },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct DesignRecord {
    pub kind: ArtAssetKind,
    pub origin: DesignOrigin,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub package: Option<DesignPackage>,
    #[serde(default)]
    pub anchors: ArtAnchors,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base: Option<LocalAssetPath>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub token: Option<LocalAssetPath>,
}

#[derive(Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct VoteBarSelection {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    design_id: Option<DesignId>,
}

#[derive(Default)]
struct Inner {
    records: BTreeMap<DesignId, DesignRecord>,
    vote_bar: Option<DesignId>,
    verified: BTreeMap<DesignId, Arc<VerifiedPackage>>,
}

pub(crate) struct DesignStore {
    root: PathBuf,
    inner: Mutex<Inner>,
}

fn not_found() -> ErrorEnvelope {
    ErrorEnvelope::new(ErrorCode::NotFound, "design not found")
}
fn refused(message: &'static str) -> ErrorEnvelope {
    ErrorEnvelope::new(ErrorCode::Invalid, message)
}

fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), ErrorEnvelope> {
    let dir = path.parent().ok_or_else(internal)?;
    let mut file = tempfile::NamedTempFile::new_in(dir).map_err(|_| internal())?;
    file.write_all(bytes).map_err(|_| internal())?;
    file.as_file().sync_all().map_err(|_| internal())?;
    file.persist(path).map_err(|_| internal())?;
    Ok(())
}

impl DesignStore {
    pub(crate) fn open(root: PathBuf) -> Result<Self, ErrorEnvelope> {
        fs::create_dir_all(&root).map_err(|_| internal())?;
        let root = fs::canonicalize(root).map_err(|_| internal())?;
        let mut inner = Inner::default();
        for entry in fs::read_dir(&root).map_err(|_| internal())? {
            let path = entry.map_err(|_| internal())?.path();
            if !path.is_dir() {
                continue;
            }
            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .ok_or_else(internal)?;
            let id = DesignId::try_from(name.to_owned()).map_err(|_| internal())?;
            match fs::read(path.join("design.json")) {
                Ok(bytes) => {
                    let record: DesignRecord =
                        serde_json::from_slice(&bytes).map_err(|_| internal())?;
                    inner.records.insert(id, record);
                }
                // A crash between mkdir and the first record leaves an empty
                // directory: it was never returned to a caller, so skip it.
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(_) => return Err(internal()),
            }
        }
        match fs::read(root.join("vote-bar.json")) {
            Ok(bytes) => {
                let selection: VoteBarSelection =
                    serde_json::from_slice(&bytes).map_err(|_| internal())?;
                inner.vote_bar = selection.design_id;
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => return Err(internal()),
        }
        Ok(Self {
            root,
            inner: Mutex::new(inner),
        })
    }

    pub(crate) fn dir(&self, id: &DesignId) -> PathBuf {
        self.root.join(id.as_str())
    }

    pub(crate) fn record(&self, id: &DesignId) -> Result<DesignRecord, ErrorEnvelope> {
        let inner = self.inner.lock().map_err(|_| internal())?;
        inner.records.get(id).cloned().ok_or_else(not_found)
    }

    /// Create (or, for an existing id, return) a design directory and record.
    pub(crate) fn insert(
        &self,
        id: &DesignId,
        record: DesignRecord,
    ) -> Result<bool, ErrorEnvelope> {
        let mut inner = self.inner.lock().map_err(|_| internal())?;
        if inner.records.contains_key(id) {
            return Ok(false);
        }
        if inner.records.len() >= MAX_DESIGNS {
            return Err(ErrorEnvelope::new(
                ErrorCode::Conflict,
                "design limit reached",
            ));
        }
        fs::create_dir_all(self.dir(id)).map_err(|_| internal())?;
        self.persist(id, &record)?;
        inner.records.insert(id.clone(), record);
        Ok(true)
    }

    fn persist(&self, id: &DesignId, record: &DesignRecord) -> Result<(), ErrorEnvelope> {
        let bytes = serde_json::to_vec(record).map_err(|_| internal())?;
        write_atomic(&self.dir(id).join("design.json"), &bytes)
    }

    /// Write a new asset file into the design; never replaces an existing file.
    pub(crate) fn write_asset(
        &self,
        id: &DesignId,
        name: String,
        bytes: &[u8],
    ) -> Result<LocalAssetPath, ErrorEnvelope> {
        let asset = LocalAssetPath::try_from(name.clone()).map_err(|_| internal())?;
        if name.contains('/')
            || name == "design.json"
            || bytes.len() > crate::overlay::package::MAX_BYTES
        {
            return Err(refused("design asset refused"));
        }
        let _inner = self.inner.lock().map_err(|_| internal())?;
        let dir = self.dir(id);
        let mut file = tempfile::NamedTempFile::new_in(&dir).map_err(|_| internal())?;
        file.write_all(bytes).map_err(|_| internal())?;
        file.as_file().sync_all().map_err(|_| internal())?;
        file.persist_noclobber(dir.join(&name))
            .map_err(|_| refused("design asset already exists"))?;
        Ok(asset)
    }

    /// Bytes of a file inside the design, refusing anything that resolves out.
    pub(crate) fn read_asset(
        &self,
        id: &DesignId,
        asset: &LocalAssetPath,
    ) -> Result<Vec<u8>, ErrorEnvelope> {
        let dir = fs::canonicalize(self.dir(id)).map_err(|_| not_found())?;
        let path = fs::canonicalize(dir.join(String::from(asset.clone())))
            .map_err(|_| ErrorEnvelope::new(ErrorCode::NotFound, "design asset not found"))?;
        if !path.starts_with(&dir) || !path.is_file() || path.ends_with("design.json") {
            return Err(refused("design asset refused"));
        }
        let mut bytes = Vec::new();
        let limit = crate::overlay::package::MAX_BYTES;
        fs::File::open(&path)
            .map_err(|_| internal())?
            .take(limit as u64 + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| internal())?;
        if bytes.len() > limit {
            return Err(refused("design asset is too large"));
        }
        Ok(bytes)
    }

    /// Seal `package` over the design's files, verify it, and persist it with
    /// its anchors. Returns the sealed package.
    pub(crate) fn set_layers(
        &self,
        id: &DesignId,
        mut package: DesignPackage,
        anchors: ArtAnchors,
        base: LocalAssetPath,
        token: Option<LocalAssetPath>,
    ) -> Result<DesignPackage, ErrorEnvelope> {
        let mut assets = BTreeMap::new();
        for layer in &package.layers {
            let cc_types::DesignLayer::Image { asset, .. } = layer else {
                return Err(internal());
            };
            let bytes = self.read_asset(id, asset)?;
            let mime = if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
                "image/png"
            } else {
                "image/webp"
            };
            assets.insert(
                String::from(asset.clone()),
                Asset {
                    bytes: bytes.into(),
                    mime,
                },
            );
        }
        package.content_hash = package_hash(&package, &assets)?
            .try_into()
            .map_err(|_| internal())?;
        let verified = VerifiedPackage::read(package.clone(), &self.dir(id))?;
        let mut inner = self.inner.lock().map_err(|_| internal())?;
        let mut record = inner.records.get(id).cloned().ok_or_else(not_found)?;
        record.package = Some(package.clone());
        record.anchors = anchors;
        record.base = Some(base);
        record.token = token;
        self.persist(id, &record)?;
        inner.records.insert(id.clone(), record);
        inner.verified.insert(id.clone(), Arc::new(verified));
        Ok(package)
    }

    /// Verified package of a design with layers; cached until the next change.
    pub(crate) fn verified(
        &self,
        id: &DesignId,
    ) -> Result<Option<Arc<VerifiedPackage>>, ErrorEnvelope> {
        let mut inner = self.inner.lock().map_err(|_| internal())?;
        if let Some(verified) = inner.verified.get(id) {
            return Ok(Some(verified.clone()));
        }
        let Some(package) = inner.records.get(id).and_then(|r| r.package.clone()) else {
            return Ok(None);
        };
        let verified = Arc::new(VerifiedPackage::read(package, &self.dir(id))?);
        inner.verified.insert(id.clone(), verified.clone());
        Ok(Some(verified))
    }

    fn url(
        package: &DesignPackage,
        asset: &LocalAssetPath,
    ) -> Result<OverlayAssetUrl, ErrorEnvelope> {
        format!(
            "/assets/{}/{}/{}",
            package.design_id.as_str(),
            String::from(package.content_hash.clone()),
            String::from(asset.clone())
        )
        .try_into()
        .map_err(|_| internal())
    }

    /// Kind check plus the anchors the surface needs; Invalid otherwise.
    fn ready(
        &self,
        id: &DesignId,
        kind: ArtAssetKind,
    ) -> Result<(DesignRecord, DesignPackage, LocalAssetPath), ErrorEnvelope> {
        let record = self.record(id)?;
        if record.kind != kind {
            return Err(refused("design is a different kind"));
        }
        match (record.package.clone(), record.base.clone()) {
            (Some(package), Some(base)) => Ok((record, package, base)),
            _ => Err(refused("design has no layers yet")),
        }
    }

    pub(crate) fn vote_bar_art_of(&self, id: &DesignId) -> Result<VoteBarArt, ErrorEnvelope> {
        let (record, package, base) = self.ready(id, ArtAssetKind::VoteBar)?;
        let a = record.anchors;
        match (a.track_rect, a.track_radius, a.segments) {
            (Some(track_rect), Some(track_radius), Some(segments)) => Ok(VoteBarArt {
                asset_url: Self::url(&package, &base)?,
                track_rect,
                track_radius,
                segments,
            }),
            _ => Err(refused("vote bar design has no measured track")),
        }
    }

    pub(crate) fn vessel_art(&self, id: &DesignId) -> Result<VesselArt, ErrorEnvelope> {
        let (record, package, base) = self.ready(id, ArtAssetKind::DrawVessel)?;
        let token_url = record
            .token
            .as_ref()
            .map(|token| Self::url(&package, token))
            .transpose()?;
        match (record.anchors.chamber_rect, record.anchors.mouth) {
            (Some(chamber_rect), Some(mouth)) => Ok(VesselArt {
                asset_url: Self::url(&package, &base)?,
                token_url,
                chamber_rect,
                mouth,
            }),
            _ => Err(refused("vessel design has no measured chamber")),
        }
    }

    /// Persist the vote bar design (validated first); None clears it.
    pub(crate) fn set_vote_bar(&self, id: Option<DesignId>) -> Result<(), ErrorEnvelope> {
        if let Some(id) = &id {
            self.vote_bar_art_of(id)?;
        }
        let mut inner = self.inner.lock().map_err(|_| internal())?;
        let bytes = serde_json::to_vec(&VoteBarSelection {
            design_id: id.clone(),
        })
        .map_err(|_| internal())?;
        write_atomic(&self.root.join("vote-bar.json"), &bytes)?;
        inner.vote_bar = id;
        Ok(())
    }

    pub(crate) fn vote_bar(&self) -> Result<Option<DesignId>, ErrorEnvelope> {
        Ok(self.inner.lock().map_err(|_| internal())?.vote_bar.clone())
    }

    /// The selected vote bar's art; None when nothing is selected.
    pub(crate) fn vote_bar_art(&self) -> Result<Option<VoteBarArt>, ErrorEnvelope> {
        self.vote_bar()?
            .map(|id| self.vote_bar_art_of(&id))
            .transpose()
    }
}
