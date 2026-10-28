#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DataStore {
    Recordings,
    Rollups,
    Caches,
    Exports,
    Writs,
}

/// Viewer-free records require an explicit configuration-store policy here.
/// Writs keep DeleteAssociatedItem on forget and DeleteRows on full/revoked purge.
pub const CONFIGURATION_STORES: &[DataStore] = &[DataStore::Writs];

impl DataStore {
    pub fn allows_configuration(self) -> bool {
        CONFIGURATION_STORES.contains(&self)
    }

    pub(crate) fn require_configuration(self) -> crate::Result<()> {
        if self.allows_configuration() {
            Ok(())
        } else {
            Err(crate::Error::ConfigurationStoreNotAllowed(self))
        }
    }

    pub const ALL: [Self; 5] = [
        Self::Recordings,
        Self::Rollups,
        Self::Caches,
        Self::Exports,
        Self::Writs,
    ];
    pub const fn name(self) -> &'static str {
        match self {
            Self::Recordings => "recordings",
            Self::Rollups => "rollups",
            Self::Caches => "caches",
            Self::Exports => "exports",
            Self::Writs => "writs",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Storage {
    SqliteTable,
    Jsonl,
    ControlFile,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ForgetPolicy {
    DeleteAssociatedItem,
    DeleteMapping,
    Keep,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PurgePolicy {
    DeleteRows,
    TruncateLedger,
    KeepControl,
}

#[derive(Clone, Copy, Debug)]
pub struct StoreSpec {
    pub name: &'static str,
    pub storage: Storage,
    pub forget_user: ForgetPolicy,
    pub purge_all: PurgePolicy,
}

use ForgetPolicy::{DeleteAssociatedItem, DeleteMapping, Keep};
use PurgePolicy::{DeleteRows, KeepControl, TruncateLedger};
use Storage::{ControlFile, Jsonl, SqliteTable};

/// Complete inventory. Controls contain no viewer data; the journal is transient.
pub const STORE_INVENTORY: &[StoreSpec] = &[
    StoreSpec {
        name: "recordings",
        storage: SqliteTable,
        forget_user: DeleteAssociatedItem,
        purge_all: DeleteRows,
    },
    StoreSpec {
        name: "rollups",
        storage: SqliteTable,
        forget_user: DeleteAssociatedItem,
        purge_all: DeleteRows,
    },
    StoreSpec {
        name: "caches",
        storage: SqliteTable,
        forget_user: DeleteAssociatedItem,
        purge_all: DeleteRows,
    },
    StoreSpec {
        name: "exports",
        storage: SqliteTable,
        forget_user: DeleteAssociatedItem,
        purge_all: DeleteRows,
    },
    StoreSpec {
        name: "writs",
        storage: SqliteTable,
        // Empty associations of allowlisted configuration writs never match forget.
        // Viewer-bearing writs still match any associated ID; full purge deletes both.
        forget_user: DeleteAssociatedItem,
        purge_all: DeleteRows,
    },
    StoreSpec {
        name: "viewer_mappings",
        storage: SqliteTable,
        forget_user: DeleteMapping,
        purge_all: DeleteRows,
    },
    StoreSpec {
        name: "settings",
        storage: SqliteTable,
        forget_user: Keep,
        purge_all: DeleteRows,
    },
    StoreSpec {
        name: "purge_state",
        storage: SqliteTable,
        forget_user: Keep,
        purge_all: KeepControl,
    },
    StoreSpec {
        name: "decisions.jsonl",
        storage: Jsonl,
        forget_user: Keep,
        purge_all: TruncateLedger,
    },
    StoreSpec {
        name: "draws.jsonl",
        storage: Jsonl,
        forget_user: Keep,
        purge_all: TruncateLedger,
    },
    StoreSpec {
        name: "engine.jsonl",
        storage: Jsonl,
        forget_user: Keep,
        purge_all: TruncateLedger,
    },
    StoreSpec {
        name: "store.sqlite3",
        storage: ControlFile,
        forget_user: Keep,
        purge_all: KeepControl,
    },
    StoreSpec {
        name: "store.sqlite3-journal",
        storage: ControlFile,
        forget_user: Keep,
        purge_all: KeepControl,
    },
    StoreSpec {
        name: "writer.lock",
        storage: ControlFile,
        forget_user: Keep,
        purge_all: KeepControl,
    },
];
