//! Local upload data: content signatures, never caller-supplied MIME or paths.
use crate::DesignContentHash;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

pub const LOCAL_IMAGE_MAX_BYTES: usize = 2 * 1024 * 1024;

/// SHA-256 of the exact stored bytes. Resolves only in the app's local store.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(transparent)]
pub struct LocalImageRef(DesignContentHash);
impl TryFrom<String> for LocalImageRef {
    type Error = &'static str;
    fn try_from(value: String) -> Result<Self, Self::Error> {
        DesignContentHash::try_from(value).map(Self)
    }
}
impl From<LocalImageRef> for String {
    fn from(value: LocalImageRef) -> Self {
        value.0.into()
    }
}

/// Canonical lowercase hex bytes, capped at 2 MiB decoded (4 MiB on wire).
/// Both parsers sniff PNG's eight-byte signature, JPEG's FF D8 FF prefix,
/// or RIFF....WEBP followed by VP8 /VP8L/VP8X. This is format identification,
/// not image decoding; consumers must still decode with resource limits.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(try_from = "String", into = "String")]
#[schemars(with = "String", extend("maxLength" = 4194304, "pattern" = r"^(?:89504e470d0a1a0a|ffd8ff|52494646[0-9a-f]{8}57454250565038(?:20|4c|58))(?:[0-9a-f]{2})*$(?![\s\S])"))]
pub struct LocalImageContent(Vec<u8>);
impl TryFrom<Vec<u8>> for LocalImageContent {
    type Error = &'static str;
    fn try_from(value: Vec<u8>) -> Result<Self, Self::Error> {
        let png = value.starts_with(b"\x89PNG\r\n\x1a\n");
        let jpeg = value.starts_with(&[0xff, 0xd8, 0xff]);
        let webp = value.starts_with(b"RIFF")
            && value.get(8..12) == Some(b"WEBP")
            && matches!(value.get(12..16), Some(b"VP8 " | b"VP8L" | b"VP8X"));
        if value.len() <= LOCAL_IMAGE_MAX_BYTES && (png || jpeg || webp) {
            Ok(Self(value))
        } else {
            Err("expected PNG, JPEG or WebP content of at most 2 MiB")
        }
    }
}
impl TryFrom<String> for LocalImageContent {
    type Error = &'static str;
    fn try_from(value: String) -> Result<Self, Self::Error> {
        if value.len() > LOCAL_IMAGE_MAX_BYTES * 2
            || !value.len().is_multiple_of(2)
            || !value
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        {
            return Err("expected canonical lowercase image hex");
        }
        let bytes = (0..value.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&value[i..i + 2], 16).map_err(|_| "invalid image hex"))
            .collect::<Result<Vec<_>, _>>()?;
        Self::try_from(bytes)
    }
}
impl From<LocalImageContent> for String {
    fn from(value: LocalImageContent) -> Self {
        value.0.iter().map(|byte| format!("{byte:02x}")).collect()
    }
}
impl LocalImageContent {
    pub fn as_bytes(&self) -> &[u8] {
        &self.0
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ImageUploadParams {
    pub content: LocalImageContent,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ImageUploadResult {
    pub image: LocalImageRef,
}
