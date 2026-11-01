use crate::{
    Clock, ConfigurationItem, DataStore, Error, LedgerKind, Result, STORE_INVENTORY, Storage,
    StoredItem, Timestamp, TwitchUserId, types::StoredRecord,
};
use fs2::FileExt;
use rusqlite::{Connection, OptionalExtension, params};
use std::{
    cell::{Cell, RefCell},
    collections::{BTreeMap, BTreeSet},
    fs::{self, File, OpenOptions},
    path::{Path, PathBuf},
    sync::Arc,
};

/// How far past the insert clock an item's `at` may sit before it is clamped.
const FUTURE_SKEW_S: i64 = 300;

pub struct Store {
    pub(crate) conn: Connection,
    pub(crate) root: PathBuf,
    pub(crate) ledger_lengths: BTreeMap<LedgerKind, u64>,
    pub(crate) ledger_fault: Cell<bool>,
    pub(crate) ledger_cache: RefCell<BTreeMap<LedgerKind, crate::ledger::CachedLedger>>,
    pub(crate) ledger_stats: Cell<crate::ledger::LedgerReadStats>,
    clock: Arc<dyn Clock>,
    _lock: File,
}

impl Store {
    /// One writer per directory, including across processes. The lock lasts until drop.
    pub fn open(root: impl AsRef<Path>) -> Result<Self> {
        let root = root.as_ref().to_owned();
        fs::create_dir_all(&root)?;
        let lock = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(root.join("writer.lock"))?;
        lock.try_lock_exclusive()?;
        let mut conn = Connection::open(root.join("store.sqlite3"))?;
        crate::migration::migrate(&mut conn)?;
        let mut store = Self {
            conn,
            root,
            _lock: lock,
            ledger_lengths: BTreeMap::new(),
            ledger_fault: Cell::new(false),
            ledger_cache: RefCell::new(BTreeMap::new()),
            ledger_stats: Cell::new(Default::default()),
            clock: Arc::new(crate::SystemClock),
        };
        if store.purge_pending()? {
            store.finish_purge()?;
        }
        for kind in LedgerKind::ALL {
            OpenOptions::new()
                .append(true)
                .create(true)
                .open(store.root.join(kind.filename()))?;
            store
                .ledger_lengths
                .insert(kind, fs::metadata(store.root.join(kind.filename()))?.len());
            store.read_ledger(kind)?;
        }
        store.verify_inventory()?;
        Ok(store)
    }

    /// Replaces the insert clock (default: the system clock), for tests and hosts.
    pub fn set_clock(&mut self, clock: Arc<dyn Clock>) {
        self.clock = clock;
    }

    /// Retention keys on `at`, so a far-future `at` would outlive the cap. An `at`
    /// beyond now plus FUTURE_SKEW_S is clamped to that bound (not rejected, so a
    /// skewed upstream timestamp still stores its item); earlier values are kept.
    fn bounded_at(&self, at: &Timestamp) -> Result<Timestamp> {
        let now = chrono::DateTime::parse_from_rfc3339(&self.clock.now().as_rfc3339())
            .map_err(|_| Error::Invalid("insert clock"))?;
        let limit = now
            .checked_add_signed(chrono::TimeDelta::seconds(FUTURE_SKEW_S))
            .ok_or(Error::Invalid("insert clock"))?;
        let limit = Timestamp::parse(&limit.to_utc().to_rfc3339())?;
        Ok(if *at > limit { limit } else { at.clone() })
    }

    pub(crate) fn ready(&self) -> Result<()> {
        if self.purge_pending()? {
            return Err(Error::PurgeIncomplete);
        }
        if self.ledger_fault.get() {
            return Err(Error::LedgerIntegrity);
        }
        Ok(())
    }

    /// Erasure of SQLite rows never touches a ledger, so a latched ledger fault
    /// must not block it; only an unfinished full purge does. Full purge itself
    /// finishes any pending purge first.
    pub(crate) fn erasure_ready(&self, request: &crate::Purge) -> Result<()> {
        if *request != crate::Purge::All && self.purge_pending()? {
            return Err(Error::PurgeIncomplete);
        }
        Ok(())
    }

    pub(crate) fn purge_pending(&self) -> Result<bool> {
        Ok(self
            .conn
            .query_row("SELECT EXISTS(SELECT 1 FROM purge_state)", [], |row| {
                row.get(0)
            })?)
    }

    pub fn map_user(&mut self, user_id: TwitchUserId, login: &str) -> Result<()> {
        self.ready()?;
        let login = crate::types::login(login)?;
        // Owner history: a reassigned login keeps the previous owner's row, so
        // that user's data stays reachable (forget_user_id). The newest row
        // for a login is its current owner.
        self.conn.execute(
            "INSERT INTO viewer_mappings (seq,user_id,login)
            VALUES ((SELECT COALESCE(MAX(seq),0)+1 FROM viewer_mappings),?1,?2)
            ON CONFLICT(user_id,login) DO UPDATE SET
              seq=(SELECT MAX(seq)+1 FROM viewer_mappings)",
            params![user_id.as_str(), login],
        )?;
        Ok(())
    }

