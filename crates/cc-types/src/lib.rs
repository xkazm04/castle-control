//! The single authority for Castle Control's wire vocabulary and schemas.
mod beacons;
mod beacons_art;
mod beacons_reads;
mod beacons_render;
mod core;
mod decision;
mod design;
mod display;
mod drill;
mod drill_value;
mod engine;
mod enums;
mod events;
mod gatehouse;
mod gatehouse_gate;
mod gatehouse_live_run;
mod gatehouse_reads;
mod herald;
mod ids;
mod local_image;
mod lots;
mod lots_proof;
mod lots_value;
mod methods;
mod recording;
mod rule;
mod steward;
mod strike;
mod value;

pub use beacons::*;
pub use beacons_art::*;
pub use beacons_reads::*;
pub use beacons_render::*;
pub use core::*;
pub use decision::*;
pub use design::*;
pub use display::*;
pub use drill::*;
pub use drill_value::*;
pub use engine::*;
pub use enums::*;
pub use events::*;
pub use gatehouse::*;
pub use gatehouse_gate::*;
pub use gatehouse_live_run::*;
pub use gatehouse_reads::*;
pub use herald::*;
pub use ids::*;
pub use local_image::*;
pub use lots::*;
pub use lots_proof::*;
pub use lots_value::*;
pub use methods::*;
pub use recording::*;
pub use rule::*;
pub use steward::*;
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
