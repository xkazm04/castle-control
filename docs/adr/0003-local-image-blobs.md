# Local draw images as content-addressed SQLite blobs

Accepted 2026-10-31 for owner rulings 2 and 5 (contract and local storage only).

Store uploaded images in the app-data `store.sqlite3` database, in migration v3's
`image_assets` table. The key is SHA-256 of the exact bytes. Identical uploads
deduplicate; reads verify the digest and content signature before returning data.
SQLite transactions cover the asset bytes and identity together, avoiding orphan
files and a second filesystem lifecycle. No caller-supplied path is resolved.

`lots.image.upload` accepts canonical lowercase hexadecimal content, with a decoded
2 MiB cap. Hex is larger than base64 but lets standard JSON Schema enforce the
same signature checks and size bound as Rust, without custom validator plugins.
PNG's eight-byte signature, JPEG's FF D8 FF prefix, and RIFF/WEBP with VP8, VP8L or
VP8X are the only accepted signatures. Identification does not prove that an image
fully decodes; future consumers must decode with resource limits. MIME labels,
filenames, remote URLs and filesystem paths are never upload inputs.

Draw configuration holds an optional `LocalImageRef` digest. It conveys no network
access or script privilege. Upload and draw mutation handlers, room persistence,
image serving and rendering belong to subsequent deliveries. The store's existing
caller supplies the app-data root; this delivery introduces no second location.

The inventory treats uploaded images as viewer-free streamer configuration:
forget-user leaves them intact, while full/revoked-authorization purge deletes the
actual blob rows. Existing v1/v2 settings, ledgers and records survive migration.
Tests cover migration, deduplication, reopening, byte bounds, corruption, full purge
and rejection of traversal/remote references without filesystem access.
