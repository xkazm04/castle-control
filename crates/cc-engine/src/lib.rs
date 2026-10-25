//! Offline-prepared engine. No connection to the live bridge or application.
mod admission;
mod api;
mod claude_cli;
mod cli;
mod codex_cli;
mod engine;
mod floor;
mod health;
mod ladder;
mod ledger;
mod limits;
mod model;
#[cfg(test)]
mod parser_tests;
mod process;
mod process_tree;
mod stream;

pub use admission::{Evidence, LatencySample};
pub use api::{CLOUD_NOTICE, Endpoint};
pub use cc_store::{EngineClass, EngineProvider, ModelName};
pub use cli::{CliExecutables, CliRuntime};
pub use engine::{Call, Engine};
pub use floor::{FloorCase, FloorReport, measure_floor, measure_floor_with_key, simulated_bank};
pub use health::Probe;
pub use ladder::{Outcome, Reply};
pub use limits::{Failure, Result};
pub use model::{Prices, Route, RoutingTable, Transport};
pub use process::{Keychain, NoKeychain, SpawnDoor};
