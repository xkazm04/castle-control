// Adapted from Shadowrunr OS @ 7e4b6f8,
// crates/shadowrunr-engine/src/claude_cli.rs and alt_cli.rs.
use crate::{
    EngineClass, Keychain, ModelName, Prices, Result, SpawnDoor,
    admission::{Admission, budget},
    api::Answer,
    claude_cli::Claude,
    codex_cli::Codex,
};
use cc_types::CliProvider;
use std::{path::PathBuf, time::Duration};

/// Native executable paths only. Never invoke a .cmd/.bat shim through a shell.
pub struct CliExecutables {
    pub claude: PathBuf,
    pub codex: PathBuf,
    pub posture_probe: PathBuf,
}
pub(crate) trait CliProviderBackend {
    fn args(&self, model: &ModelName) -> Vec<String>;
    fn auth_args(&self) -> Vec<String>;
    fn key_variable(&self) -> &'static str;
}
pub struct CliRuntime {
    pub(crate) door: SpawnDoor,
    pub(crate) executables: CliExecutables,
    admission: Admission,
    ceilings: Option<(u64, u64)>,
}
impl CliRuntime {
    pub fn new(door: SpawnDoor, executables: CliExecutables, max_processes: usize) -> Result<Self> {
        Ok(Self {
            door,
            executables,
            admission: Admission::new(max_processes)?,
            ceilings: None,
        })
    }
    /// Tighten the operational ceiling (never widen the class budget).
    pub fn with_ceilings(mut self, total_ms: u64, silence_ms: u64) -> Result<Self> {
        if total_ms == 0 || silence_ms == 0 {
            return Err(crate::Failure::Invalid);
        }
        self.ceilings = Some((total_ms, silence_ms));
        Ok(self)
    }
    pub(crate) fn backend(
        &self,
        provider: CliProvider,
    ) -> (&dyn CliProviderBackend, &std::path::Path) {
        match provider {
            CliProvider::ClaudeCli => (&Claude, &self.executables.claude),
            CliProvider::CodexCli => (&Codex, &self.executables.codex),
        }
    }
    pub(crate) async fn complete(
        &self,
        request: CliCall<'_>,
        vault: &dyn Keychain,
    ) -> Result<Answer> {
        let mut limits = budget(request.class);
        if let Some((total, silence)) = self.ceilings {
            limits.total_ms = limits.total_ms.min(total);
            limits.silence_ms = limits.silence_ms.min(silence);
        }
        tokio::time::timeout(
            Duration::from_millis(limits.total_ms),
            self.perform(request, vault, limits),
        )
        .await
        .map_err(|_| crate::Failure::Timeout)?
    }
    async fn perform(
        &self,
        request: CliCall<'_>,
        vault: &dyn Keychain,
        limits: crate::admission::Budget,
    ) -> Result<Answer> {
        let started = std::time::Instant::now();
        let _permit = self
            .admission
            .enter(request.class, Duration::from_millis(limits.total_ms))
            .await?;
        let (backend, executable) = self.backend(request.provider);
        if request.provider == CliProvider::CodexCli {
            // Execute a native write-denial probe inside this CLI's read-only sandbox.
            // Never infer that a sandbox came up from a flag alone.
            let target = self.door.posture_target()?;
            let args = vec![
                "sandbox".into(),
                "windows".into(),
                "-c".into(),
                "sandbox_mode=\"read-only\"".into(),
                "--".into(),
                self.executables
                    .posture_probe
                    .to_string_lossy()
                    .into_owned(),
                target.to_string_lossy().into_owned(),
            ];
            let (ok, bytes) = self.door.capture(executable, &args, None, vault).await?;
            if !ok || bytes != b"cc-read-only-probe-v1\n" {
                return Err(crate::Failure::Posture);
            }
        }
        let remaining = limits
            .total_ms
            .saturating_sub(started.elapsed().as_millis() as u64);
        self.door
            .turn(
                executable,
                &backend.args(request.model),
                request.prompt,
                request.provider,
                request.class,
                request.prices,
                request
                    .key_label
                    .map(|label| (label, backend.key_variable())),
                vault,
                (remaining, limits.silence_ms),
            )
            .await
    }
}
pub(crate) struct CliCall<'a> {
    pub class: EngineClass,
    pub provider: CliProvider,
    pub model: &'a ModelName,
    pub prompt: &'a str,
    pub prices: Prices,
    pub key_label: Option<&'a str>,
}
