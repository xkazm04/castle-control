//! The single authority for Castle Control's wire vocabulary and schemas.
mod art_design;
mod art_direct;
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
mod obs;
mod recording;
mod rehearsal;
mod rule;
mod steward;
mod strike;
mod tiltyard;
mod tiltyard_session;
mod tiltyard_value;
mod value;
mod vote_bar;

pub use art_design::*;
pub use art_direct::*;
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
pub use obs::*;
pub use recording::*;
pub use rehearsal::*;
pub use rule::*;
pub use steward::*;
pub use strike::*;
pub use tiltyard::*;
pub use tiltyard_session::*;
pub use tiltyard_value::*;
pub use value::*;
pub use vote_bar::*;

/// Present optional keys must contain a value, never JSON null.
pub(crate) fn present<'de, D, T>(deserializer: D) -> Result<Option<T>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: serde::Deserialize<'de>,
{
    T::deserialize(deserializer).map(Some)
}

/// Serde's derived struct parser also accepts positional sequences (even []
/// when every field is optional). Require a JSON object, as the schema does.
pub(crate) fn object<'de, D, T>(deserializer: D) -> Result<T, D::Error>
where
    D: serde::Deserializer<'de>,
    T: serde::Deserialize<'de>,
{
    struct Object<T>(std::marker::PhantomData<T>);
    impl<'de, T: serde::Deserialize<'de>> serde::de::Visitor<'de> for Object<T> {
        type Value = T;
        fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
            f.write_str("an object")
        }
        fn visit_map<M: serde::de::MapAccess<'de>>(self, map: M) -> Result<T, M::Error> {
            T::deserialize(serde::de::value::MapAccessDeserializer::new(map))
        }
    }
    deserializer.deserialize_map(Object(std::marker::PhantomData))
}
