//! Isolated read-only aggregate page and bounded, full-replacement SSE.
use super::RenderHost;
use axum::{
    extract::State,
    http::StatusCode,
    response::{
        Html, IntoResponse, Response, Sse,
        sse::{Event, KeepAlive},
    },
};
use cc_types::*;
use futures::stream;
use std::{convert::Infallible, sync::Arc, time::Duration};

pub(super) async fn page(State(host): State<Arc<RenderHost>>) -> Response {
    let Some(source) = host.tiltyard.get().and_then(|source| source.upgrade()) else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    match source.snapshot().await {
        Ok(snapshot) => match render(snapshot.as_ref()) {
            Ok(html) => Html(html).into_response(),
            Err(_) => StatusCode::SERVICE_UNAVAILABLE.into_response(),
        },
        Err(_) => StatusCode::SERVICE_UNAVAILABLE.into_response(),
    }
}
fn escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}
pub(super) fn render(
    snapshot: Option<&TiltyardRenderSnapshot>,
) -> Result<String, serde_json::Error> {
    let mut content = "<p>Waiting for a tournament</p>".to_owned();
    let mut initial = String::new();
    if let Some(s) = snapshot {
        let label = |v: &TiltyardLabel| escape(&String::from(v.clone()));
        let phase = match s.phase {
            TiltyardRenderPhase::Open => "Open",
            TiltyardRenderPhase::Closed => "Closed",
            TiltyardRenderPhase::Called => "Called",
            TiltyardRenderPhase::Cancelled => "Cancelled",
            TiltyardRenderPhase::Finished => "Finished",
        };
        content = format!(
            "{}<p>{} · {} · {phase}</p><p class=tiltyard-side>1 · {} · {}</p><p class=tiltyard-side>2 · {} · {}</p><p>{} ballots</p>",
            if s.simulated {
                "<p class=simulated>SIMULATED</p>"
            } else {
                ""
            },
            label(&s.round_label),
            label(&s.match_label),
            label(&s.left.label),
            s.left.count,
            label(&s.right.label),
            s.right.count,
            s.ballots
        );
        if let Some(at) = &s.window_ends_at {
            content.push_str(&format!(
                "<p>Closes {}</p>",
                escape(&String::from(at.clone()))
            ));
        }
        if let Some(ms) = s.window_remaining_ms {
            content.push_str(&format!("<p>Paused · {}s remaining</p>", ms.div_ceil(1000)));
        }
        if let Some(v) = &s.verdict {
            let side = if v.side == TiltyardWinner::Left {
                &s.left.label
            } else {
                &s.right.label
            };
            let how = match v.how {
                TiltyardDecision::Tally => "tally",
                TiltyardDecision::Tie => "tie",
                TiltyardDecision::Call => "call",
            };
            content.push_str(&format!("<p>Winner: {} · {how}</p>", label(side)));
        }
        if let Some(c) = &s.champion {
            content.push_str(&format!("<p>Champion: {}</p>", label(&c.title)));
        }
        initial = format!(
            "<script type=application/json id=cc-tiltyard>{}</script>",
            serde_json::to_string(s)?.replace('<', "\\u003c")
        );
    }
    Ok(format!(
        r#"<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tiltyard duel</title><style>{tokens}
html,body {{ margin:0; width:100%; height:100%; overflow:hidden; background:transparent; }}
body {{ display:grid; place-items:center; }}
#tiltyard {{ box-sizing:border-box; width:min(90vw,960px); max-height:90vh; overflow:hidden; padding:var(--space-16); background:var(--paper); color:var(--key); font-family:var(--font-ui); font-size:var(--text-body); }}
.tiltyard-side {{ padding:var(--space-8); background:var(--paper-2); }}
.simulated {{ font-weight:700; color:var(--key); border:2px solid currentColor; padding:var(--space-8); }}
</style></head><body><main id="tiltyard" aria-label="Tiltyard duel">{content}</main>{initial}<script type="module" src="/tiltyard.js"></script></body></html>"#,
        tokens = include_str!("../../../../packages/tokens/src/generated.css")
    ))
}

pub(super) async fn push(State(host): State<Arc<RenderHost>>) -> Response {
    let Some(source) = host.tiltyard.get().and_then(|source| source.upgrade()) else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let Ok(permit) = host.clients.clone().try_acquire_owned() else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    // Immediate latest replacement, then at most one per second per client.
    // Only aggregates cross this origin; no chat, control token or write door.
    let events = stream::unfold(
        (source, permit, true),
        |(source, permit, first)| async move {
            let mut immediate = first;
            loop {
                if !immediate {
                    tokio::time::sleep(Duration::from_secs(1)).await;
                }
                immediate = false;
                let snapshot = source.snapshot().await.ok()?;
                let Some(snapshot) = snapshot else {
                    continue;
                };
                let data = serde_json::to_string(&snapshot).ok()?;
                let mut event = Event::default()
                    .event(TILTYARD_RENDER_SNAPSHOT_EVENT)
                    .data(data);
                if snapshot.simulated {
                    event = event.comment("SIMULATED");
                }
                return Some((Ok::<_, Infallible>(event), (source, permit, false)));
            }
        },
    );
    Sse::new(events)
        .keep_alive(KeepAlive::default())
        .into_response()
}
