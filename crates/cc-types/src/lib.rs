//! The single authority for Castle Control's wire vocabulary and schemas.
mod core;
mod enums;
mod events;
mod ids;
mod methods;
mod value;

pub use core::*;
pub use enums::*;
pub use events::*;
pub use ids::*;
pub use methods::*;
pub use value::*;

/// Present optional keys must contain a value, never JSON null.
pub(crate) fn present<'de, D, T>(deserializer: D) -> Result<Option<T>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: serde::Deserialize<'de>,
{
    T::deserialize(deserializer).map(Some)
}
