use std::{fs, path::Path};

#[test]
fn money_cannot_cross_into_draws_moderation_or_engine() {
    let beacons_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let crates_dir = beacons_dir.parent().expect("crate must be inside crates/");
    let beacons = fs::read_to_string(beacons_dir.join("Cargo.toml"))
        .expect("cc-beacons manifest must be readable");

    // Conservatively reject every mention, including aliases, paths, optional,
    // target-specific and dev dependencies, rather than partially parsing TOML.
    for isolated in ["cc-lots", "cc-gatehouse", "cc-engine"] {
        assert!(
            !beacons.contains(isolated),
            "cc-beacons must not depend on {isolated}"
        );
        let manifest = fs::read_to_string(crates_dir.join(isolated).join("Cargo.toml"))
            .expect("isolated crate manifest must be readable");
        assert!(
            !manifest.contains("cc-beacons"),
            "{isolated} must not depend on cc-beacons"
        );
    }
}
