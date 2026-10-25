use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

macro_rules! string_id {
    ($name:ident, $pattern:literal, $check:expr) => {
        #[derive(
            Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, JsonSchema,
        )]
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
        impl $name {
            pub fn as_str(&self) -> &str {
                &self.0
            }
        }
    };
}

fn slug(value: &str) -> bool {
    !value.is_empty()
        && value.split('-').all(|part| {
            !part.is_empty()
                && part
                    .bytes()
                    .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit())
        })
}
fn canonical_ulid(value: &str) -> bool {
    value
        .parse::<ulid::Ulid>()
        .is_ok_and(|id| id.to_string() == value)
}
string_id!(MessageId, r"^[A-Za-z0-9_-]+$(?![\s\S])", |v: &str| !v
    .is_empty()
    && v.bytes()
        .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_'));
string_id!(
    DecisionId,
    r"^[0-7][0-9A-HJKMNP-TV-Z]{25}$(?![\s\S])",
    canonical_ulid
);
string_id!(
    WritId,
    r"^[0-7][0-9A-HJKMNP-TV-Z]{25}$(?![\s\S])",
    canonical_ulid
);
string_id!(
    DrawRunId,
    r"^[0-7][0-9A-HJKMNP-TV-Z]{25}$(?![\s\S])",
    canonical_ulid
);
string_id!(RuleId, r"^[a-z0-9]+(-[a-z0-9]+)*$(?![\s\S])", slug);
string_id!(DrawId, r"^[a-z0-9]+(-[a-z0-9]+)*$(?![\s\S])", slug);
string_id!(VisualId, r"^[a-z0-9]+(-[a-z0-9]+)*$(?![\s\S])", slug);
string_id!(DesignId, r"^[a-z0-9]+(-[a-z0-9]+)*$(?![\s\S])", slug);

macro_rules! minted_id {
    ($($name:ident),+) => { $(impl $name {
        /// The only minting door; parsing existing wire IDs uses TryFrom.
        pub fn mint() -> Self { Self(ulid::Ulid::new().to_string()) }
    })+ };
}
minted_id!(DecisionId, WritId, DrawRunId);
