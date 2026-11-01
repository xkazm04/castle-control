mod common;

use cc_store::{Error, LedgerKind, Store};
use common::*;
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::Path,
    time::Duration,
};

const KIND: LedgerKind = LedgerKind::Decisions;

fn filled(dir: &Path, n: u128) -> Store {
    let mut store = Store::open(dir).unwrap();
    for i in 0..n {
        store.append_ledger(at(1), at(2), decision(i + 1)).unwrap();
    }
    store
}

// A change made by another handle carries a newer mtime, as any real write does.
fn bump_mtime(path: &Path) {
    let file = OpenOptions::new().write(true).open(path).unwrap();
    let now = file.metadata().unwrap().modified().unwrap();
    file.set_modified(now + Duration::from_secs(2)).unwrap();
}

#[test]
fn repeated_reads_verify_once_and_appends_extend_the_cache() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = filled(dir.path(), 50);
    assert_eq!(store.read_ledger(KIND).unwrap().len(), 50);
    let base = store.ledger_read_stats();
    for _ in 0..20 {
        assert_eq!(store.read_ledger(KIND).unwrap().len(), 50);
    }
    for i in 0..20 {
        store
            .append_ledger(at(3), at(4), decision(100 + i))
            .unwrap();
        assert_eq!(store.read_ledger(KIND).unwrap().len(), 51 + i as usize);
    }
    let after = store.ledger_read_stats();
    assert_eq!(after.full_verifications, base.full_verifications);
    assert_eq!(after.bytes_read, base.bytes_read);
    assert_eq!(after.lines_verified, base.lines_verified);
    assert_eq!(after.cache_hits - base.cache_hits, 40);
    // The extended cache equals a cold full verification of the same file.
    let warm = store.read_ledger(KIND).unwrap();
    drop(store);
    let cold = Store::open(dir.path()).unwrap().read_ledger(KIND).unwrap();
    assert_eq!(cold, warm);
}

#[test]
fn same_length_change_by_another_handle_is_detected() {
    let dir = tempfile::tempdir().unwrap();
    let store = filled(dir.path(), 5);
    let path = dir.path().join(KIND.filename());
    let mut bytes = fs::read(&path).unwrap();
    assert_eq!(store.read_ledger(KIND).unwrap().len(), 5);
    // Flip one digest character, keeping the length.
    bytes[11] = if bytes[11] == b'0' { b'1' } else { b'0' };
    fs::write(&path, &bytes).unwrap();
    bump_mtime(&path);
    assert!(matches!(
        store.read_ledger(KIND),
        Err(Error::LedgerIntegrity)
    ));
}

#[test]
fn truncation_or_appended_junk_by_another_handle_is_detected() {
    for junk in [false, true] {
        let dir = tempfile::tempdir().unwrap();
        let store = filled(dir.path(), 5);
        let path = dir.path().join(KIND.filename());
        assert_eq!(store.read_ledger(KIND).unwrap().len(), 5);
        if junk {
            let mut file = OpenOptions::new().append(true).open(&path).unwrap();
            file.write_all(b"{}\n").unwrap();
        } else {
            let len = fs::metadata(&path).unwrap().len();
            let file = OpenOptions::new().write(true).open(&path).unwrap();
            file.set_len(len - 7).unwrap();
        }
        assert!(store.read_ledger(KIND).is_err());
    }
}

#[test]
fn erasure_invalidates_the_cache() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = filled(dir.path(), 5);
    assert_eq!(store.read_ledger(KIND).unwrap().len(), 5);
    store.purge_all(at(9)).unwrap();
    assert!(store.read_ledger(KIND).unwrap().is_empty());
    store.append_ledger(at(10), at(11), decision(1)).unwrap();
    assert_eq!(store.read_ledger(KIND).unwrap().len(), 1);
}
