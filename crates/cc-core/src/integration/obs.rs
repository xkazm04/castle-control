//! One mutex serializes endpoint changes, reconnects and ownership mutations.
use super::{NativeServices, obs_error};
use cc_obs::{BrowserSource, Client, Config, Connection, Error, Ownership, PasswordStore};
use cc_types::{ErrorCode, ErrorEnvelope, EventKind, ObsConnectParams, ObsSourceParams};
use std::{
    path::Path,
    sync::{Arc, Weak, atomic::Ordering},
};
use zeroize::Zeroizing;

pub(super) struct State {
    connection: Connection,
    ownership: Option<Ownership>,
}
impl State {
    pub fn new(config: Config, passwords: Arc<dyn PasswordStore>) -> Self {
        Self {
            connection: Connection::new(config, passwords),
            ownership: None,
        }
    }
    async fn ready(
        &mut self,
        root: Option<&Path>,
    ) -> Result<(&mut Client, &mut Ownership, String), Error> {
        if self.ownership.is_none() {
            self.ownership = Some(match root {
                Some(root) => Ownership::open(root)?,
                None => Ownership::default(),
            });
        }
        let endpoint = self.connection.endpoint()?;
        Ok((
            self.connection.client().await?,
            self.ownership.as_mut().ok_or(Error::Storage)?,
            endpoint,
        ))
    }
}

impl NativeServices {
    pub async fn obs_status(&self) -> Result<bool, ErrorEnvelope> {
        let mut state = self.obs.lock().await;
        let result = match state.connection.client().await {
            Ok(client) => client.get_version().await.map(|_| true),
            Err(error) => Err(error),
        };
        if result.is_err() {
            state.connection.disconnect();
        }
        self.observe_obs(result.is_ok())?;
        result.map_err(obs_error)
    }
    pub(super) async fn connect_obs(&self, params: &ObsConnectParams) -> Result<(), ErrorEnvelope> {
        // Allocate inside the zeroizing owner, before waiting for the connection
        // lock. Cancellation or connection failure also clears this copy.
        let mut password = Zeroizing::new(String::new());
        password.push_str(&params.password);
        let mut state = self.obs.lock().await;
        state
            .connection
            .configure(&params.host, params.port, password, params.remember)
            .await
            .map_err(obs_error)?;
        self.observe_obs(true)
    }
    pub(super) fn observe_obs(&self, connected: bool) -> Result<(), ErrorEnvelope> {
        if self.obs_connected.swap(connected, Ordering::Relaxed) != connected
            && let Some(events) = self.events.get().and_then(Weak::upgrade)
        {
            events.publish(EventKind::ObsStatus)?;
        }
        Ok(())
    }
    pub async fn create_source(&self, params: &ObsSourceParams) -> Result<(), ErrorEnvelope> {
        if !self.render.owns_source(&self.overlay_url(), &params.url) {
            return Err(ErrorEnvelope::new(
                ErrorCode::Invalid,
                "source must use the owned overlay origin",
            ));
        }
        // Keep the existing status probe before source creation.
        self.obs_status().await?;
        let mut state = self.obs.lock().await;
        let (client, ownership, endpoint) = state
            .ready(self.obs_root.get().map(|p| p.as_path()))
            .await
            .map_err(obs_error)?;
        let result = ownership
            .create_source(
                client,
                &endpoint,
                &BrowserSource {
                    scene_name: params.scene_name.clone(),
                    source_name: params.source_name.clone(),
                    url: params.url.clone(),
                    width: params.width,
                    height: params.height,
                },
            )
            .await
            .map(|_| ());
        if result.is_err() {
            state.connection.disconnect();
        }
        self.observe_obs(result.is_ok())?;
        result.map_err(obs_error)
    }
    pub(super) async fn ensure_obs_scene(&self, scene: &str) -> Result<bool, ErrorEnvelope> {
        let mut state = self.obs.lock().await;
        let (client, ownership, endpoint) = state
            .ready(self.obs_root.get().map(|p| p.as_path()))
            .await
            .map_err(obs_error)?;
        let result = ownership.ensure_scene(client, &endpoint, scene).await;
        self.finish_obs(&mut state, result)
    }
    pub(super) async fn clear_obs_rehearsal(&self) -> Result<u32, ErrorEnvelope> {
        let mut state = self.obs.lock().await;
        let (client, ownership, endpoint) = state
            .ready(self.obs_root.get().map(|p| p.as_path()))
            .await
            .map_err(obs_error)?;
        let result = ownership.clear(client, &endpoint).await;
        self.finish_obs(&mut state, result)
    }
    fn finish_obs<T>(
        &self,
        state: &mut State,
        result: Result<T, Error>,
    ) -> Result<T, ErrorEnvelope> {
        if result.is_err() {
            state.connection.disconnect();
        }
        self.observe_obs(result.is_ok())?;
        result.map_err(obs_error)
    }
}
