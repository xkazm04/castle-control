//! A draw is a seal plus its verified cast, never a contribution visual.
use super::{RenderHost, lots_page, unavailable};
use axum::{
    extract::{Path, Query, State},
    http::{StatusCode, Uri},
    response::{Html, IntoResponse, Response},
};
use cc_types::{
    CastResult, DrawContent, DrawId, ErrorCode, ErrorEnvelope, LotsEventPayload, RollSealResult,
};
use std::sync::Arc;

pub(super) struct DrawScene {
    pub(super) seal: RollSealResult,
    pub(super) cast: Option<CastResult>,
    pub(super) simulated: bool,
    pub(super) content: DrawContent,
}

impl RenderHost {
    /// Only LotsModule calls this after sealing/cryptographic verification.
    /// There is no HTTP write endpoint and no independent winner selector.
    pub(crate) fn accept_lots(
        &self,
        payload: &LotsEventPayload,
        simulated: bool,
        content: Option<DrawContent>,
    ) -> Result<(), ErrorEnvelope> {
        let mut scenes = self.lots.lock().map_err(|_| unavailable())?;
        match payload {
            LotsEventPayload::Roll(_) => {}
            LotsEventPayload::Sealed(seal) => {
                if !scenes.contains_key(&seal.draw_id) && scenes.len() >= 128 {
                    return Err(unavailable());
                }
                scenes.insert(
                    seal.draw_id.clone(),
                    DrawScene {
                        seal: seal.clone(),
                        cast: None,
                        simulated,
                        content: content.ok_or_else(unavailable)?,
                    },
                );
            }
            LotsEventPayload::Cast(cast) => {
                let scene = scenes
                    .values_mut()
                    .find(|scene| scene.seal.draw_run_id == cast.draw_run_id)
                    .ok_or_else(unavailable)?;
                if cast.cast.seal != scene.seal.sealed.seal {
                    return Err(ErrorEnvelope::new(
                        ErrorCode::Invalid,
                        "cast does not match announced seal",
                    ));
                }
                if scene.cast.as_ref().is_some_and(|previous| previous != cast) {
                    return Err(ErrorEnvelope::new(ErrorCode::Conflict, "cast is immutable"));
                }
                scene.cast = Some(cast.clone());
            }
        }
        Ok(())
    }

    /// Read-only Rust evidence seam. No endpoint accepts presentation payloads.
    pub fn lots_seal(&self, id: &DrawId) -> Result<Option<RollSealResult>, ErrorEnvelope> {
        Ok(self
            .lots
            .lock()
            .map_err(|_| unavailable())?
            .get(id)
            .map(|s| s.seal.clone()))
    }
    pub fn lots_cast(&self, id: &DrawId) -> Result<Option<CastResult>, ErrorEnvelope> {
        Ok(self
            .lots
            .lock()
            .map_err(|_| unavailable())?
            .get(id)
            .and_then(|s| s.cast.clone()))
    }
    pub(crate) fn clear_lots(&self) -> Result<(), ErrorEnvelope> {
        self.lots.lock().map_err(|_| unavailable())?.clear();
        Ok(())
    }
}

pub(super) struct DisplayParams {
    pub(super) scale: f64,
    pub(super) anchor: &'static str,
}

/// The only presentation-query door. Unknown keys are ignored; missing, invalid
/// or repeated known keys use their defaults. Nothing here affects the cast.
fn display_params(uri: &Uri) -> DisplayParams {
    let pairs = Query::<Vec<(String, String)>>::try_from_uri(uri)
        .map(|Query(pairs)| pairs)
        .unwrap_or_default();
    let single = |key: &str| {
        let mut values = pairs.iter().filter(|(name, _)| name == key);
        let value = values.next().map(|(_, value)| value.as_str());
        if values.next().is_some() { None } else { value }
    };
    let scale = single("scale")
        .and_then(|value| value.parse::<f64>().ok())
        .filter(|value| value.is_finite() && (0.5..=2.0).contains(value))
        .unwrap_or(1.0);
    let anchor = match single("anchor") {
        Some("tl") => "tl",
        Some("tr") => "tr",
        Some("bl") => "bl",
        Some("center") => "center",
        _ => "br",
    };
    DisplayParams { scale, anchor }
}

pub(super) async fn page(
    State(host): State<Arc<RenderHost>>,
    Path(id): Path<String>,
    uri: Uri,
) -> Response {
    let display = display_params(&uri);
    let Ok(id) = DrawId::try_from(id) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let Ok(scenes) = host.lots.lock() else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    match lots_page::render(scenes.get(&id), &display) {
        Ok(html) => Html(html).into_response(),
        Err(_) => StatusCode::SERVICE_UNAVAILABLE.into_response(),
    }
}
