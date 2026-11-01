//! Private generated-chat door. No RPC accepts text or caller-supplied identities.
pub(crate) mod directions;
mod scenarios;
#[cfg(test)]
mod tests;

use crate::{
    ChatIngress, EventHub, Module, NativeServices, Registry,
    live::{RulesOnly, ShadowPipeline},
};
use cc_types::{
    ErrorCode, ErrorEnvelope, EventKind, RehearsalEventPayload, RehearsalScenario,
    RehearsalScenarioResult, RehearsalStatus, RpcRequest, Timestamp,
};
use futures::future::BoxFuture;
use serde_json::Value;
use std::sync::{
    Arc, Mutex, Weak,
    atomic::{AtomicU64, Ordering},
};
use tokio::{sync::broadcast, task::JoinHandle};

pub const SCENE_NAME: &str = "Castle Control · Rehearsal";

struct Door {
    sender: broadcast::Sender<ChatIngress>,
    sequence: AtomicU64,
    session: String,
}
impl Door {
    fn send(&self, body: &str) -> Result<(), ErrorEnvelope> {
        self.send_text(&format!("SIMULATED {body}"))
    }
    fn send_text(&self, text: &str) -> Result<(), ErrorEnvelope> {
        let sequence = self.sequence.fetch_add(1, Ordering::Relaxed);
        let viewer = sequence;
        let login = format!("simulated_viewer_{viewer}");
        self.sender
            .send(ChatIngress {
                simulated: true,
                login: login.clone(),
                message: cc_twitch::ChatMessage {
                    id: format!("simulated-rehearsal-{}-{sequence}", self.session),
                    at: Timestamp::now().into(),
                    viewer: cc_twitch::Viewer {
                        id: viewer.to_string(),
                        name: login,
                        is_mod: false,
                        sub_tier: None,
                    },
                    text: text.to_owned(),
                },
            })
            .map_err(|_| unavailable())?;
        Ok(())
    }
}

#[derive(Default)]
struct Session {
    active: bool,
    rate: u16,
    crowd: Option<JoinHandle<()>>,
    scenarios: Vec<JoinHandle<()>>,
    worker: Option<JoinHandle<Result<(), ErrorEnvelope>>>,
}
impl Session {
    fn cancel(&mut self) {
        self.active = false;
        self.rate = 0;
        if let Some(task) = &self.crowd {
            task.abort();
        }
        for task in &self.scenarios {
            task.abort();
        }
        if let Some(task) = &self.worker {
            task.abort();
        }
    }
}

