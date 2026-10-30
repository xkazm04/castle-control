use crate::{DataStore, Error, Result};
use rusqlite::Connection;

pub(crate) fn migrate(conn: &mut Connection) -> Result<()> {
    conn.busy_timeout(std::time::Duration::from_secs(5))?;
    conn.execute_batch(
        "PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA secure_delete=ON;",
    )?;
    let version: u32 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    if version > 2 {
        return Err(Error::NewerSchema);
    }
    if version == 2 {
        return Ok(());
    }
    let tx = conn.transaction()?;
    if version == 0 {
        tx.execute_batch(
        "CREATE TABLE viewer_mappings (user_id TEXT NOT NULL, login TEXT PRIMARY KEY NOT NULL);
         CREATE TABLE settings (key TEXT PRIMARY KEY CHECK(key='retention_s'), value INTEGER NOT NULL CHECK(value>=86400));
         CREATE TABLE purge_state (id INTEGER PRIMARY KEY CHECK(id=1));"
    )?;
        for store in DataStore::ALL {
            tx.execute_batch(&format!(
            "CREATE TABLE {} (id TEXT PRIMARY KEY NOT NULL, at TEXT NOT NULL,
             user_ids TEXT NOT NULL CHECK(json_valid(user_ids)), item TEXT NOT NULL CHECK(json_valid(item)));
             CREATE INDEX {}_at ON {} (at);", store.name(), store.name(), store.name()
        ))?;
        }
    }
    // Preserve v1's INTEGER retention table and constraints exactly. Engine
    // settings have a separate closed key inventory and JSON data values.
    let keys = crate::ENGINE_SETTING_KEYS
        .iter()
        .map(|key| format!("'{key}'"))
        .collect::<Vec<_>>()
        .join(",");
    tx.execute_batch(&format!(
        "CREATE TABLE engine_settings (
         key TEXT PRIMARY KEY NOT NULL CHECK(key IN ({keys})),
         value TEXT NOT NULL CHECK(json_valid(value)));"
    ))?;
    tx.pragma_update(None, "user_version", 2)?;
    tx.commit()?;
    Ok(())
}
