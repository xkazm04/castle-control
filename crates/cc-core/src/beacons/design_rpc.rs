//! `beacons.design.create` and `beacons.library.import`, plus the native
//! handoff that publishes a design's verified package to the overlay host.
use super::design_package::{self, Layers};
use super::designs::{DesignOrigin, DesignRecord};
use super::library::{self, EffectBlend};
use super::{BeaconsModule, internal};
use cc_beacons::art::{anchors, raster};
use cc_types::{
    ArtAnchors, ArtAssetKind, DesignCreateParams, DesignCreateResult, DesignId, ErrorCode,
    ErrorEnvelope, LibraryImportParams, LibraryImportResult, LocalAssetPath,
};

fn record(kind: ArtAssetKind, origin: DesignOrigin) -> DesignRecord {
    DesignRecord {
        kind,
        origin,
        package: None,
        anchors: ArtAnchors::default(),
        base: None,
        token: None,
    }
}

fn analysis(error: cc_beacons::art::ArtError) -> ErrorEnvelope {
    ErrorEnvelope::new(ErrorCode::Invalid, format!("art analysis refused: {error}"))
}

impl BeaconsModule {
    /// A new writable design root, persisted, and (natively) accepted by the
    /// art catalog: the production caller of `ArtCatalog::accept_design`.
    pub(super) fn create_design(
        &self,
        params: &DesignCreateParams,
    ) -> Result<DesignCreateResult, ErrorEnvelope> {
        let id = DesignId::try_from(format!(
            "custom-{}",
            ulid::Ulid::new().to_string().to_lowercase()
        ))
        .map_err(|_| internal())?;
        self.designs
            .insert(&id, record(params.kind, DesignOrigin::Custom {}))?;
        if let Some(art) = &self.art {
            art.catalog
                .accept_design(id.clone(), &self.designs.dir(&id))?;
        }
        Ok(DesignCreateResult { design_id: id })
    }

    /// Import a built-in library asset as a read-only design. Idempotent:
    /// importing the same asset again returns the same design.
    pub(super) fn import_library(
        &self,
        params: &LibraryImportParams,
    ) -> Result<LibraryImportResult, ErrorEnvelope> {
        let entry = library::entry(&params.library_id, params.kind)?;
        let id = DesignId::try_from(format!("library-{}", entry.id.as_str()))
            .map_err(|_| ErrorEnvelope::new(ErrorCode::Invalid, "library id is not a design id"))?;
        let origin = DesignOrigin::Library {
            library_id: entry.id.clone(),
        };
        if !self.designs.insert(&id, record(params.kind, origin))? {
            let existing = self.designs.record(&id)?;
            if existing.kind != params.kind {
                return Err(internal());
            }
            if existing.package.is_some() {
                return Ok(LibraryImportResult { design_id: id });
            }
        }
        let base_bytes = library::bytes(&entry.file)?;
        let base = self.library_file(&id, "base.webp", base_bytes)?;
        let effect = entry
            .effect
            .as_ref()
            .map(|file| self.library_file(&id, "effect.webp", library::bytes(file)?))
            .transpose()?;
        let token = match &entry.token {
            Some(file) => {
                let bytes = library::bytes(file)?;
                let image = raster::decode(bytes).map_err(analysis)?;
                Some((
                    self.library_file(&id, "token.webp", bytes)?,
                    image.width,
                    image.height,
                ))
            }
            None => None,
        };
        // Catalogued anchors win; anything a surface needs but the catalog
        // lacks is measured from the embedded image (vessels: v1 heuristic).
        let anchors = match (&entry.anchors, params.kind) {
            (Some(anchors), _) => anchors.clone(),
            (None, ArtAssetKind::Beacon) => ArtAnchors::default(),
            (None, kind) => {
                let image = raster::decode(base_bytes).map_err(analysis)?;
                match kind {
                    ArtAssetKind::VoteBar => anchors::vote_bar(&image),
                    ArtAssetKind::Frame => anchors::frame(&image),
                    _ => anchors::draw_vessel(&image),
                }
                .map_err(analysis)?
            }
        };
        let package = design_package::build(
            &id,
            &Layers {
                kind: params.kind,
                width: entry.width,
                height: entry.height,
                base: &base,
                effect: effect.as_ref(),
                effect_behind: entry.effect_blend == Some(EffectBlend::Behind),
                token: token.as_ref().map(|(path, w, h)| (path, *w, *h)),
                anchors: &anchors,
            },
        )?;
        self.designs
            .set_layers(&id, package, anchors, base, token.map(|(path, _, _)| path))?;
        Ok(LibraryImportResult { design_id: id })
    }

    /// Write a library file, accepting an identical file left by an
    /// interrupted earlier import.
    fn library_file(
        &self,
        id: &DesignId,
        name: &str,
        bytes: &[u8],
    ) -> Result<LocalAssetPath, ErrorEnvelope> {
        let path = LocalAssetPath::try_from(name.to_owned()).map_err(|_| internal())?;
        match self.designs.read_asset(id, &path) {
            Ok(existing) if existing == bytes => Ok(path),
            Ok(_) => Err(internal()),
            Err(error) if error.code == ErrorCode::NotFound => {
                self.designs.write_asset(id, name.to_owned(), bytes)
            }
            Err(error) => Err(error),
        }
    }

    /// Native only: install a preset or a stored design's verified package in
    /// the overlay host so visuals naming it render. Unknown ids stay withheld.
    pub(super) fn publish_design(
        &self,
        native: &crate::NativeServices,
        id: Option<&DesignId>,
    ) -> Result<(), ErrorEnvelope> {
        native.ensure_beacons_preset(id)?;
        if let Some(id) = id
            && let Some(verified) = self.designs.verified(id)?
        {
            native.accept_design_package(verified.as_ref().clone())?;
        }
        Ok(())
    }
}
