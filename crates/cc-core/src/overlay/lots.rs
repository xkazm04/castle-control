//! A draw is a seal plus its verified cast, never a contribution visual.
use super::{RenderHost, lots_page, unavailable};
use axum::{
    extract::{Path, Query, State},
    http::{StatusCode, Uri},
    response::{Html, IntoResponse, Response},
};
use cc_types::{
    CastResult, ColourToken, Display, DisplayAnchor, DisplaySize, DrawContent, DrawId, ErrorCode,
    ErrorEnvelope, LotsEventPayload, RollSealResult,
};
use std::sync::Arc;

pub(super) struct DrawScene {
    pub(super) accepted: Option<AcceptedDraw>,
    pub(super) display: Option<Display>,
}
pub(super) struct AcceptedDraw {
    pub(super) seal: RollSealResult,
    pub(super) cast: Option<CastResult>,
    pub(super) simulated: bool,
    pub(super) content: DrawContent,
}

impl RenderHost {
    /// Commit configuration before publishing defaults, under the same lock.
    pub(crate) fn commit_lots_display_after(
        &self,
        id: &DrawId,
        display: Display,
        commit: impl FnOnce() -> Result<(), ErrorEnvelope>,
    ) -> Result<(), ErrorEnvelope> {
        let mut scenes = self.lots.lock().map_err(|_| unavailable())?;
        commit()?;
        scenes
            .entry(id.clone())
            .or_insert_with(|| DrawScene {
                accepted: None,
                display: None,
            })
            .display = Some(display);
        Ok(())
    }
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
                if scenes
                    .get(&seal.draw_id)
                    .is_none_or(|s| s.accepted.is_none())
                    && scenes.values().filter(|s| s.accepted.is_some()).count() >= 128
                {
                    return Err(unavailable());
                }
                let scene = scenes
                    .entry(seal.draw_id.clone())
                    .or_insert_with(|| DrawScene {
                        accepted: None,
                        display: None,
                    });
                scene.accepted = Some(AcceptedDraw {
                    seal: seal.clone(),
                    cast: None,
                    simulated,
                    content: content.ok_or_else(unavailable)?,
                });
            }
            LotsEventPayload::Cast(cast) => {
                let scene = scenes
                    .values_mut()
                    .filter_map(|scene| scene.accepted.as_mut())
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
            .and_then(|s| s.accepted.as_ref())
            .map(|s| s.seal.clone()))
    }
    pub fn lots_cast(&self, id: &DrawId) -> Result<Option<CastResult>, ErrorEnvelope> {
        Ok(self
            .lots
            .lock()
            .map_err(|_| unavailable())?
            .get(id)
            .and_then(|s| s.accepted.as_ref())
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
    pub(super) colour: &'static str,
    pub(super) timing_ms: u32,
}

/// The only presentation-query door. Unknown keys are ignored; missing, invalid
/// or repeated known keys use their defaults. Nothing here affects the cast.
fn display_params(uri: &Uri, saved: Option<&Display>) -> DisplayParams {
    let default_scale = match saved.and_then(|d| d.size) {
        Some(DisplaySize::S) => 0.75,
        Some(DisplaySize::L) => 1.5,
        _ => 1.0,
    };
    let default_anchor = match saved.and_then(|d| d.anchor) {
        Some(DisplayAnchor::TopLeft) => "tl",
        Some(DisplayAnchor::TopRight) => "tr",
        Some(DisplayAnchor::BottomLeft) => "bl",
        Some(DisplayAnchor::Center) => "center",
        _ => "br",
    };
    let colour = match saved.and_then(|d| d.colour_token) {
        Some(ColourToken::Azure) => "azure",
        Some(ColourToken::Or) => "or",
        Some(ColourToken::Key) => "key",
        _ => "gules",
    };
    let timing_ms = saved
        .and_then(|d| d.timing_ms)
        .map(u32::from)
        .unwrap_or(1500);
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
        .unwrap_or(default_scale);
    let anchor = match single("anchor") {
        Some("tl") => "tl",
        Some("tr") => "tr",
        Some("bl") => "bl",
        Some("center") => "center",
        Some("br") => "br",
        _ => default_anchor,
    };
    DisplayParams {
        scale,
        anchor,
        colour,
        timing_ms,
    }
}

pub(super) async fn page(
    State(host): State<Arc<RenderHost>>,
    Path(id): Path<String>,
    uri: Uri,
) -> Response {
    let Ok(id) = DrawId::try_from(id) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let Ok(scenes) = host.lots.lock() else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let scene = scenes.get(&id);
    let display = display_params(&uri, scene.and_then(|s| s.display.as_ref()));
    match lots_page::render(scene.and_then(|s| s.accepted.as_ref()), &display) {
        Ok(html) => Html(html).into_response(),
        Err(_) => StatusCode::SERVICE_UNAVAILABLE.into_response(),
    }
}
