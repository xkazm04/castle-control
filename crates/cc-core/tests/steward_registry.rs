//! Declared-but-unregistered methods are an explicit, named list, not a count
//! or a set derived from the implementation's own constants.
use cc_core::{EventHub, Registry};
use cc_types::RpcRequest;
use std::sync::Arc;

/// Declared in the contract but owned by a later work package or by the live
/// host, so a fixture registry must not register them.
const UNREGISTERED_IN_FIXTURE: [&str; 12] = [
    "store.forgetUser",
    "store.purgeAll",
    "gatehouse.held.resolve",
    "gatehouse.delay.set",
    "gatehouse.shield.set",
    "lots.image.upload",
    "maproom.design.get",
    "maproom.design.upsert",
    "rehearsal.crowd.set",
    "rehearsal.scenario.run",
    "rehearsal.start",
    "rehearsal.stop",
];

fn unregistered(registry: &Registry) -> Vec<&'static str> {
    let registered = registry.methods();
    RpcRequest::NAMES
        .iter()
        .copied()
        .filter(|name| !registered.contains(name))
        .collect()
}

#[test]
fn unregistered_methods_are_exactly_the_named_list() {
    let dir = tempfile::tempdir().unwrap();
    let fixture =
        Registry::with_fixture_root(dir.path(), Arc::new(EventHub::new(8).unwrap())).unwrap();
    for registry in [Registry::with_status(), fixture] {
        let mut expected = UNREGISTERED_IN_FIXTURE.to_vec();
        expected.sort_by_key(|name| RpcRequest::NAMES.iter().position(|n| n == name));
        assert_eq!(unregistered(&registry), expected);
    }
}
