//! Drift guard for the instrument fingerprint's hand-listed source files.
//! Every file under src/ must be either fingerprinted by src/instrument.rs
//! (an `include_str!` entry) or named here with the decision that it does not
//! shape replay behaviour. A new source file fails until it is classified.
use std::{collections::BTreeSet, fs, path::Path};

/// Reviewed as not affecting live-shadow or replay results.
const NOT_FINGERPRINTED: &[&str] = &[
    "analysis.rs",
    "engine_classifier.rs",
    "gate/budget.rs",
    "gate/events.rs",
    "gate/governor.rs",
    "gate/held.rs",
    "gate/leases.rs",
    "gate/mod.rs",
    "gate/settings.rs",
    "governor.rs",
    "governor_lease.rs",
    "herald.rs",
    "herald_features.rs",
    "instrument.rs",
    "lane_tests.rs",
    "live_capture_tests.rs",
    "lib.rs",
    "live.rs",
    "recorder.rs",
    "review.rs",
    "rules_parity.rs",
    "service.rs",
    "sha256.rs",
    "simulation.rs",
];

fn sources(dir: &Path, root: &Path, out: &mut BTreeSet<String>) {
    for entry in fs::read_dir(dir).expect("read src dir") {
        let path = entry.expect("dir entry").path();
        if path.is_dir() {
            sources(&path, root, out);
        } else if path.extension().is_some_and(|e| e == "rs") {
            let rel = path.strip_prefix(root).expect("under src");
            out.insert(rel.to_string_lossy().replace('\\', "/"));
        }
    }
}

fn fingerprinted(instrument: &str) -> BTreeSet<String> {
    instrument
        .split("include_str!(\"")
        .skip(1)
        .map(|rest| rest.split('"').next().expect("closing quote").to_owned())
        .collect()
}

#[test]
fn every_source_file_is_fingerprinted_or_explicitly_excluded() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let mut all = BTreeSet::new();
    sources(&root, &root, &mut all);
    let listed = fingerprinted(&fs::read_to_string(root.join("instrument.rs")).unwrap());
    let excluded: BTreeSet<String> = NOT_FINGERPRINTED.iter().map(|s| (*s).to_owned()).collect();
    assert!(!listed.is_empty(), "no fingerprinted sources found");
    let both: Vec<_> = listed.intersection(&excluded).collect();
    assert!(both.is_empty(), "both fingerprinted and excluded: {both:?}");
    let covered: BTreeSet<_> = listed.union(&excluded).cloned().collect();
    let unclassified: Vec<_> = all.difference(&covered).collect();
    assert!(
        unclassified.is_empty(),
        "source files neither fingerprinted in instrument.rs nor excluded: {unclassified:?}"
    );
    let stale: Vec<_> = covered.difference(&all).collect();
    assert!(
        stale.is_empty(),
        "listed files that no longer exist: {stale:?}"
    );
}
