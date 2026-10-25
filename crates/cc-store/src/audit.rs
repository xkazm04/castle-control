//! Store-internal audit values, independent of the wire contract.
use crate::{Error, Result};
use serde::{Deserialize, Serialize};

/// Admission role recorded for every engine call.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EngineClass {
    Live,
    NearLive,
    Batch,
    Offline,
}

/// Provider selected for the call, including calls that receive no model answer.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EngineProvider {
    LocalEndpoint,
    OpenaiApi,
    ClaudeCli,
    CodexCli,
}

/// Blocked settings from docs/plan/01-analysis.md:115,117; never free-form reasons.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DrawRiskSetting {
    PaidEntry,
    PaidWeight,
    PrizeValueOverCap,
}

/// A nonempty ASCII model identifier of at most 128 characters, not arbitrary text.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "String", into = "String")]
pub struct ModelName(String);

impl ModelName {
    pub fn parse(value: &str) -> Result<Self> {
        if value.is_empty()
            || value.len() > 128
            || !value.bytes().all(|b| {
                b.is_ascii_alphanumeric()
                    || matches!(b, b'.' | b'_' | b':' | b'/' | b'@' | b'+' | b'-')
            })
        {
            return Err(Error::Invalid("model name"));
        }
        Ok(Self(value.to_owned()))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl TryFrom<String> for ModelName {
    type Error = Error;
    fn try_from(value: String) -> Result<Self> {
        Self::parse(&value)
    }
}

impl From<ModelName> for String {
    fn from(value: ModelName) -> Self {
        value.0
    }
}

/// Configured-draw identity, not a draw-run ULID. Copies the DrawId rule from
/// crates/cc-types/src/ids.rs:69 and its `slug` predicate: nonempty segments of
/// lowercase ASCII letters or digits, separated by single hyphens; no length cap.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "String", into = "String")]
pub struct DrawSlug(String);

impl DrawSlug {
    pub fn parse(value: &str) -> Result<Self> {
        if value.is_empty()
            || !value.split('-').all(|part| {
                !part.is_empty()
                    && part
                        .bytes()
                        .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit())
            })
        {
            return Err(Error::Invalid("draw slug"));
        }
        Ok(Self(value.to_owned()))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl TryFrom<String> for DrawSlug {
    type Error = Error;
    fn try_from(value: String) -> Result<Self> {
        Self::parse(&value)
    }
}

impl From<DrawSlug> for String {
    fn from(value: DrawSlug) -> Self {
        value.0
    }
}
