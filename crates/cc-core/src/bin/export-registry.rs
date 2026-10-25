use cc_core::Registry;
fn main() {
    println!(
        "{}",
        serde_json::to_string(&Registry::with_status().methods())
            .expect("registry is serializable")
    );
}
