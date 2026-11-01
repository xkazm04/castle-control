//! Core-owned Chat tournament. No viewer data is persisted or sent to OBS.
mod access;
pub mod ballots;
mod bracket;
pub mod engine;
mod projection;
mod storage;
#[cfg(test)]
mod tests;
mod validate;

use crate::{EventHub, Module, gatehouse::GatehouseModule};
use cc_types::*;
use futures::future::BoxFuture;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    path::{Path, PathBuf},
    sync::{Arc, Mutex, Weak},
    time::Duration,
};
use tokio::{sync::Mutex as AsyncMutex, time::Instant};

#[derive(Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Span {
    start: i64,
    end: i64,
}
#[derive(Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Saved {
    // Sample contestants are generated data even with no counted ballots.
    #[serde(default)]
    simulated: bool,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "storage::present"
    )]
    session: Option<TiltyardSession>,
    spans: Vec<Span>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "storage::present"
    )]
    last_closed: Option<TiltyardClosedMatch>,
}
struct State {
    _store: cc_store::Store,
    saved: Saved,
    last_tick: Instant,
}
pub struct TiltyardModule {
    root: PathBuf,
    state: AsyncMutex<State>,
    gatehouse: Arc<GatehouseModule>,
    events: Arc<EventHub>,
    origin: Option<String>,
    ticker: Mutex<Option<tokio::task::JoinHandle<()>>>,
    weak: Weak<Self>,
}
impl TiltyardModule {
    pub const METHODS: &'static [&'static str] = &[
        "maproom.stage.get",
        "maproom.turn.run",
        "tiltyard.source.url",
    ];

    pub(crate) fn open(
        root: impl AsRef<Path>,
        gatehouse: Arc<GatehouseModule>,
        events: Arc<EventHub>,
        origin: Option<String>,
    ) -> Result<Arc<Self>, ErrorEnvelope> {
        let root = root.as_ref().to_owned();
        let store = cc_store::Store::open(root.join("store")).map_err(|_| internal())?;
        let mut saved = storage::load(&root)?;
        if let Some(s) = &mut saved.session
            && s.phase == TiltyardSessionPhase::Live
        {
            let now = ballots::millis(&Timestamp::now());
            if let Some(span) = saved.spans.last_mut() {
                span.end = span.end.min(now);
            }
            let end = now
                + i64::from((u32::from(s.window_ms) - s.elapsed_ms).div_ceil(u32::from(s.speed)));
            saved.spans.push(Span { start: now, end });
            s.window_ends_at = Some(timestamp(end)?);
            storage::save(&root, &saved)?;
        }
        let module = Arc::new_cyclic(|weak| Self {
            root,
            state: AsyncMutex::new(State {
                _store: store,
                saved,
                last_tick: Instant::now(),
            }),
            gatehouse,
            events,
            origin,
            ticker: Mutex::new(None),
            weak: weak.clone(),
        });
        module.start_clock()?;
        Ok(module)
    }
    pub(crate) fn start_clock(&self) -> Result<(), ErrorEnvelope> {
        let Ok(runtime) = tokio::runtime::Handle::try_current() else {
            return Ok(());
        };
        let mut ticker = self.ticker.lock().map_err(|_| internal())?;
        if ticker.as_ref().is_some_and(|task| !task.is_finished()) {
            return Ok(());
        }
        let Ok(state) = self.state.try_lock() else {
            return Ok(());
        };
        if !state.saved.session.as_ref().is_some_and(|s| {
            matches!(
                s.phase,
                TiltyardSessionPhase::Live | TiltyardSessionPhase::Verdict
            )
        }) {
            return Ok(());
        }
        drop(state);
        let weak = self.weak.clone();
        *ticker = Some(runtime.spawn(async move {
            loop {
                let Some(module) = weak.upgrade() else {
                    break;
                };
                let wait_ms = {
                    let state = module.state.lock().await;
                    state
                        .saved
                        .session
                        .as_ref()
                        .map_or(1000, |s| match s.phase {
                            TiltyardSessionPhase::Live => {
                                (u32::from(s.window_ms) - s.elapsed_ms).div_ceil(u32::from(s.speed))
                            }
                            TiltyardSessionPhase::Verdict => s.remaining_ms,
                            _ => 1000,
                        })
                        .clamp(1, 1000)
                };
                drop(module);
                tokio::time::sleep(Duration::from_millis(u64::from(wait_ms))).await;
                let Some(module) = weak.upgrade() else {
                    break;
                };
                if module.clock().await.is_err() {
                    tracing::error!("Tiltyard clock stopped: session unavailable");
                    break;
                }
            }
        }));
        Ok(())
    }
    async fn advance(&self, state: &mut State) -> Result<(), ErrorEnvelope> {
        let now = Instant::now();
        let ms = now
            .duration_since(state.last_tick)
            .as_millis()
            .min(u128::from(u32::MAX)) as u32;
        state.last_tick += Duration::from_millis(u64::from(ms));
        if ms > 0
            && state.saved.session.as_ref().is_some_and(|s| {
                matches!(
                    s.phase,
                    TiltyardSessionPhase::Live | TiltyardSessionPhase::Verdict
                )
            })
        {
            self.apply(state, Some(&TiltyardAction::Tick { ms }), false)
                .await?;
        }
        Ok(())
    }
    async fn clock(&self) -> Result<(), ErrorEnvelope> {
        let mut state = self.state.lock().await;
        self.advance(&mut state).await
    }
    async fn apply(
        &self,
        state: &mut State,
        action: Option<&TiltyardAction>,
        simulated_start: bool,
    ) -> Result<(), ErrorEnvelope> {
        let now = Timestamp::now();
        let now_ms = ballots::millis(&now);
        let mut saved = state.saved.clone();
        if let Some(s) = &mut saved.session
            && s.phase == TiltyardSessionPhase::Live
        {
            let items = self.gatehouse.tiltyard_ballots().await?;
            let events = ballots::classify(&items, |at| {
                (at <= now_ms
                    && saved
                        .spans
                        .iter()
                        .any(|span| at >= span.start && at <= span.end))
                .then_some(at)
            });
            let tally = ballots::tally_at(&events, now_ms);
            s.counted = tally.counted;
            s.simulated = tally.simulated;
        }
        let previous = saved.session.clone();
        if let Some(action) = action {
            match action {
                TiltyardAction::Start {
                    list,
                    key,
                    window_ms,
                } => {
                    saved.session = Some(engine::start(list.clone(), key.clone(), *window_ms)?);
                    saved.simulated = simulated_start;
                }
                _ => engine::step(
                    saved.session.as_mut().ok_or_else(|| {
                        ErrorEnvelope::new(ErrorCode::Conflict, "start a tournament first")
                    })?,
                    action,
                )?,
            }
        }
        if let Some(s) = &mut saved.session {
            let fresh = previous
                .as_ref()
                .is_none_or(|old| old.match_key != s.match_key || old.history != s.history)
                || matches!(
                    action,
                    Some(TiltyardAction::Start { .. } | TiltyardAction::Reset {})
                )
                || matches!(action, Some(TiltyardAction::Enter {}))
                    && previous.as_ref().is_some_and(|old| {
                        old.phase == TiltyardSessionPhase::Done
                            || old.phase == TiltyardSessionPhase::CalledOff
                                && old.match_key.is_none()
                    });
            let live = s.phase == TiltyardSessionPhase::Live;
            let was_live = previous
                .as_ref()
                .is_some_and(|old| old.phase == TiltyardSessionPhase::Live);
            let speed_changed = previous.as_ref().is_some_and(|old| old.speed != s.speed);
            // Close the prior wall segment at the action boundary. Paused chat
            // and earlier attempts of the same match can never leak into votes.
            if (fresh || !live || speed_changed)
                && was_live
                && let Some(span) = saved.spans.last_mut()
            {
                span.end = span.end.min(now_ms);
            }
            if fresh && s.verdict.is_none() && s.match_key.is_some() {
                saved.spans.clear();
                saved.last_closed = None;
                s.counted = ballots::empty();
                s.simulated = false;
            }
            if live {
                let left = u32::from(s.window_ms) - s.elapsed_ms;
                let wall_ms = u64::from(left).div_ceil(u64::from(u32::from(s.speed)));
                let end = now_ms + wall_ms as i64;
                if fresh || !was_live || speed_changed || saved.spans.is_empty() {
                    saved.spans.push(Span { start: now_ms, end });
                }
                if matches!(action, Some(TiltyardAction::Tick { .. }))
                    && let Some(span) = saved.spans.last_mut()
                {
                    span.end = end;
                }
                // Keep a stable deadline between actions; the clock uses real
                // elapsed deltas. A restart freezes downtime and resumes here.
                let end = saved.spans.last().ok_or_else(internal)?.end;
                s.window_ends_at = Some(timestamp(end)?);
            } else {
                s.window_ends_at = None;
            }
            if let Some(closed) = &s.verdict {
                saved.last_closed = Some(closed.clone());
            }
            validate::session(s)?;
        }
        if saved != state.saved {
            storage::save(&self.root, &saved)?;
            state.saved = saved;
            self.events.publish(EventKind::Turn)?;
        }
        Ok(())
    }
}
impl Module for TiltyardModule {
    fn methods(&self) -> &'static [&'static str] {
        Self::METHODS
    }
    fn call<'a>(&'a self, request: &'a RpcRequest) -> BoxFuture<'a, Result<Value, ErrorEnvelope>> {
        Box::pin(async move {
            match request {
                RpcRequest::StageGet(_) => encode(self.stage().await?),
                RpcRequest::TurnRun(params) => encode(self.turn(&params.action).await?),
                RpcRequest::TiltyardSourceUrl(_) => encode(SourceUrlResult {
                    url: format!(
                        "{}{}",
                        self.origin
                            .as_ref()
                            .ok_or_else(|| ErrorEnvelope::new(
                                ErrorCode::Unavailable,
                                "overlay host unavailable"
                            ))?
                            .trim_end_matches('/'),
                        TILTYARD_CURRENT_ROUTE
                    )
                    .try_into()
                    .map_err(|_| internal())?,
                }),
                _ => Err(invalid()),
            }
        })
    }
}
impl Drop for TiltyardModule {
    fn drop(&mut self) {
        if let Ok(ticker) = self.ticker.lock()
            && let Some(task) = ticker.as_ref()
        {
            task.abort();
        }
    }
}
fn timestamp(ms: i64) -> Result<Timestamp, ErrorEnvelope> {
    chrono::DateTime::from_timestamp_millis(ms)
        .ok_or_else(internal)?
        .to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
        .try_into()
        .map_err(|_| internal())
}
fn encode(value: impl Serialize) -> Result<Value, ErrorEnvelope> {
    serde_json::to_value(value).map_err(|_| internal())
}
fn invalid() -> ErrorEnvelope {
    ErrorEnvelope::new(ErrorCode::Invalid, "invalid tournament state or action")
}
fn internal() -> ErrorEnvelope {
    ErrorEnvelope::new(ErrorCode::Internal, "tournament state unavailable")
}
