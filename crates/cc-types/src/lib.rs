//! The single authority for Castle Control's wire vocabulary and schemas.
mod beacons;
mod core;
mod decision;
mod design;
mod drill;
mod drill_value;
mod engine;
mod enums;
mod events;
mod gatehouse;
mod herald;
mod ids;
mod lots;
mod lots_proof;
mod lots_value;
mod methods;
mod recording;
mod rule;
mod strike;
mod value;

pub use beacons::*;
pub use core::*;
pub use decision::*;
pub use design::*;
pub use drill::*;
pub use drill_value::*;
pub use engine::*;
pub use enums::*;
pub use events::*;
pub use gatehouse::*;
pub use herald::*;
pub use ids::*;
pub use lots::*;
pub use lots_proof::*;
pub use lots_value::*;
pub use methods::*;
pub use recording::*;
pub use rule::*;
pub use strike::*;
pub use value::*;

/// Present optional keys must contain a value, never JSON null.
pub(crate) fn present<'de, D, T>(deserializer: D) -> Result<Option<T>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: serde::Deserialize<'de>,
{
    T::deserialize(deserializer).map(Some)
}
