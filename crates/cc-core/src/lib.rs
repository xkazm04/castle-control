//! Local authenticated RPC and resumable invalidation events. No overlay routes.
mod auth;
pub mod beacons;
mod events;
pub mod gatehouse;
mod ingress;
mod integration;
mod login;
pub mod lots;
mod offline;
mod registry;
mod server;
pub mod spike;
#[cfg(feature = "spike")]
mod spike_run;
#[cfg(feature = "spike")]
pub use spike_run::run as run_spike;

pub use events::EventHub;
pub use ingress::{ChatIngress, bridge_status, forward_bridge_event};
pub use integration::{NativeConfig, NativeServices};
pub use login::{LoginPresenter, desktop_login_presenter};
pub use registry::{Module, Registry, StatusModule};
pub use server::{AppState, bind, router};
