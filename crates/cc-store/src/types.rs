use crate::{Error, Result};
use chrono::{DateTime, Datelike, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use ulid::Ulid;

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(try_from = "String", into = "String")]
pub struct Timestamp(DateTime<Utc>);

impl Timestamp {
    pub fn parse(value: &str) -> Result<Self> {
        let parsed = DateTime::parse_from_rfc3339(value)
            .map_err(|_| Error::Invalid("RFC 3339 UTC timestamp"))?;
        if parsed.offset().local_minus_utc() != 0 || !(0..=9999).contains(&parsed.year()) {
            return Err(Error::Invalid("RFC 3339 UTC timestamp"));
        }
        // Leap seconds cannot be ordered lexically against the following minute.
        if parsed.timestamp_subsec_nanos() >= 1_000_000_000 {
            return Err(Error::Invalid("leap-second timestamp"));
        }
        Ok(Self(parsed.with_timezone(&Utc)))
    }

    pub fn now() -> Self {
        Self(Utc::now())
    }

    pub fn as_rfc3339(&self) -> String {
        self.0.to_rfc3339_opts(SecondsFormat::Nanos, true)
    }

    pub(crate) fn subtract_s(&self, seconds: u64) -> Result<Self> {
        let seconds = i64::try_from(seconds).map_err(|_| Error::Invalid("retention cap"))?;
        let duration =
            chrono::TimeDelta::try_seconds(seconds).ok_or(Error::Invalid("retention cap"))?;
        let result = self
            .0
            .checked_sub_signed(duration)
            .ok_or(Error::Invalid("retention cutoff"))?;
        Self::parse(&result.to_rfc3339())
    }
}

impl TryFrom<String> for Timestamp {
    type Error = Error;
    fn try_from(value: String) -> Result<Self> {
        Self::parse(&value)
    }
}

impl From<Timestamp> for String {
    fn from(value: Timestamp) -> Self {
        value.as_rfc3339()
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "String", into = "String")]
pub struct TwitchUserId(String);

impl TwitchUserId {
    pub fn parse(value: &str) -> Result<Self> {
        if value.is_empty()
            || value.len() > 32
            || !value.bytes().all(|b| b.is_ascii_digit())
            || value.starts_with('0')
        {
            return Err(Error::Invalid("Twitch user id"));
        }
        Ok(Self(value.to_owned()))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl TryFrom<String> for TwitchUserId {
    type Error = Error;
    fn try_from(value: String) -> Result<Self> {
        Self::parse(&value)
    }
}

impl From<TwitchUserId> for String {
    fn from(value: TwitchUserId) -> Self {
        value.0
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StoredItem {
    pub id: Ulid,
    pub at: Timestamp,
    pub user_ids: Vec<TwitchUserId>,
    pub content: String,
    pub simulated: bool,
}

impl StoredItem {
    pub(crate) fn validate(&self) -> Result<()> {
        if self.user_ids.is_empty() {
            return Err(Error::Invalid("item without viewer associations"));
        }
        Ok(())
    }
}

pub(crate) fn login(value: &str) -> Result<String> {
    if value.is_empty()
        || value.len() > 25
        || !value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_')
    {
        return Err(Error::Invalid("Twitch login"));
    }
    Ok(value.to_ascii_lowercase())
}
