//! Native-only, immutable asset verification. No HTTP caller can import a package.
use cc_types::{DesignLayer, DesignPackage, DesignPrivileges, ErrorCode, ErrorEnvelope};
use std::{collections::BTreeMap, fs, io::Read, path::Path, sync::Arc};

pub const MAX_BYTES: usize = 8 * 1024 * 1024;
pub const MAX_ASSETS: usize = 128;

#[derive(Clone)]
pub struct Asset {
    pub bytes: Arc<[u8]>,
    pub mime: &'static str,
}
#[derive(Clone)]
pub struct VerifiedPackage {
    pub package: DesignPackage,
    pub assets: BTreeMap<String, Asset>,
}

/// v1 digest: domain, framed canonical metadata (without content_hash), then
/// sorted framed path/byte pairs. Frames are u64 big-endian length + raw bytes.
/// serde_json's default sorted object map provides recursive key ordering.
pub fn package_hash(
    package: &DesignPackage,
    assets: &BTreeMap<String, Asset>,
) -> Result<String, ErrorEnvelope> {
    let mut metadata = serde_json::to_value(package).map_err(|_| invalid())?;
    metadata
        .as_object_mut()
        .ok_or_else(invalid)?
        .remove("content_hash");
    let mut bytes = b"castle-control-design-v1\0".to_vec();
    fn frame(bytes: &mut Vec<u8>, value: &[u8]) {
        bytes.extend_from_slice(&(value.len() as u64).to_be_bytes());
        bytes.extend_from_slice(value);
    }
    frame(
        &mut bytes,
        &serde_json::to_vec(&metadata).map_err(|_| invalid())?,
    );
    for (path, asset) in assets {
        frame(&mut bytes, path.as_bytes());
        frame(&mut bytes, &asset.bytes);
    }
    Ok(cc_obs::content_digest(&bytes))
}

pub fn scripts(package: &DesignPackage) -> Vec<String> {
    match &package.privileges {
        Some(DesignPrivileges::Scripts { scripts }) => {
            scripts.iter().cloned().map(String::from).collect()
        }
        _ => Vec::new(),
    }
}

impl VerifiedPackage {
    pub fn read(package: DesignPackage, root: &Path) -> Result<Self, ErrorEnvelope> {
        // Re-enter the contract door even for callers constructing public Rust fields.
        let package: DesignPackage =
            serde_json::from_value(serde_json::to_value(package).map_err(|_| invalid())?)
                .map_err(|_| invalid())?;
        if package.layers.len() > MAX_ASSETS {
            return Err(invalid());
        }
        let root = fs::canonicalize(root).map_err(|_| invalid())?;
        if !root.is_dir() {
            return Err(invalid());
        }
        let mut requested = BTreeMap::new();
        for layer in &package.layers {
            match layer {
                DesignLayer::Image { asset, .. } => {
                    requested.insert(String::from(asset.clone()), false);
                }
                DesignLayer::ParticlePreset { preset, .. } if preset != "embers" => {
                    return Err(invalid());
                }
                _ => {}
            }
        }
        for script in scripts(&package) {
            if requested.insert(script, true).is_some() {
                return Err(invalid());
            }
        }
        if requested.len() > MAX_ASSETS {
            return Err(invalid());
        }
        let mut assets = BTreeMap::new();
        let mut remaining = MAX_BYTES;
        for (path, script) in requested {
            let resolved = fs::canonicalize(root.join(&path)).map_err(|_| invalid())?;
            if !resolved.starts_with(&root) || !resolved.is_file() {
                return Err(invalid());
            }
            // Capture verified bytes once. Serving never reopens a mutable filesystem path.
            let mut bytes = Vec::new();
            fs::File::open(&resolved)
                .map_err(|_| invalid())?
                .take(remaining as u64 + 1)
                .read_to_end(&mut bytes)
                .map_err(|_| invalid())?;
            if bytes.len() > remaining {
                return Err(invalid());
            }
            remaining -= bytes.len();
            let mime = if script {
                if !path.ends_with(".js") || std::str::from_utf8(&bytes).is_err() {
                    return Err(invalid());
                }
                "text/javascript; charset=utf-8"
            } else {
                image_mime(&bytes).ok_or_else(invalid)?
            };
            assets.insert(
                path,
                Asset {
                    bytes: bytes.into(),
                    mime,
                },
            );
        }
        if package_hash(&package, &assets)? != String::from(package.content_hash.clone()) {
            return Err(invalid());
        }
        Ok(Self { package, assets })
    }
}

fn image_mime(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("image/png")
    } else if bytes.starts_with(b"\xff\xd8\xff") {
        Some("image/jpeg")
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Some("image/gif")
    } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        Some("image/webp")
    } else {
        None
    }
}

pub fn invalid() -> ErrorEnvelope {
    ErrorEnvelope::new(ErrorCode::Invalid, "render package or asset refused")
}
