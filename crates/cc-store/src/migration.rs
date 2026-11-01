use crate::{DataStore, Error, Result};
use rusqlite::Connection;

pub(crate) fn migrate(conn: &mut Connection) -> Result<()> {
    conn.busy_timeout(std::time::Duration::from_secs(5))?;
    conn.execute_batch(
        "PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA secure_delete=ON;",
    )?;
    let version: u32 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    if version > 4 {
        return Err(Error::NewerSchema);
    }
    if version == 4 {
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
    if version < 2 {
        let keys = cc_types::ENGINE_SETTING_KEYS
            .iter()
            .map(|key| format!("'{key}'"))
            .collect::<Vec<_>>()
            .join(",");
        tx.execute_batch(&format!(
            "CREATE TABLE engine_settings (
         key TEXT PRIMARY KEY NOT NULL CHECK(key IN ({keys})),
         value TEXT NOT NULL CHECK(json_valid(value)));"
        ))?;
    }
    // Uploaded images are viewer-free configuration. BLOBs avoid a second
    // filesystem lifecycle and any caller-controlled path resolution.
    if version < 3 {
        tx.execute_batch(&format!(
            "CREATE TABLE image_assets (
         digest TEXT PRIMARY KEY NOT NULL CHECK(length(digest)=64 AND digest NOT GLOB '*[^0-9a-f]*'),
         content BLOB NOT NULL CHECK(typeof(content)='blob' AND length(content) BETWEEN 3 AND {}));",
            cc_types::LOCAL_IMAGE_MAX_BYTES
        ))?;
    }
    // v4 keeps owner history: a login reassigned to another user adds a row
    // instead of replacing one. `seq` orders ownership; the highest seq for a
    // login is its current owner. Same table name, so the erasure inventory
    // (forget: DeleteMapping, purge: DeleteRows) is unchanged. Existing rows
    // keep their relative order.
    tx.execute_batch(
        "CREATE TABLE viewer_mappings_v4 (
         seq INTEGER PRIMARY KEY NOT NULL,
         user_id TEXT NOT NULL,
         login TEXT NOT NULL,
         UNIQUE (user_id, login));
         INSERT INTO viewer_mappings_v4 (user_id, login)
           SELECT user_id, login FROM viewer_mappings ORDER BY rowid;
         DROP TABLE viewer_mappings;
         ALTER TABLE viewer_mappings_v4 RENAME TO viewer_mappings;
         CREATE INDEX viewer_mappings_login ON viewer_mappings (login, seq);
         CREATE INDEX viewer_mappings_user ON viewer_mappings (user_id);",
    )?;
    tx.pragma_update(None, "user_version", 4)?;
    tx.commit()?;
    Ok(())
}
