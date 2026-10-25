//! Scalar boundaries shared by the lots configuration and proof JSON shapes.
use schemars::{JsonSchema, Schema};
use serde::{Deserialize, Serialize};

macro_rules! text_value {
    ($name:ident, $pattern:literal, $check:expr) => {
        #[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
        #[serde(try_from = "String", into = "String")]
        #[schemars(with = "String", extend("pattern" = $pattern))]
        pub struct $name(String);
        impl TryFrom<String> for $name {
            type Error = &'static str;
            fn try_from(value: String) -> Result<Self, Self::Error> {
                if ($check)(&value) {
                    Ok(Self(value))
                } else {
                    Err(concat!("invalid ", stringify!($name)))
                }
            }
        }
        impl From<$name> for String {
            fn from(value: $name) -> Self {
                value.0
            }
        }
    };
}

// Same numeric-ID domain as cc-store::TwitchUserId; no dependency on storage.
text_value!(TwitchUserId, r"^[1-9][0-9]{0,31}$(?![\s\S])", |v: &str| !v
    .is_empty()
    && v.len() <= 32
    && !v.starts_with('0')
    && v.bytes().all(|b| b.is_ascii_digit()));
text_value!(LotsHandle, r"^[a-z0-9_]{1,25}$(?![\s\S])", |v: &str| !v
    .is_empty()
    && v.len() <= 25
    && v.bytes().all(|b| b.is_ascii_lowercase()
        || b.is_ascii_digit()
        || b == b'_'));
text_value!(LotsHex32, r"^[0-9a-f]{64}$(?![\s\S])", |v: &str| hex(v, 64));
text_value!(LotsSignature, r"^[0-9a-f]{96}$(?![\s\S])", |v: &str| hex(
    v, 96
));
// ASCII whitespace is not enough: the source pool uses char::is_whitespace.
text_value!(
    LotsKeyword,
    r"^[^\u0009-\u000D\u0020\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]+$(?![\s\S])",
    |v: &str| !v.is_empty() && !v.chars().any(char::is_whitespace)
);

fn hex(value: &str, length: usize) -> bool {
    value.len() == length
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(try_from = "String", into = "String")]
#[schemars(with = "String", transform = round_schema)]
pub struct LotsRound(String);
impl TryFrom<String> for LotsRound {
    type Error = &'static str;
    fn try_from(value: String) -> Result<Self, Self::Error> {
        if value
            .parse::<u64>()
            .is_ok_and(|n| n > 0 && n.to_string() == value)
        {
            Ok(Self(value))
        } else {
            Err("expected canonical positive u64 round string")
        }
    }
}
impl From<LotsRound> for String {
    fn from(value: LotsRound) -> Self {
        value.0
    }
}
fn round_schema(schema: &mut Schema) {
    let max = "18446744073709551615";
    let mut alternatives = vec!["[1-9][0-9]{0,18}".to_owned(), max.to_owned()];
    for (i, byte) in max.bytes().enumerate() {
        let low = if i == 0 { b'1' } else { b'0' };
        if byte > low {
            alternatives.push(format!(
                "{}[{}-{}][0-9]{{{}}}",
                &max[..i],
                low as char,
                (byte - 1) as char,
                max.len() - i - 1
            ));
        }
    }
    schema.insert(
        "pattern".into(),
        serde_json::json!(format!(r"^(?:{})$(?![\s\S])", alternatives.join("|"))),
    );
}

/// Integer cents/counts must survive JavaScript's number representation exactly.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(try_from = "u64", into = "u64")]
#[schemars(with = "u64", extend("maximum" = 9_007_199_254_740_991_u64))]
pub struct LotsUnsigned(u64);
impl TryFrom<u64> for LotsUnsigned {
    type Error = &'static str;
    fn try_from(value: u64) -> Result<Self, Self::Error> {
        if value <= 9_007_199_254_740_991 {
            Ok(Self(value))
        } else {
            Err("unsafe integer")
        }
    }
}
impl From<LotsUnsigned> for u64 {
    fn from(value: LotsUnsigned) -> Self {
        value.0
    }
}

/// cc-verify v1 hashes exactly twenty timestamp bytes, without fractions.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(try_from = "String", into = "String")]
#[schemars(with = "String", extend("format" = "date-time", "pattern" = r"^(19[7-9][0-9]|[2-9][0-9]{3})-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$(?![\s\S])"))]
pub struct LotsProofTime(String);
impl TryFrom<String> for LotsProofTime {
    type Error = &'static str;
    fn try_from(value: String) -> Result<Self, Self::Error> {
        if value.len() == 20
            && value.as_str() >= "1970-01-01T00:00:00Z"
            && crate::Timestamp::try_from(value.clone()).is_ok()
        {
            Ok(Self(value))
        } else {
            Err("expected whole-second UTC proof timestamp")
        }
    }
}
impl From<LotsProofTime> for String {
    fn from(value: LotsProofTime) -> Self {
        value.0
    }
}
