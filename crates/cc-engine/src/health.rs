// Adapted from Shadowrunr OS @ 7e4b6f8,
// crates/shadowrunr-engine/src/health.rs.
use crate::{CliRuntime, Failure, Keychain, Result};
use cc_types::CliProvider;
use serde::Deserialize;

#[derive(Debug, PartialEq, Eq)]
pub struct Probe {
    pub installed: bool,
    pub version: Option<String>,
    pub signed_in: bool,
}
impl CliRuntime {
    /// No token spend. Both probes use the exact same spawn door/environment as calls.
    /// Commands and dated evidence are in this crate's README; no auth files are read.
    pub async fn probe(
        &self,
        provider: CliProvider,
        key_label: Option<&str>,
        vault: &dyn Keychain,
    ) -> Result<Probe> {
        let (backend, executable) = self.backend(provider)?;
        let key = key_label.map(|label| (label, backend.key_variable()));
        let version = self
            .door
            .capture(executable, &["--version".into()], key, vault)
            .await;
        // Only a missing executable or a timeout means "not installed"; custody and
        // supervision failures are real causes the caller must see.
        let bytes = match version {
            Ok((true, bytes)) => bytes,
            Ok((false, _)) | Err(Failure::Unavailable | Failure::Timeout) => {
                return Ok(Probe {
                    installed: false,
                    version: None,
                    signed_in: false,
                });
            }
            Err(error) => return Err(error),
        };
        let version = parse_version(&bytes);
        let auth = self
            .door
            .capture(executable, &backend.auth_args(), key, vault)
            .await;
        let signed_in = match auth {
            Ok((success, bytes)) => match provider {
                CliProvider::CodexCli => success,
                CliProvider::ClaudeCli => {
                    #[derive(Deserialize)]
                    struct Auth {
                        #[serde(rename = "loggedIn")]
                        logged_in: bool,
                    }
                    success
                        && serde_json::from_slice::<Auth>(&bytes).is_ok_and(|auth| auth.logged_in)
                }
            },
            Err(Failure::Unavailable | Failure::Timeout) => false,
            Err(error) => return Err(error),
        };
        Ok(Probe {
            installed: true,
            version,
            signed_in,
        })
    }
}
fn parse_version(bytes: &[u8]) -> Option<String> {
    std::str::from_utf8(bytes)
        .ok()?
        .split_whitespace()
        .find(|word| {
            word.starts_with(|c: char| c.is_ascii_digit())
                && word.contains('.')
                && word
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || ".-".contains(c))
        })
        .map(str::to_owned)
}
