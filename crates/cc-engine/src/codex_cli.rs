// Adapted from Shadowrunr OS @ 7e4b6f8,
// crates/shadowrunr-engine/src/alt_cli.rs.
use crate::{ModelName, cli::CliProviderBackend};
pub(crate) struct Codex;
impl CliProviderBackend for Codex {
    fn args(&self, model: &ModelName) -> Vec<String> {
        [
            "exec",
            "--json",
            "--skip-git-repo-check",
            "--ephemeral",
            "--ignore-user-config",
            "--ignore-rules",
            "-s",
            "read-only",
            "-m",
            model.as_str(),
            "-",
        ]
        .into_iter()
        .map(str::to_owned)
        .collect()
    }
    fn auth_args(&self) -> Vec<String> {
        ["login", "status"].map(str::to_owned).into()
    }
    fn key_variable(&self) -> &'static str {
        "CODEX_API_KEY"
    }
}
