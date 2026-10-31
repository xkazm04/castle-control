//! Content-addressed blobs live inside store.sqlite3, under Store's app-data root.
//! No filesystem path, filename or MIME value ever comes from an upload.
use crate::{Error, Result, Store};
use cc_types::{LocalImageContent, LocalImageRef};
use rusqlite::{OptionalExtension, params};
use sha2::{Digest, Sha256};

impl Store {
    pub fn store_image(&mut self, content: &LocalImageContent) -> Result<LocalImageRef> {
        self.ready()?;
        let digest = format!("{:x}", Sha256::digest(content.as_bytes()));
        let reference = LocalImageRef::try_from(digest.clone()).map_err(Error::Invalid)?;
        // Identical bytes deduplicate; an existing digest must not hide corruption.
        if let Some(existing) = self.load_image(&digest)? {
            if &existing != content {
                return Err(Error::Invalid("image digest collision"));
            }
            return Ok(reference);
        }
        self.conn.execute(
            "INSERT INTO image_assets (digest, content) VALUES (?1, ?2)",
            params![digest, content.as_bytes()],
        )?;
        Ok(reference)
    }

    /// Parses the reference even for local callers. Traversal, URLs and absolute
    /// paths are refused before any storage lookup; this never opens a file.
    pub fn load_image(&self, reference: &str) -> Result<Option<LocalImageContent>> {
        self.ready()?;
        LocalImageRef::try_from(reference.to_owned()).map_err(Error::Invalid)?;
        let bytes: Option<Vec<u8>> = self
            .conn
            .query_row(
                "SELECT content FROM image_assets WHERE digest=?1",
                [reference],
                |row| row.get(0),
            )
            .optional()?;
        bytes
            .map(|bytes| {
                if format!("{:x}", Sha256::digest(&bytes)) != reference {
                    return Err(Error::Invalid("stored image digest"));
                }
                LocalImageContent::try_from(bytes).map_err(Error::Invalid)
            })
            .transpose()
    }
}
