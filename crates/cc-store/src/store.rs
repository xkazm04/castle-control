use crate::{
    DataStore, Error, LedgerKind, Result, STORE_INVENTORY, Storage, StoredItem, TwitchUserId,
};
use fs2::FileExt;
use rusqlite::{Connection, OptionalExtension, params};
use std::{
    cell::Cell,
    collections::{BTreeMap, BTreeSet},
    fs::{self, File, OpenOptions},
    path::{Path, PathBuf},
};

pub struct Store {
    pub(crate) conn: Connection,
    pub(crate) root: PathBuf,
    pub(crate) ledger_lengths: BTreeMap<LedgerKind, u64>,
    pub(crate) ledger_fault: Cell<bool>,
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
        };
        if store.purge_pending()? {
            store.finish_purge()?;
        }
        for kind in LedgerKind::ALL {
            OpenOptions::new()
                .append(true)
                .create(true)
                .open(store.root.join(kind.filename()))?;
            store.read_ledger(kind)?;
            store
                .ledger_lengths
                .insert(kind, fs::metadata(store.root.join(kind.filename()))?.len());
        }
        store.verify_inventory()?;
        Ok(store)
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
        // Keep prior login aliases until forget_user, so old recordings remain findable.
        self.conn.execute(
            "INSERT INTO viewer_mappings (user_id,login) VALUES (?1,?2)
            ON CONFLICT(login) DO UPDATE SET user_id=excluded.user_id",
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
                "SELECT user_id FROM viewer_mappings WHERE login=?1",
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
        let item_json = serde_json::to_string(item)?;
        let users_json = serde_json::to_string(&item.user_ids)?;
        self.conn.execute(
            &format!(
                "INSERT INTO {} (id,at,user_ids,item) VALUES (?1,?2,?3,?4)",
                store.name()
            ),
            params![
                item.id.to_string(),
                item.at.as_rfc3339(),
                users_json,
                item_json
            ],
        )?;
        Ok(())
    }

    pub fn items(&self, store: DataStore) -> Result<Vec<StoredItem>> {
        self.ready()?;
        let mut stmt = self
            .conn
            .prepare(&format!("SELECT item FROM {} ORDER BY id", store.name()))?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        rows.map(|row| {
            let item: StoredItem = serde_json::from_str(&row?)?;
            item.validate()?;
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
