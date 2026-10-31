//! Only aggregate shares reach this isolated page or its full-replacement SSE.
use super::RenderHost;
use axum::{
    extract::{Query, State},
    http::{StatusCode, Uri},
    response::{
        Html, IntoResponse, Response, Sse,
        sse::{Event, KeepAlive},
    },
};
use cc_types::{VOTE_BAR_SNAPSHOT_EVENT, VoteBarSnapshot};
use futures::stream;
use std::{convert::Infallible, sync::Arc, time::Duration};

struct DisplayParams {
    scale: f64,
    anchor: &'static str,
}

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
        Some("br") => "br",
        _ => "center",
    };
    DisplayParams { scale, anchor }
}

pub(super) async fn page(State(host): State<Arc<RenderHost>>, uri: Uri) -> Response {
    let display = display_params(&uri);
    let Some(source) = host.vote_bar.get() else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let Ok(snapshot) = source.snapshot().await else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    match render(&snapshot, &display) {
        Ok(html) => Html(html).into_response(),
        Err(_) => StatusCode::SERVICE_UNAVAILABLE.into_response(),
    }
}

fn render(
    snapshot: &VoteBarSnapshot,
    display: &DisplayParams,
) -> Result<String, serde_json::Error> {
    let json = serde_json::to_string(snapshot)?.replace('<', "\\u003c");
    let badge = if snapshot.simulated {
        "<p>SIMULATED</p>"
    } else {
        ""
    };
    let bars = snapshot.directions.iter().enumerate().map(|(index, direction)| {
        let percent = f64::from(direction.share.clone()) * 100.0;
        format!("<div class=\"vote-direction\"><span>Direction {} · {percent:.0}%</span><div class=\"vote-track\"><i style=\"width:{percent}%\"></i></div></div>", index + 1)
    }).collect::<String>();
    Ok(format!(
        r#"<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vote bar</title><style>{tokens}
html,body {{ margin:0; width:100%; height:100%; overflow:hidden; background:transparent; }}
body {{ display:grid; place-items:center; }}
#vote-bar {{ box-sizing:border-box; width:min(90vw,calc(60vw * {scale})); max-height:90vh; overflow:hidden; padding:var(--space-16); background:var(--paper); color:var(--key); font-family:var(--font-ui); font-size:var(--text-body); }}
body:has([data-anchor="tl"]) {{ place-items:start; }} body:has([data-anchor="tr"]) {{ place-items:start end; }}
body:has([data-anchor="bl"]) {{ place-items:end start; }} body:has([data-anchor="br"]) {{ place-items:end; }}
.vote-track {{ width:100%; background:var(--paper-2); height:var(--space-16); }}
.vote-track i {{ display:block; height:100%; background:var(--azure); }}
.vote-direction {{ margin-block:var(--space-8); }}
</style></head><body><main id="vote-bar" aria-label="Consensus vote bar" data-anchor="{anchor}">{badge}{bars}</main><script type="application/json" id="cc-vote-bar">{json}</script><script type="module" src="/vote-bar.js"></script></body></html>"#,
        tokens = include_str!("../../../../packages/tokens/src/generated.css"),
        scale = display.scale,
        anchor = display.anchor
    ))
}

pub(super) async fn push(State(host): State<Arc<RenderHost>>) -> Response {
    let Some(source) = host.vote_bar.get().cloned() else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let Ok(permit) = host.clients.clone().try_acquire_owned() else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    // Pull at most once per second per client, coalescing naturally. No private
    // control token, chat event stream or write capability enters this origin.
    let events = stream::unfold(
        (source, permit, true),
        |(source, permit, first)| async move {
            if !first {
                tokio::time::sleep(Duration::from_secs(1)).await;
            }
            let snapshot = source.snapshot().await.ok()?;
            let data = serde_json::to_string(&snapshot).ok()?;
            Some((
                Ok::<_, Infallible>(Event::default().event(VOTE_BAR_SNAPSHOT_EVENT).data(data)),
                (source, permit, false),
            ))
        },
    );
    Sse::new(events)
        .keep_alive(KeepAlive::default())
        .into_response()
}
