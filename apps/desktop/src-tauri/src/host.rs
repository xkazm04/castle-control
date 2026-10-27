use crate::launch::Launch;
use crate::options::Options;
use cc_core::{AppState, NativeConfig, NativeServices, Registry, bind, desktop_login_presenter};
use std::{net::SocketAddr, path::Path, sync::Arc};
use tokio::task::JoinHandle;

const EVENT_CAPACITY: usize = 1024;

pub struct CoreHost {
    pub state: Arc<AppState>,
    pub address: SocketAddr,
    server: JoinHandle<std::io::Result<()>>,
    // Retain the adapters for the complete window lifetime, without revoking or
    // purging the user's authorization when an ordinary window closes.
    _services: Option<Arc<NativeServices>>,
    login: Option<JoinHandle<()>>,
    steward_live: bool,
}

impl CoreHost {
    pub async fn start(options: Options, data_dir: &Path) -> Result<Self, &'static str> {
        let services = if let Some(native) = options.native {
            let store = cc_store::Store::open(data_dir).map_err(|_| "desktop store unavailable")?;
            Some(
                NativeServices::new(
                    NativeConfig {
                        twitch: cc_twitch::TwitchConfig {
                            client_id: native.client_id,
                            channel: native.test_channel,
                            modules: vec!["gatehouse".into()],
                        },
                        obs: cc_obs::Config {
                            port: native.obs_port,
                            password_label: native.obs_password_label,
                        },
                        overlay_port: 0,
                    },
                    store,
                    desktop_login_presenter(),
                )
                .await
                .map_err(|_| "desktop native services unavailable")?,
            )
        } else {
            None
        };
        let state = match &services {
            Some(services) => services.app(EVENT_CAPACITY),
            None => AppState::new(Registry::with_status(), EVENT_CAPACITY),
        }
        .map_err(|_| "desktop core setup failed")?;
        let (address, server) = bind(state.clone(), ([127, 0, 0, 1], 0).into())
            .await
            .map_err(|_| "desktop core bind failed")?;
        let login = services.as_ref().filter(|_| options.login).map(|services| {
            let services = services.clone();
            tokio::spawn(async move {
                if services.start_login().await.is_err() {
                    // Fixed diagnostic only: never a challenge, token or upstream body.
                    tracing::error!("desktop Twitch login unavailable");
                }
            })
        });
        tracing::info!("desktop core ready");
        Ok(Self {
            state,
            address,
            server: tokio::spawn(server),
            _services: services,
            login,
            steward_live: options.steward_live,
        })
    }

    pub fn launch(&self) -> Result<Launch<'_>, &'static str> {
        Launch::core(self.address, self.state.session_token(), self.steward_live)
    }

    pub fn shutdown(&self) {
        self.state.shutdown();
        if let Some(login) = &self.login {
            login.abort();
        }
    }
}

impl Drop for CoreHost {
    fn drop(&mut self) {
        self.shutdown();
        self.server.abort();
    }
}

#[cfg(test)]
#[path = "host_tests.rs"]
mod tests;
