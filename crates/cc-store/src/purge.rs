use crate::{
    Error, ForgetPolicy, LedgerKind, PurgePolicy, Result, STORE_INVENTORY, Storage, Store,
    StoreSpec, Timestamp,
};
use rusqlite::{Connection, OptionalExtension, TransactionBehavior, params_from_iter};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, fs::OpenOptions, path::Path};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    content = "login",
    rename_all = "snake_case",
    deny_unknown_fields
)]
pub enum Purge {
    ForgetUser(String),
    ExpiredRecordings,
    All,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct PurgePreview {
    pub request: Purge,
    pub as_of: Timestamp,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cutoff: Option<Timestamp>,
    pub counts: BTreeMap<String, u64>,
}

struct Plan {
    preview: PurgePreview,
    user_id: Option<String>,
}

impl Plan {
    fn new(conn: &Connection, request: Purge, as_of: Timestamp) -> Result<Self> {
        let (request, user_id, cutoff) = match request {
            Purge::ForgetUser(login) => {
                let login = crate::types::login(&login)?;
                let user_id = conn
                    .query_row(
                        "SELECT user_id FROM viewer_mappings WHERE login=?1",
                        [&login],
                        |row| row.get(0),
                    )
                    .optional()?;
                (Purge::ForgetUser(login), user_id, None)
            }
            Purge::ExpiredRecordings => {
                let cap = crate::retention::retention_s(conn)?;
                let cutoff = as_of.subtract_s(cap)?;
                (Purge::ExpiredRecordings, None, Some(cutoff))
            }
            Purge::All => (Purge::All, None, None),
        };
        Ok(Self {
            preview: PurgePreview {
                request,
                as_of,
                cutoff,
                counts: BTreeMap::new(),
            },
            user_id,
        })
    }

    // Shared by dry-run count and deletion. Names come only from the static inventory.
    fn predicate(&self, spec: &StoreSpec) -> (&'static str, Vec<String>) {
        match &self.preview.request {
            Purge::All if spec.purge_all == PurgePolicy::DeleteRows => ("1", vec![]),
            Purge::ForgetUser(_) => match (&self.user_id, spec.forget_user) {
                (Some(id), ForgetPolicy::DeleteMapping) => ("user_id=?1", vec![id.clone()]),
                (Some(id), ForgetPolicy::DeleteAssociatedItem) => (
                    "EXISTS (SELECT 1 FROM json_each(user_ids) WHERE value=?1)",
                    vec![id.clone()],
                ),
                _ => ("0", vec![]),
            },
            Purge::ExpiredRecordings if spec.name == "recordings" => match &self.preview.cutoff {
                Some(cutoff) => ("at < ?1", vec![cutoff.as_rfc3339()]),
                None => ("0", vec![]),
            },
            _ => ("0", vec![]),
        }
    }

    fn count(&mut self, conn: &Connection, root: &Path) -> Result<()> {
        for spec in STORE_INVENTORY {
            let count = match spec.storage {
                Storage::SqliteTable => {
                    let (predicate, values) = self.predicate(spec);
                    let count: i64 = conn.query_row(
                        &format!("SELECT COUNT(*) FROM {} WHERE {predicate}", spec.name),
                        params_from_iter(values),
                        |row| row.get(0),
                    )?;
                    u64::try_from(count).map_err(|_| Error::Invalid("store count"))?
                }
                Storage::Jsonl if self.preview.request == Purge::All => {
                    crate::ledger::count_frames(&root.join(spec.name))?
                }
                _ => 0,
            };
            self.preview.counts.insert(spec.name.to_owned(), count);
        }
        Ok(())
    }

    fn delete_rows(&self, conn: &Connection) -> Result<()> {
        for spec in STORE_INVENTORY
            .iter()
            .filter(|s| s.storage == Storage::SqliteTable)
        {
            let (predicate, values) = self.predicate(spec);
            conn.execute(
                &format!("DELETE FROM {} WHERE {predicate}", spec.name),
                params_from_iter(values),
            )?;
        }
        Ok(())
    }
}

impl Store {
    pub fn preview(&self, request: Purge, as_of: Timestamp) -> Result<PurgePreview> {
        if request != Purge::All {
            self.ready()?;
        }
        self.verify_inventory()?;
        let tx = self.conn.unchecked_transaction()?;
        let mut plan = Plan::new(&tx, request, as_of)?;
        plan.count(&tx, &self.root)?;
        tx.commit()?;
        Ok(plan.preview)
    }

    fn execute_purge(&mut self, request: Purge, as_of: Timestamp) -> Result<PurgePreview> {
        if request != Purge::All {
            self.ready()?;
        }
        self.verify_inventory()?;
        let tx = self
            .conn
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let mut plan = Plan::new(&tx, request, as_of)?;
        plan.count(&tx, &self.root)?;
        if plan.preview.request == Purge::All {
            tx.execute("INSERT INTO purge_state (id) VALUES (1)", [])?;
        }
        plan.delete_rows(&tx)?;
        tx.commit()?;
        if plan.preview.request == Purge::All {
            self.finish_purge()?;
        }
        Ok(plan.preview)
    }

    pub fn forget_user(&mut self, login: &str, as_of: Timestamp) -> Result<PurgePreview> {
        self.execute_purge(Purge::ForgetUser(login.to_owned()), as_of)
    }

    pub fn purge_expired(&mut self, as_of: Timestamp) -> Result<PurgePreview> {
        self.execute_purge(Purge::ExpiredRecordings, as_of)
    }

    /// cc-core must call this on bridge authorization revocation; no bridge dependency here.
    pub fn purge_all(&mut self, as_of: Timestamp) -> Result<PurgePreview> {
        if self.purge_pending()? {
            self.finish_purge()?;
        }
        self.execute_purge(Purge::All, as_of)
    }

    pub(crate) fn finish_purge(&mut self) -> Result<()> {
        // Idempotently finish after a crash or I/O error, before serving data again.
        let tx = self
            .conn
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        for spec in STORE_INVENTORY
            .iter()
            .filter(|s| s.purge_all == PurgePolicy::DeleteRows)
        {
            tx.execute(&format!("DELETE FROM {}", spec.name), [])?;
        }
        tx.commit()?;
        for kind in LedgerKind::ALL {
            let file = OpenOptions::new()
                .write(true)
                .create(true)
                .truncate(true)
                .open(self.root.join(kind.filename()))?;
            file.sync_all()?;
            self.ledger_lengths.insert(kind, 0);
        }
        self.conn.execute("DELETE FROM purge_state", [])?;
        self.ledger_fault.set(false);
        Ok(())
    }
}
