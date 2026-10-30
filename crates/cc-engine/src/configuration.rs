//! Rust-only construction errors. No settings values are retained or formatted.
use crate::Failure;
use cc_types::{CliProvider, EngineSettings};

#[derive(Clone, Debug, PartialEq, Eq, thiserror::Error)]
pub enum ConstructionError {
    #[error("missing engine settings: {}", .0.join(", "))]
    MissingKeys(Vec<&'static str>),
    #[error("invalid engine settings")]
    InvalidSettings,
    #[error(transparent)]
    Engine(#[from] Failure),
}

pub(crate) fn require_selected(settings: &EngineSettings) -> Result<(), ConstructionError> {
    let required = match settings.cli_provider {
        CliProvider::ClaudeCli => vec![
            ("engine.claude_exe_path", &settings.claude_exe_path),
            ("engine.model_claude", &settings.model_claude),
        ],
        CliProvider::CodexCli => vec![
            ("engine.codex_exe_path", &settings.codex_exe_path),
            ("engine.model_codex", &settings.model_codex),
            ("engine.posture_helper_path", &settings.posture_helper_path),
        ],
    };
    let missing: Vec<_> = required
        .into_iter()
        .filter_map(|(key, value)| value.is_none().then_some(key))
        .collect();
    if missing.is_empty() {
        Ok(())
    } else {
        Err(ConstructionError::MissingKeys(missing))
    }
}
