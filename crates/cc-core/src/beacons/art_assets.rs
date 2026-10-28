//! Native-only design custody. Generated references are session-owned, like
//! accepted render packages; reopening a package does not trust loose files.
use super::internal;
use cc_beacons::art::{ImageAsset, Provenance};
use cc_types::{
    ArtProvenance, DesignId, ErrorCode, ErrorEnvelope, GeneratedArtAsset, LocalAssetPath,
};
use std::{
    collections::BTreeMap,
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
};

#[async_trait::async_trait]
pub trait ArtDownload: Send + Sync {
    async fn fetch(&self, url: &str) -> Result<Vec<u8>, ErrorEnvelope>;
}

pub(crate) struct LeonardoDownload;
#[async_trait::async_trait]
impl ArtDownload for LeonardoDownload {
    async fn fetch(&self, url: &str) -> Result<Vec<u8>, ErrorEnvelope> {
        let url = reqwest::Url::parse(url).map_err(|_| refused())?;
        // Asset downloads never carry the API key, follow redirects, or access
        // arbitrary response-controlled hosts (including local services).
        if url.scheme() != "https"
            || url.host_str() != Some("cdn.leonardo.ai")
            || url.port_or_known_default() != Some(443)
            || !url.username().is_empty()
            || url.password().is_some()
        {
            return Err(refused());
        }
        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(std::time::Duration::from_secs(20))
            .build()
            .map_err(|_| refused())?;
        let mut response = client.get(url).send().await.map_err(|_| refused())?;
        if !response.status().is_success() {
            return Err(refused());
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|_| refused())? {
            if bytes.len() + chunk.len() > crate::overlay::package::MAX_BYTES {
                return Err(refused());
            }
            bytes.extend_from_slice(&chunk);
        }
        Ok(bytes)
    }
}

#[derive(Default)]
pub struct ArtCatalog(Mutex<BTreeMap<DesignId, DesignAssets>>);
struct DesignAssets {
    root: PathBuf,
    generated: BTreeMap<String, ImageAsset>,
}

impl ArtCatalog {
    /// Trusted native handoff only, after package verification/consent. An RPC
    /// can select a design ID but can never choose a filesystem root.
    pub fn accept_design(&self, id: DesignId, root: &Path) -> Result<(), ErrorEnvelope> {
        let root = std::fs::canonicalize(root).map_err(|_| refused())?;
        if !root.is_dir() {
            return Err(refused());
        }
        let mut designs = self.0.lock().map_err(|_| internal())?;
        if !designs.contains_key(&id) && designs.len() >= 16 {
            return Err(refused());
        }
        if designs.get(&id).is_some_and(|design| design.root == root) {
            return Ok(());
        }
        designs.insert(
            id,
            DesignAssets {
                root,
                generated: BTreeMap::new(),
            },
        );
        Ok(())
    }

    pub(super) fn selection(
        &self,
        id: &DesignId,
        reference: Option<&LocalAssetPath>,
    ) -> Result<(PathBuf, Option<ImageAsset>), ErrorEnvelope> {
        let designs = self.0.lock().map_err(|_| internal())?;
        let design = designs.get(id).ok_or_else(|| {
            ErrorEnvelope::new(ErrorCode::NotFound, "art design has not been imported")
        })?;
        if design.generated.len() + 8 > crate::overlay::package::MAX_ASSETS {
            return Err(refused());
        }
        let anchor = reference
            .map(|path| {
                let path = String::from(path.clone());
                let image = design.generated.get(&path).ok_or_else(refused)?;
                let file = std::fs::canonicalize(design.root.join(path)).map_err(|_| refused())?;
                if !file.starts_with(&design.root) || !file.is_file() {
                    return Err(refused());
                }
                Ok(image.clone())
            })
            .transpose()?;
        Ok((design.root.clone(), anchor))
    }

    pub(super) fn import(
        &self,
        id: &DesignId,
        root: &Path,
        name: String,
        image: ImageAsset,
        bytes: Vec<u8>,
    ) -> Result<GeneratedArtAsset, ErrorEnvelope> {
        if !image.generated
            || image.provenance != Provenance::LeonardoGenerated
            || image.image_id.is_none()
            || bytes.len() > crate::overlay::package::MAX_BYTES
        {
            return Err(refused());
        }
        let extension = if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
            "png"
        } else if bytes.starts_with(b"\xff\xd8\xff") {
            "jpg"
        } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
            "gif"
        } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
            "webp"
        } else {
            return Err(refused());
        };
        let path = format!("generated-{name}.{extension}");
        let asset: LocalAssetPath = path.clone().try_into().map_err(|_| refused())?;
        let mut designs = self.0.lock().map_err(|_| internal())?;
        let design = designs.get_mut(id).ok_or_else(refused)?;
        if design.root != root || std::fs::canonicalize(root).map_err(|_| refused())? != root {
            return Err(refused());
        }
        // Unique direct child + no-clobber persist: no caller path or symlink
        // is opened for writing, and existing package files cannot be replaced.
        let mut file = tempfile::NamedTempFile::new_in(root).map_err(|_| refused())?;
        file.write_all(&bytes).map_err(|_| refused())?;
        file.as_file().sync_all().map_err(|_| refused())?;
        file.persist_noclobber(root.join(&path))
            .map_err(|_| refused())?;
        design.generated.insert(path, image);
        Ok(GeneratedArtAsset {
            asset,
            generated: true,
            provenance: ArtProvenance::LeonardoGenerated,
        })
    }
}

fn refused() -> ErrorEnvelope {
    ErrorEnvelope::new(
        ErrorCode::Invalid,
        "generated art asset or reference refused",
    )
}
