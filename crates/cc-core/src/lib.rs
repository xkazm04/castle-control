//! Local authenticated RPC and resumable invalidation events. No overlay routes.
mod auth;
mod events;
mod registry;
mod server;

pub use events::EventHub;
pub use registry::{Module, Registry, StatusModule};
pub use server::{AppState, bind, router};
