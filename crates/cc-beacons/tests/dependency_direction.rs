use std::{fs, path::Path, process::Command};

fn dependency_tree(package: &str) -> String {
    let output = Command::new(env!("CARGO"))
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .args([
            "tree",
            "--offline",
            "--locked",
            "--all-features",
            "--target",
            "all",
            "--edges",
            "normal,build,dev",
            "--prefix",
            "none",
            "-p",
            package,
        ])
        .output()
        .expect("offline dependency inventory must run");
    assert!(
        output.status.success(),
        "dependency inventory failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8(output.stdout).expect("dependency inventory is UTF-8")
}

#[test]
fn money_cannot_cross_into_draws_moderation_or_engine() {
    let beacons_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let crates_dir = beacons_dir.parent().expect("crate must be inside crates/");
    let beacons = fs::read_to_string(beacons_dir.join("Cargo.toml"))
        .expect("cc-beacons manifest must be readable");
    let reachable = dependency_tree("cc-beacons");
    assert!(
        reachable.lines().any(|line| line.starts_with("cc-types ")),
        "dependency inventory must be nonempty"
    );

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
        assert!(
            !reachable.contains(isolated),
            "cc-beacons transitively reaches {isolated}"
        );
        assert!(
            !dependency_tree(isolated).contains("cc-beacons"),
            "{isolated} transitively reaches cc-beacons"
        );
    }
}
