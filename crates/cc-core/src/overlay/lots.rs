//! A draw is a seal plus its verified cast, never a contribution visual.
use super::{RenderHost, unavailable};
use axum::{
    extract::{Path, Query, State},
    http::{StatusCode, Uri},
    response::{Html, IntoResponse, Response},
};
use cc_types::{
    CastResult, DrawId, ErrorCode, ErrorEnvelope, LotsEventPayload, LotsRandomnessPlan,
    RollSealResult,
};
use std::sync::Arc;

pub(super) struct DrawScene {
    seal: RollSealResult,
    cast: Option<CastResult>,
    simulated: bool,
}

impl RenderHost {
    /// Only LotsModule calls this after sealing/cryptographic verification.
    /// There is no HTTP write endpoint and no independent winner selector.
    pub(crate) fn accept_lots(
        &self,
        payload: &LotsEventPayload,
        simulated: bool,
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

struct DisplayParams {
    scale: f64,
    anchor: &'static str,
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
    let body = if let Some(scene) = scenes.get(&id) {
        let seal = &scene.seal.sealed;
        let source = match &seal.roll.randomness {
            LotsRandomnessPlan::Drand { round, .. } => format!(
                "{} · Target round · {}",
                if scene.simulated {
                    "Simulated · recorded transport"
                } else {
                    "Live-trusted quicknet"
                },
                String::from(round.clone())
            ),
            LotsRandomnessPlan::Streamer { .. } => format!(
                "{}Streamer-controlled commit/reveal",
                if scene.simulated { "Simulated · " } else { "" }
            ),
        };
        let winners = scene
            .cast
            .as_ref()
            .map(|cast| {
                let entries = cast
                    .cast
                    .winners
                    .iter()
                    .map(|winner| format!("<li>{}</li>", escape(&String::from(winner.clone()))))
                    .collect::<String>();
                format!("<h2>Winners</h2><ol>{entries}</ol>")
            })
            .unwrap_or_else(|| "<p>Waiting for the announced round and verified cast.</p>".into());
        format!(
            "<h1>Lot Chamber · draw on stream</h1>{}<p>{}</p><h2>Seal announced</h2><p class=\"seal\">{}</p><p>Sealed at · {}</p><p>{} frozen entries</p>{winners}",
            if scene.simulated {
                "<p class=\"simulated\">SIMULATED</p>"
            } else {
                ""
            },
            escape(&source),
            String::from(seal.seal.clone()),
            String::from(seal.roll.sealed_at.clone()),
            seal.roll.entries.len()
        )
    } else {
        "<h1>Lot Chamber</h1><p>Waiting for an accepted seal. No draw result.</p>".into()
    };
    // Server-render typed values instead of introducing a second JSON parser or
    // event schema in OBS. Refreshing also clears a revoked scene on next read.
    Html(format!("<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta http-equiv=\"refresh\" content=\"1\"><title>Castle Control draw</title><style>{}\n{}</style></head><body><main data-anchor=\"{}\" style=\"--draw-scale:{}\">{body}</main></body></html>",
        include_str!("../../../../packages/tokens/src/generated.css"), include_str!("lots.css"), display.anchor, display.scale)).into_response()
}

fn escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}