pub struct RehearsalModule {
    session: Mutex<Session>,
    serial: tokio::sync::Mutex<()>,
    door: Arc<Door>,
    pipeline: Arc<ShadowPipeline>,
    services: Weak<NativeServices>,
    events: Arc<EventHub>,
    payloads: broadcast::Sender<RehearsalEventPayload>,
    actions: scenarios::Actions,
}
impl RehearsalModule {
    pub const METHODS: &'static [&'static str] = &[
        "rehearsal.start",
        "rehearsal.stop",
        "rehearsal.scenario.run",
        "rehearsal.crowd.set",
    ];

    pub(crate) fn new(
        registry: &Registry,
        services: Weak<NativeServices>,
        events: Arc<EventHub>,
    ) -> Result<Self, ErrorEnvelope> {
        let pipeline = registry.shadow_pipeline()?.ok_or_else(unavailable)?;
        Ok(Self {
            session: Mutex::new(Session::default()),
            serial: tokio::sync::Mutex::new(()),
            door: Arc::new(Door {
                sender: broadcast::channel(256).0,
                sequence: AtomicU64::new(1),
                session: ulid::Ulid::new().to_string(),
            }),
            pipeline,
            services,
            events,
            payloads: broadcast::channel(64).0,
            actions: scenarios::Actions {
                lots: registry.simulated_lots()?,
                beacons: registry.beacons()?,
                tiltyard: registry.tiltyard()?,
                configuration: registry.configuration.clone(),
                message_delay: std::time::Duration::from_millis(180),
            },
        })
    }

    /// Separate typed binding; control /events remains invalidation-only.
    pub fn subscribe(&self) -> broadcast::Receiver<RehearsalEventPayload> {
        self.payloads.subscribe()
    }

    pub(crate) fn shutdown(&self) {
        if let Ok(mut session) = self.session.lock() {
            session.cancel();
        }
        if self.actions.beacons.stop_simulations().is_err() {
            tracing::error!("rehearsal preview cleanup unavailable");
        }
    }

    async fn status(&self) -> Result<RehearsalStatus, ErrorEnvelope> {
        let (obs, scene_name) = match self.services.upgrade() {
            Some(services) => services.rehearsal_obs().await,
            None => (cc_types::ObsStatus { connected: false }, None),
        };
        let session = self.session.lock().map_err(|_| unavailable())?;
        let status = RehearsalStatus {
            active: session.active,
            crowd_per_minute: session.rate,
            obs,
            scene_name,
            at: Timestamp::now(),
        };
        self.events.publish(EventKind::RehearsalStatus)?;
        let _no_subscribers = self
            .payloads
            .send(RehearsalEventPayload::Status(status.clone()));
        Ok(status)
    }

    async fn stop(&self) -> Result<(), ErrorEnvelope> {
        let (crowd, scenarios, worker) = {
            let mut session = self.session.lock().map_err(|_| unavailable())?;
            session.cancel();
            (
                session.crowd.take(),
                std::mem::take(&mut session.scenarios),
                session.worker.take(),
            )
        };
        for task in crowd.into_iter().chain(scenarios) {
            finish(task).await;
        }
        if let Some(task) = worker {
            finish(task).await;
        }
        self.actions.beacons.stop_simulations()
    }

    async fn handle(&self, request: &RpcRequest) -> Result<Value, ErrorEnvelope> {
        let _serial = self.serial.lock().await;
        match request {
            RpcRequest::RehearsalStart(_) => {
                let mut session = self.session.lock().map_err(|_| unavailable())?;
                if !session.active {
                    session.worker = self
                        .pipeline
                        .start(Some(self.door.sender.subscribe()), Arc::new(RulesOnly));
                    session.active = true;
                }
            }
            RpcRequest::RehearsalStop(_) => self.stop().await?,
            RpcRequest::RehearsalCrowdSet(params) => {
                let previous = {
                    let mut session = self.session.lock().map_err(|_| unavailable())?;
                    if !session.active && params.per_minute != 0 {
                        return Err(ErrorEnvelope::new(
                            ErrorCode::Conflict,
                            "start dress rehearsal before setting crowd",
                        ));
                    }
                    session.rate = params.per_minute;
                    session.crowd.take()
                };
                if let Some(task) = previous {
                    task.abort();
                    finish(task).await;
                }
                if params.per_minute != 0 {
                    let door = self.door.clone();
                    let rate = params.per_minute;
                    let task = tokio::spawn(async move {
                        loop {
                            // Mean interval is 60/rate seconds; jitter is bounded to +/-20%.
                            let seconds = 60.0 / f64::from(rate) * rand::random_range(0.8..1.2);
                            tokio::time::sleep(std::time::Duration::from_secs_f64(seconds)).await;
                            if door
                                .send("crowd cheering from the rehearsal seats")
                                .is_err()
                            {
                                tracing::error!("rehearsal crowd consumer unavailable");
                                break;
                            }
                        }
                    });
                    self.session.lock().map_err(|_| unavailable())?.crowd = Some(task);
                }
            }
            RpcRequest::RehearsalScenarioRun(params) => {
                if params.scenario == RehearsalScenario::BeaconFire && params.visual_id.is_none() {
                    return Err(ErrorEnvelope::new(
                        ErrorCode::Invalid,
                        "beacon_fire requires visual_id",
                    ));
                }
                let mut session = self.session.lock().map_err(|_| unavailable())?;
                if !session.active {
                    return encode(RehearsalScenarioResult { accepted: false });
                }
                session.scenarios.retain(|task| !task.is_finished());
                let (actions, door, params) =
                    (self.actions.clone(), self.door.clone(), params.clone());
                session.scenarios.push(tokio::spawn(async move {
                    if actions.run(params, door).await.is_err() {
                        tracing::error!("rehearsal scenario unavailable");
                    }
                }));
                return encode(RehearsalScenarioResult { accepted: true });
            }
            _ => return Err(unavailable()),
        }
        encode(self.status().await?)
    }
}
impl Module for RehearsalModule {
    fn methods(&self) -> &'static [&'static str] {
        Self::METHODS
    }
    fn call<'a>(&'a self, request: &'a RpcRequest) -> BoxFuture<'a, Result<Value, ErrorEnvelope>> {
        Box::pin(self.handle(request))
    }
}
impl Drop for RehearsalModule {
    fn drop(&mut self) {
        self.shutdown();
    }
}
async fn finish<T>(task: JoinHandle<T>) {
    if let Err(error) = task.await
        && !error.is_cancelled()
    {
        tracing::error!("rehearsal task failed");
    }
}
fn encode(value: impl serde::Serialize) -> Result<Value, ErrorEnvelope> {
    serde_json::to_value(value).map_err(|_| unavailable())
}
fn unavailable() -> ErrorEnvelope {
    ErrorEnvelope::new(ErrorCode::Unavailable, "rehearsal state unavailable")
}
