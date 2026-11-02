//! Stored designs by design id: the vote bar housing, Lots image vessels and
//! the desktop's living preview of a freshly layered design, all through
//! `/assets/<design id>/<package content hash>/<asset path>`.
use super::{RenderHost, package::Asset};
use cc_types::{DesignId, Display, ErrorCode, ErrorEnvelope, LotsPlateSnapshot};

impl RenderHost {
    /// An asset of a stored design whose sealed package hash matches (the
    /// package from `beacons.art.layers` or `beacons.library.import`). Only
    /// package assets are served, never loose files. None means 404.
    pub(super) fn design_asset(
        &self,
        id: &str,
        hash: &str,
        path: &str,
    ) -> Result<Option<Asset>, ErrorEnvelope> {
        let (Ok(id), Some(designs)) = (DesignId::try_from(id.to_owned()), self.designs.get())
        else {
            return Ok(None);
        };
        let Some(verified) = designs.verified(&id)? else {
            return Ok(None);
        };
        if String::from(verified.package.content_hash.clone()) != hash {
            return Ok(None);
        }
        Ok(verified.assets.get(path).cloned())
    }

    /// The plate's image vessel for a display naming an art design. Without
    /// a bound design store (fixture registries) the plate keeps `art_style`.
    pub(super) fn plate(
        &self,
        display: Option<&Display>,
    ) -> Result<LotsPlateSnapshot, ErrorEnvelope> {
        let (Some(id), Some(designs)) = (
            display.and_then(|d| d.art_design.as_ref()),
            self.designs.get(),
        ) else {
            return Ok(LotsPlateSnapshot::default());
        };
        Ok(LotsPlateSnapshot {
            vessel: Some(designs.vessel_art(id)?),
        })
    }

    /// Refuse a Lots display whose art design is not a layered draw vessel.
    pub(super) fn check_display(&self, display: &Display) -> Result<(), ErrorEnvelope> {
        match self.plate(Some(display)) {
            Ok(_) => Ok(()),
            Err(error) if error.code == ErrorCode::NotFound => Err(ErrorEnvelope::new(
                ErrorCode::Invalid,
                "display art design not found",
            )),
            Err(error) => Err(error),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Module, beacons::BeaconsModule};
    use serde_json::json;

    async fn import(module: &BeaconsModule, id: &str, kind: &str) -> DesignId {
        let request = cc_types::parse_request(
            &serde_json::to_vec(&json!({"method":"beacons.library.import",
                "params":{"library_id":id,"kind":kind}}))
            .unwrap(),
        )
        .unwrap();
        let value = module.call(&request).await.unwrap();
        serde_json::from_value(value["design_id"].clone()).unwrap()
    }

    #[tokio::test]
    async fn lots_plate_island_and_design_assets_by_design_id() {
        let root = tempfile::tempdir().unwrap();
        let module = BeaconsModule::open(root.path()).unwrap();
        let vessel = import(&module, "vessel-01", "draw_vessel").await;
        let vote_bar = import(&module, "votebar-09", "vote_bar").await;
        let frame = import(&module, "frame-01", "frame").await;
        let host = RenderHost::default();
        host.bind_designs(module.designs()).unwrap();
        let display: Display = serde_json::from_value(json!({"art_design": vessel})).unwrap();
        let draw: cc_types::DrawId = "simulated-draw".to_owned().try_into().unwrap();
        host.commit_lots_display_after(&draw, display.clone(), || Ok(()))
            .unwrap();
        let plate = host.plate(Some(&display)).unwrap();
        let art = plate.vessel.clone().unwrap();
        let url = String::from(art.asset_url.clone());
        assert!(url.starts_with("/assets/library-vessel-01/") && url.ends_with("/base.webp"));
        assert!(String::from(art.token_url.unwrap()).ends_with("/token.webp"));
        let parts: Vec<&str> = url.split('/').collect();
        let served = host.design_asset(parts[2], parts[3], "base.webp").unwrap();
        assert_eq!(served.unwrap().mime, "image/webp");
        assert!(
            host.design_asset(parts[2], &"0".repeat(64), "base.webp")
                .unwrap()
                .is_none()
        );
        // Any stored design is served under its sealed hash (desktop preview),
        // but only its package assets.
        let hash = module.designs().verified(&frame).unwrap().unwrap();
        let hash = String::from(hash.package.content_hash.clone());
        let served = |id: &str, path: &str| host.design_asset(id, &hash, path).unwrap();
        assert!(served(frame.as_str(), "base.webp").is_some());
        assert!(served(frame.as_str(), "design.json").is_none());
        assert!(
            served(vote_bar.as_str(), "base.webp").is_none(),
            "hash names the frame"
        );
        assert!(served("simulated-missing", "base.webp").is_none());
        module
            .designs()
            .set_vote_bar(Some(vote_bar.clone()))
            .unwrap();
        let art = module.designs().vote_bar_art().unwrap().unwrap();
        let url = String::from(art.asset_url);
        let parts: Vec<&str> = url.split('/').collect();
        assert!(
            host.design_asset(parts[2], parts[3], "base.webp")
                .unwrap()
                .is_some()
        );
        // A display naming a non-vessel design is refused before commit.
        let wrong: Display = serde_json::from_value(json!({"art_design": frame})).unwrap();
        assert!(
            host.commit_lots_display_after(&draw, wrong, || Ok(()))
                .is_err()
        );
        // The page carries the plate island.
        let html = super::super::lots_page::render(
            None,
            &super::super::lots::DisplayParams {
                scale: 1.0,
                anchor: "br",
                colour: "gules",
                timing_ms: 1500,
                shape: "urn",
            },
            &plate,
        )
        .unwrap();
        let island = html
            .split("<script type=\"application/json\" id=\"cc-vessel\">")
            .nth(1)
            .unwrap()
            .split("</script>")
            .next()
            .unwrap();
        let parsed: LotsPlateSnapshot = serde_json::from_str(island).unwrap();
        assert_eq!(parsed, plate);
    }
}
