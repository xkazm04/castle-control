// Adapted from Shadowrunr OS @ 7e4b6f8,
// crates/shadowrunr-engine/src/claude_cli.rs.
use crate::{ModelName, cli::CliProviderBackend};
pub(crate) struct Claude;
impl CliProviderBackend for Claude {
    fn args(&self, model: &ModelName) -> Vec<String> {
        [
            "-p",
            "--output-format",
            "stream-json",
            "--verbose",
            "--model",
            model.as_str(),
            "--permission-mode",
            "plan",
            "--permission-prompts",
            "none",
            "--tools",
            "",
            "--strict-mcp-config",
            "--mcp-config",
            "{\"mcpServers\":{}}",
            "--setting-sources",
            "",
            "--no-session-persistence",
        ]
        .into_iter()
        .map(str::to_owned)
        .collect()
    }
    fn auth_args(&self) -> Vec<String> {
        ["auth", "status"].map(str::to_owned).into()
    }
    fn key_variable(&self) -> &'static str {
        "ANTHROPIC_API_KEY"
    }
}
