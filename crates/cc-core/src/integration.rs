use crate::{
    AppState, EventHub, LoginPresenter, Module, Registry, bridge_status, forward_bridge_event,
};
pub(crate) mod intake;
mod render;
use cc_obs::{BrowserSource, Client, Config as ObsConfig, Overlay};
use cc_store::Store;
use cc_twitch::{BridgeError, BridgeState, RevocationHandler, TwitchBridge, TwitchConfig};
use cc_types::{
    ErrorCode, ErrorEnvelope, EventKind, ObsStatus, RpcRequest, StatusResult, Timestamp,
    TwitchAuthStatus,
};
use futures::future::BoxFuture;
use serde_json::Value;
use std::{
    sync::{
        Arc, Mutex, OnceLock, Weak,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant},
};
use tokio::{
    sync::{Mutex as AsyncMutex, broadcast},
    task::AbortHandle,
};

pub struct NativeConfig {
    pub twitch: TwitchConfig,
    pub obs: ObsConfig,
    pub overlay_port: u16,
}
pub struct NativeServices {
    pub bridge: Arc<TwitchBridge>,
    pub store: Arc<Mutex<Store>>,
    obs: AsyncMutex<Option<Client>>,
    obs_config: ObsConfig,
    overlay: Overlay,
    render: Arc<crate::overlay::RenderHost>,
    presenter: LoginPresenter,
    scopes: Vec<String>,
    started: Instant,
    chat: broadcast::Sender<crate::ChatIngress>,
    workers: Mutex<Vec<AbortHandle>>,
    events: OnceLock<Weak<EventHub>>,
    obs_connected: AtomicBool,
    pipeline: Arc<OnceLock<Weak<crate::live::ShadowPipeline>>>,
}
struct Eraser(
    Arc<Mutex<Store>>,
    Arc<OnceLock<Weak<crate::live::ShadowPipeline>>>,
);
#[async_trait::async_trait]
impl RevocationHandler for Eraser {
    async fn purge_all(&self) -> Result<(), BridgeError> {
        if let Some(pipeline) = self.1.get().and_then(Weak::upgrade) {
            pipeline
                .revoke()
                .await
                .map_err(|_| BridgeError::Unavailable("live store purge failed"))?;
        }
        let store = self.0.clone();
        tokio::task::spawn_blocking(move || {
            store
                .lock()
                .map_err(|_| BridgeError::Unavailable("store lock unavailable"))?
                .purge_all(cc_store::Timestamp::now())
                .map_err(|_| BridgeError::Unavailable("store purge failed"))?;
            Ok(())
        })
        .await
        .map_err(|_| BridgeError::Unavailable("store purge worker failed"))?
    }
}
impl NativeServices {
    pub const METHODS: &'static [&'static str] = &[
        "status.get",
        "bridge.status.get",
        "auth.twitch.start",
        "auth.twitch.status",
        "auth.twitch.revoke",
        "obs.status.get",
        "obs.source.create",
    ];
    /// No Twitch/OBS connection until attach/login/probe; overlay is a separate origin.
    pub async fn new(
        config: NativeConfig,
        store: Store,
        presenter: LoginPresenter,
    ) -> Result<Arc<Self>, ErrorEnvelope> {
        let scopes = cc_twitch::scopes::MODULE_SCOPES
            .iter()
            .filter(|row| {
                row.module == "core" || config.twitch.modules.iter().any(|m| m == row.module)
            })
            .flat_map(|row| row.scopes.iter().map(|s| s.to_string()))
            .collect::<std::collections::BTreeSet<_>>()
            .into_iter()
            .collect();
        let store = Arc::new(Mutex::new(store));
        let pipeline = Arc::new(OnceLock::new());
        let bridge = TwitchBridge::new(
            config.twitch,
            Arc::new(Eraser(store.clone(), pipeline.clone())),
        )
        .map_err(bridge_error)?;
        let render = Arc::new(crate::overlay::RenderHost::default());
        let overlay = Overlay::start_with_routes(config.overlay_port, render.routes())
            .await
            .map_err(obs_error)?;
        Ok(Arc::new(Self {
            bridge,
            store,
            overlay,
            render,
            presenter,
            scopes,
            obs_config: config.obs,
            obs: AsyncMutex::new(None),
            started: Instant::now(),
            chat: broadcast::channel(256).0,
            workers: Mutex::new(Vec::new()),
            events: OnceLock::new(),
            obs_connected: AtomicBool::new(false),
            pipeline,
        }))
    }
    pub fn overlay_url(&self) -> String {
        self.overlay.url()
    }
    pub fn subscribe_chat(&self) -> broadcast::Receiver<crate::ChatIngress> {
        self.chat.subscribe()
    }
    /// Wires the real modules and bridge pump into the same event hub used by /events.
    pub fn app(self: &Arc<Self>, capacity: usize) -> Result<Arc<AppState>, ErrorEnvelope> {
        self.attach(capacity, None)
    }
    /// Production host supplies its persistent data directory explicitly. The
    /// legacy app() entry point retains recorded-fixture/spike behavior.
    pub fn app_with_data_dir(
        self: &Arc<Self>,
        capacity: usize,
        root: &std::path::Path,
    ) -> Result<Arc<AppState>, ErrorEnvelope> {
        self.attach(capacity, Some(root))
    }
    fn attach(
        self: &Arc<Self>,
        capacity: usize,
        root: Option<&std::path::Path>,
    ) -> Result<Arc<AppState>, ErrorEnvelope> {
        let mut workers = self.workers.lock().map_err(|_| internal())?;
        if !workers.is_empty() {
            return Err(ErrorEnvelope::new(
                ErrorCode::Conflict,
                "bridge already attached",
            ));
        }
        let events = Arc::new(EventHub::new(capacity)?);
        let registry = match root {
            Some(root) => Registry::with_native_root(self.clone(), root, events.clone()),
            None => Registry::with_native(self.clone()),
        };
        let pipeline = registry.shadow_pipeline()?;
        let live = pipeline.is_some();
        self.events
            .set(Arc::downgrade(&events))
            .map_err(|_| internal())?;
        let app = AppState::with_events(registry, events.clone())?;
        if let Some(pipeline) = pipeline {
            self.pipeline
                .set(Arc::downgrade(&pipeline))
                .map_err(|_| internal())?;
            let task = pipeline
                .start(
                    Some(self.subscribe_chat()),
                    Arc::new(crate::live::RulesOnly),
                )
                .ok_or_else(internal)?;
            workers.push(task.abort_handle());
        }
        let contribution = if live {
            let module = app.registry.beacons()?;
            let (sender, receiver) = broadcast::channel(256);
            workers.push(module.start_intake(receiver, events.clone()).abort_handle());
            Some(sender)
        } else {
            None
        };
        workers.push(self.bridge_pump(events, live, contribution));
        let weak = Arc::downgrade(self);
        workers.push(
            tokio::spawn(async move {
                let mut poll = tokio::time::interval(Duration::from_secs(2));
                loop {
                    poll.tick().await;
                    let Some(service) = weak.upgrade() else {
                        break;
                    };
                    // Probe failures are reflected as disconnected, not claimed successes.
                    let _connected = service.obs_status().await;
                }
            })
            .abort_handle(),
        );
        Ok(app)
    }
    pub async fn start_login(&self) -> Result<(), ErrorEnvelope> {
        (self.presenter)(
            self.bridge
                .begin_device_login()
                .await
                .map_err(bridge_error)?,
        )
    }
    pub async fn obs_status(&self) -> Result<bool, ErrorEnvelope> {
        let result = self.probe_obs().await;
        self.observe_obs(result.is_ok())?;
        result
    }
    fn observe_obs(&self, connected: bool) -> Result<(), ErrorEnvelope> {
        if self.obs_connected.swap(connected, Ordering::Relaxed) != connected
            && let Some(events) = self.events.get().and_then(Weak::upgrade)
        {
            events.publish(EventKind::ObsStatus)?;
        }
        Ok(())
    }
    async fn probe_obs(&self) -> Result<bool, ErrorEnvelope> {
        let mut client = self.obs.lock().await;
        if client.is_none() {
            *client = Some(Client::connect(&self.obs_config).await.map_err(obs_error)?);
        }
        let result = client.as_mut().ok_or_else(internal)?.get_version().await;
        if result.is_err() {
            *client = None;
            self.observe_obs(false)?;
        }
        result.map(|_| true).map_err(obs_error)
    }
    pub async fn create_source(
        &self,
        params: &cc_types::ObsSourceParams,
    ) -> Result<(), ErrorEnvelope> {
        if !self.render.owns_source(&self.overlay_url(), &params.url) {
            return Err(ErrorEnvelope::new(
                ErrorCode::Invalid,
                "source must use the owned overlay origin",
            ));
        }
        self.obs_status().await?;
        let mut client = self.obs.lock().await;
        let result = client
            .as_mut()
            .ok_or_else(internal)?
            .create_browser_source(&BrowserSource {
                scene_name: params.scene_name.clone(),
                source_name: params.source_name.clone(),
                url: params.url.clone(),
                width: params.width,
                height: params.height,
            })
            .await;
        if result.is_err() {
            *client = None;
        }
        self.observe_obs(result.is_ok())?;
        result.map_err(obs_error)
    }
    fn auth_status(&self) -> TwitchAuthStatus {
        let state = self.bridge.status().state;
        let connected = state == BridgeState::Connected;
        TwitchAuthStatus {
            connected,
            pending: state == BridgeState::Connecting,
            user_id: None,
            scopes: if connected {
                self.scopes.clone()
            } else {
                vec![]
            },
        }
    }
}
impl Module for NativeServices {
    fn methods(&self) -> &'static [&'static str] {
        Self::METHODS
    }
    fn call<'a>(&'a self, request: &'a RpcRequest) -> BoxFuture<'a, Result<Value, ErrorEnvelope>> {
        Box::pin(async move {
            match request {
                RpcRequest::StatusGet(_) => encode(StatusResult {
                    at: Timestamp::now(),
                    version: env!("CARGO_PKG_VERSION").into(),
                    uptime_ms: self
                        .started
                        .elapsed()
                        .as_millis()
                        .try_into()
                        .unwrap_or(u64::MAX),
                    twitch_connected: self.bridge.status().state == BridgeState::Connected,
                    obs_connected: self.obs_connected.load(Ordering::Relaxed),
                    simulated: false,
                    // No stream topics or public streams read in cc-twitch yet. Unknown stays absent.
                    stream: None,
                    gatehouse: None,
                }),
                RpcRequest::BridgeStatusGet(_) => encode(bridge_status(self.bridge.status())?),
                RpcRequest::AuthTwitchStart(_) => {
                    self.start_login().await?;
                    encode(self.auth_status())
                }
                RpcRequest::AuthTwitchStatus(_) => encode(self.auth_status()),
                RpcRequest::AuthTwitchRevoke(_) => {
                    self.bridge.disconnect().await.map_err(bridge_error)?;
                    encode(cc_types::Empty {})
                }
                RpcRequest::ObsStatusGet(_) => encode(ObsStatus {
                    connected: self.obs_status().await.unwrap_or(false),
                }),
                RpcRequest::ObsSourceCreate(params) => {
                    self.create_source(params).await?;
                    encode(cc_types::ObsSourceResult {
                        source_name: params.source_name.clone(),
                    })
                }
                _ => Err(ErrorEnvelope::new(
                    ErrorCode::NotFound,
                    "method not handled by native services",
                )),
            }
        })
    }
}
impl Drop for NativeServices {
    fn drop(&mut self) {
        if let Ok(workers) = self.workers.get_mut() {
            for task in workers.drain(..) {
                task.abort();
            }
        }
    }
}
fn encode(value: impl serde::Serialize) -> Result<Value, ErrorEnvelope> {
    serde_json::to_value(value).map_err(|_| internal())
}
fn internal() -> ErrorEnvelope {
    ErrorEnvelope::new(ErrorCode::Internal, "native service unavailable")
}
fn obs_error(error: cc_obs::Error) -> ErrorEnvelope {
    let code = if error == cc_obs::Error::Invalid {
        ErrorCode::Invalid
    } else {
        ErrorCode::Unavailable
    };
    ErrorEnvelope::new(code, error.to_string())
}
fn bridge_error(error: BridgeError) -> ErrorEnvelope {
    let code = match error {
        BridgeError::Invalid(_) => ErrorCode::Invalid,
        BridgeError::Unavailable(_) => ErrorCode::Unavailable,
        BridgeError::Unauthorized => ErrorCode::Unauthorized,
        BridgeError::Upstream(_) => ErrorCode::Upstream,
        BridgeError::RateLimited { .. } => ErrorCode::RateLimited,
    };
    let mut result = ErrorEnvelope::new(code, error.to_string());
    if let BridgeError::RateLimited { retry_after_ms } = error {
        result.retry_after_ms = Some(retry_after_ms);
    }
    result
}
