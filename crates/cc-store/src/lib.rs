//! Local viewer data with explicit erasure and append-only audit ledgers.

mod error;
mod inventory;
mod ledger;
mod migration;
mod purge;
mod retention;
mod store;
mod types;

pub use error::{Error, Result};
pub use inventory::{DataStore, ForgetPolicy, PurgePolicy, STORE_INVENTORY, Storage, StoreSpec};
pub use ledger::{DecisionAction, LedgerEvent, LedgerKind, LedgerLine};
pub use purge::{Purge, PurgePreview};
pub use retention::{Clock, SystemClock, run_retention_job, spawn_retention_task};
pub use store::Store;
pub use types::{StoredItem, Timestamp, TwitchUserId};

pub const MIN_RETENTION_S: u64 = 24 * 60 * 60;
pub const DEFAULT_RETENTION_S: u64 = 30 * 24 * 60 * 60;
