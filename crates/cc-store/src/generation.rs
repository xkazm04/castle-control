//! Erasure generation, persisted in the SQLite header (`application_id`, which is
//! otherwise unused) so it changes inside the same transaction as the delete and
//! is visible to any handle or process opening the same database.
//! `PRAGMA data_version` is not enough: it ignores commits made by the same
//! connection, which is exactly where forget/purge run.
//!
//! Two 16-bit counters share the word. The high half moves on every erasure of
//! viewer-derived data (forget, purge-all, purge recovery). The low half moves
//! only when retention expiry actually deleted a raw recording; expiry runs on
//! every live capture and touches neither Caches nor the ledgers, so derived
//! caches that ignore recordings must not be invalidated by it.
use crate::{Result, Store};
use rusqlite::Connection;

#[derive(Clone, Copy)]
pub(crate) enum Erased {
    /// Viewer-derived data (mappings, Caches, ledgers) may have been deleted.
    Viewer,
    /// Only expired raw recordings were deleted.
    Recordings,
}

fn read(conn: &Connection) -> Result<u32> {
    let raw: i32 = conn.query_row("PRAGMA application_id", [], |row| row.get(0))?;
    Ok(u32::from_ne_bytes(raw.to_ne_bytes()))
}

/// Call inside every transaction that deletes data.
pub(crate) fn bump(conn: &Connection, erased: Erased) -> Result<()> {
    let word = read(conn)?;
    let (high, low) = (word >> 16, word & 0xffff);
    let (high, low) = match erased {
        Erased::Viewer => (high.wrapping_add(1) & 0xffff, low),
        Erased::Recordings => (high, low.wrapping_add(1) & 0xffff),
    };
    let next = i32::from_ne_bytes(((high << 16) | low).to_ne_bytes());
    conn.pragma_update(None, "application_id", next)?;
    Ok(())
}

impl Store {
    /// Changes on every erasure path, including retention expiry that deleted
    /// rows. Compare for equality only.
    pub fn erasure_generation(&self) -> Result<u32> {
        read(&self.conn)
    }

    /// Changes on every erasure except retention expiry of raw recordings, so a
    /// cache derived from Caches/ledgers/mappings stays valid across expiry.
    pub fn viewer_erasure_generation(&self) -> Result<u32> {
        Ok(read(&self.conn)? >> 16)
    }
}
