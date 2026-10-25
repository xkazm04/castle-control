use super::*;

#[test]
fn seal_audit_failure_returns_no_castable_value() {
    let dir = SimulatedDir::new();
    let mut store = Store::open(&dir.0).unwrap();
    let mut roll = Roll::new(rules()).unwrap();
    add(&mut roll, message(1, 0));
    std::fs::remove_file(dir.0.join("draws.jsonl")).unwrap();
    let result = seal_roll(
        roll,
        &guard(),
        at(1),
        1,
        SealSource::StreamerCommit(SealedRoll::commitment(&[1; 32])),
        &mut store,
        timestamp(2),
    );
    assert!(matches!(result, Err(Error::Store(_))));
    assert!(!dir.0.join("draws.jsonl").exists());
}

#[test]
fn cast_into_a_different_store_cannot_record_an_orphan_draw() {
    let first_dir = SimulatedDir::new();
    let second_dir = SimulatedDir::new();
    let mut first = Store::open(&first_dir.0).unwrap();
    let mut second = Store::open(&second_dir.0).unwrap();
    let mut roll = Roll::new(rules()).unwrap();
    add(&mut roll, message(1, 0));
    let sealed = seal(roll, [1; 32], &mut first);
    let result = cast_streamer(sealed, [1; 32], at(2), &mut second, timestamp(3));
    assert!(matches!(
        result,
        Err(Error::Invalid("seal audit is missing from draw store"))
    ));
    assert_only_seals(&first, 1);
    assert!(second.read_ledger(LedgerKind::Draws).unwrap().is_empty());
}

#[test]
fn cast_after_full_purge_cannot_record_an_orphan_draw() {
    let dir = SimulatedDir::new();
    let mut store = Store::open(&dir.0).unwrap();
    let mut roll = Roll::new(rules()).unwrap();
    add(&mut roll, message(1, 0));
    let sealed = seal(roll, [1; 32], &mut store);
    store.purge_all(timestamp(2)).unwrap();
    let result = cast_streamer(sealed, [1; 32], at(2), &mut store, timestamp(3));
    assert!(matches!(
        result,
        Err(Error::Invalid("seal audit is missing from draw store"))
    ));
    assert!(store.read_ledger(LedgerKind::Draws).unwrap().is_empty());
}

#[test]
fn seal_survives_store_reopen_before_cast() {
    let dir = SimulatedDir::new();
    let mut store = Store::open(&dir.0).unwrap();
    let mut roll = Roll::new(rules()).unwrap();
    add(&mut roll, message(1, 0));
    let sealed = seal(roll, [1; 32], &mut store);
    let sealed_bytes = std::fs::read(dir.0.join("draws.jsonl")).unwrap();
    drop(store);
    let mut store = Store::open(&dir.0).unwrap();
    let result = cast_streamer(sealed, [1; 32], at(2), &mut store, timestamp(3)).unwrap();
    let bytes = std::fs::read(dir.0.join("draws.jsonl")).unwrap();
    assert!(bytes.starts_with(&sealed_bytes));
    let lines = store.read_ledger(LedgerKind::Draws).unwrap();
    assert_eq!(lines.len(), 2);
    assert!(matches!(lines[0].event,
        LedgerEvent::DrawSealed { draw_run_id, .. } if draw_run_id == result.draw_run_id()));
    assert!(matches!(lines[1].event,
        LedgerEvent::Draw { draw_run_id, .. } if draw_run_id == result.draw_run_id()));
}