    pub fn lookup_user(&self, login: &str) -> Result<Option<TwitchUserId>> {
        self.ready()?;
        let login = crate::types::login(login)?;
        let raw: Option<String> = self
            .conn
            .query_row(
                "SELECT user_id FROM viewer_mappings WHERE login=?1 ORDER BY seq DESC LIMIT 1",
                [login],
                |row| row.get(0),
            )
            .optional()?;
        raw.map(|id| TwitchUserId::parse(&id)).transpose()
    }

    pub fn insert(&mut self, store: DataStore, item: &StoredItem) -> Result<()> {
        self.ready()?;
        item.validate()?;
        for id in &item.user_ids {
            let mapped: bool = self.conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM viewer_mappings WHERE user_id=?1)",
                [id.as_str()],
                |row| row.get(0),
            )?;
            if !mapped {
                return Err(Error::Invalid("unmapped viewer association"));
            }
        }
        let mut item = item.clone();
        item.at = self.bounded_at(&item.at)?;
        self.insert_row(store, item.id, &item.at, &item.user_ids, &item)
    }

    /// Only explicitly allowlisted stores accept viewer-free configuration.
    /// Viewer data must continue through insert with every represented viewer ID.
    pub fn insert_configuration(
        &mut self,
        store: DataStore,
        item: &ConfigurationItem,
    ) -> Result<()> {
        self.ready()?;
        store.require_configuration()?;
        let mut item = item.clone();
        item.at = self.bounded_at(&item.at)?;
        self.insert_row(store, item.id, &item.at, &[], &item)
    }

    fn insert_row(
        &self,
        store: DataStore,
        id: ulid::Ulid,
        at: &Timestamp,
        user_ids: &[TwitchUserId],
        item: &impl serde::Serialize,
    ) -> Result<()> {
        let item_json = serde_json::to_string(item)?;
        let users_json = serde_json::to_string(user_ids)?;
        self.conn.execute(
            &format!(
                "INSERT INTO {} (id,at,user_ids,item) VALUES (?1,?2,?3,?4)",
                store.name()
            ),
            params![id.to_string(), at.as_rfc3339(), users_json, item_json],
        )?;
        Ok(())
    }

    pub fn items(&self, store: DataStore) -> Result<Vec<StoredItem>> {
        Ok(self
            .records(store)?
            .into_iter()
            .filter_map(|record| match record {
                StoredRecord::Viewer(item) => Some(item),
                StoredRecord::Configuration(_) => None,
            })
            .collect())
    }

    /// Separate reader keeps configuration content out of existing viewer-item consumers.
    pub fn configuration_items(&self, store: DataStore) -> Result<Vec<ConfigurationItem>> {
        self.ready()?;
        store.require_configuration()?;
        Ok(self
            .records(store)?
            .into_iter()
            .filter_map(|record| match record {
                StoredRecord::Configuration(item) => Some(item),
                StoredRecord::Viewer(_) => None,
            })
            .collect())
    }

    fn records(&self, store: DataStore) -> Result<Vec<StoredRecord>> {
        self.ready()?;
        let mut stmt = self
            .conn
            .prepare(&format!("SELECT item FROM {} ORDER BY id", store.name()))?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        rows.map(|row| {
            let item: StoredRecord = serde_json::from_str(&row?)?;
            item.validate(store)?;
            Ok(item)
        })
        .collect()
    }

    /// Fails closed if a new table or persistent file has no erasure policy.
    pub fn verify_inventory(&self) -> Result<()> {
        let expected: BTreeSet<&str> = STORE_INVENTORY
            .iter()
            .filter(|s| s.storage == Storage::SqliteTable)
            .map(|s| s.name)
            .collect();
        let mut stmt = self.conn.prepare(
            "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        )?;
        let actual = stmt
            .query_map([], |row| row.get::<_, String>(0))?
            .collect::<std::result::Result<BTreeSet<_>, _>>()?;
        if expected != actual.iter().map(String::as_str).collect() {
            return Err(Error::InventoryMismatch);
        }
        for entry in fs::read_dir(&self.root)? {
            let entry = entry?;
            let name = entry.file_name();
            if !entry.file_type()?.is_file()
                || !STORE_INVENTORY
                    .iter()
                    .any(|s| s.storage != Storage::SqliteTable && Some(s.name) == name.to_str())
            {
                return Err(Error::InventoryMismatch);
            }
        }
        Ok(())
    }
}
