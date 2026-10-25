#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("SQLite operation failed: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("filesystem operation failed: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON schema or serialization failed: {0}")]
    Json(#[from] serde_json::Error),
    #[error("invalid {0}")]
    Invalid(&'static str),
    #[error("retention {requested_s}s is below the {floor_s}s floor")]
    RetentionBelowFloor { requested_s: u64, floor_s: u64 },
    #[error("store inventory does not match persistent storage")]
    InventoryMismatch,
    #[error("ledger integrity check failed")]
    LedgerIntegrity,
    #[error("a purge is unfinished; retry purge_all or reopen the store")]
    PurgeIncomplete,
    #[error("store mutex poisoned")]
    LockPoisoned,
    #[error("store schema version is newer than this library")]
    NewerSchema,
    #[error("retention worker failed: {0}")]
    Worker(#[from] tokio::task::JoinError),
}

pub type Result<T> = std::result::Result<T, Error>;
