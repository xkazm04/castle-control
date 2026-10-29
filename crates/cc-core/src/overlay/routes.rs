use super::{RenderHost, Snapshot};
use axum::{
    Router,
    extract::{Path, Query, State},
    http::{StatusCode, header},
    response::{
        Html, IntoResponse, Response, Sse,
        sse::{Event, KeepAlive},
    },
    routing::get,
};
use cc_types::{BEACONS_RENDER_SNAPSHOT_EVENT, LocalAssetPath, VisualId};
use futures::stream;
use serde::Deserialize;
use std::{convert::Infallible, sync::Arc};
use tokio::sync::{OwnedSemaphorePermit, watch};

pub(super) fn router(host: Arc<RenderHost>) -> Router {
    Router::new()
        .route("/beacons/{visual_id}", get(page))
        .route("/lots/{draw_id}", get(super::lots::page))
        .route(
            "/bundle.js",
            get(|| async {
                (
                    [(header::CONTENT_TYPE, "text/javascript; charset=utf-8")],
                    include_str!("../../../../apps/overlay/bundle.js"),
                )
            }),
        )
        .route("/assets/{visual_id}/{hash}/{*path}", get(asset))
        .route("/push/beacons", get(push))
        .with_state(host)
}
async fn page(Path(id): Path<String>) -> Response {
    if VisualId::try_from(id).is_err() {
        return StatusCode::NOT_FOUND.into_response();
    }
    Html(include_str!("../../../../apps/overlay/index.html")).into_response()
}
async fn asset(
    State(host): State<Arc<RenderHost>>,
    Path((id, hash, path)): Path<(String, String, String)>,
) -> Response {
    let Ok(id) = VisualId::try_from(id) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    if LocalAssetPath::try_from(path.clone()).is_err() {
        return StatusCode::NOT_FOUND.into_response();
    }
    let Ok(state) = host.state.lock() else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let Some(package) = state
        .visuals
        .get(&id)
        .and_then(|v| v.design_id.as_ref())
        .and_then(|id| state.packages.get(id))
    else {
        return StatusCode::NOT_FOUND.into_response();
    };
    if String::from(package.package.content_hash.clone()) != hash {
        return StatusCode::NOT_FOUND.into_response();
    }
    let Some(asset) = package.assets.get(&path) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    ([(header::CONTENT_TYPE, asset.mime)], asset.bytes.to_vec()).into_response()
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct PushQuery {
    visual_id: VisualId,
}

async fn push(State(host): State<Arc<RenderHost>>, Query(query): Query<PushQuery>) -> Response {
    let Ok(permit) = host.clients.clone().try_acquire_owned() else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let receiver = {
        let Ok(state) = host.state.lock() else {
            return StatusCode::SERVICE_UNAVAILABLE.into_response();
        };
        let Some(slot) = state.slots.get(&query.visual_id) else {
            return StatusCode::NOT_FOUND.into_response();
        };
        slot.subscribe()
    };
    // A watch slot coalesces to one full replacement per visual. No queue of old
    // packages accumulates behind a slow client. First read includes latest state.
    let events = stream::unfold(
        (receiver, true, permit),
        |(mut receiver, first, permit): (watch::Receiver<Snapshot>, bool, OwnedSemaphorePermit)| async move {
            let mut ready = first;
            loop {
                if !ready && receiver.changed().await.is_err() {
                    return None;
                }
                ready = false;
                let snapshot = receiver.borrow_and_update().clone();
                if let Some(snapshot) = snapshot {
                    let data = serde_json::to_string(snapshot.as_ref()).ok()?;
                    let event = Event::default()
                        .event(BEACONS_RENDER_SNAPSHOT_EVENT)
                        .data(data);
                    return Some((Ok::<_, Infallible>(event), (receiver, false, permit)));
                }
            }
        },
    );
    Sse::new(events)
        .keep_alive(KeepAlive::default())
        .into_response()
}
