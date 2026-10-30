//! Per-visual overlay SSE contract, separate from control-stream invalidations.
use crate::{BeaconsIntensity, DesignPackage, Visual};
use schemars::{JsonSchema, Schema};
use serde::{Deserialize, Serialize};

pub const BEACONS_RENDER_SNAPSHOT_EVENT: &str = "beacons.render.snapshot";

/// Accepted state only: the last committed visual, last hash-verified package
/// and last computed intensity (or explicitly simulated preview), never an
/// unsaved edit or unverified package.
/// Each snapshot is a full replacement, not a patch. A visual without a design
/// is legal and renders a neutral placeholder. If a visual names a design but
/// its package is not verified, the host sends nothing until verification.
/// Parsing checks consistency and digest syntax; the host verifies actual bytes.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(try_from = "RenderSnapshotFields")]
#[schemars(with = "RenderSnapshotFields", transform = snapshot_schema)]
pub struct BeaconsRenderSnapshot {
    pub visual: Visual,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub package: Option<DesignPackage>,
    pub intensity: BeaconsIntensity,
    /// True when this snapshot reflects a simulated burst/preview rather than
    /// live accepted state.
    pub simulated: bool,
}

#[derive(Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct RenderSnapshotFields {
    visual: Visual,
    #[serde(default, deserialize_with = "crate::present")]
    #[schemars(with = "DesignPackage")]
    package: Option<DesignPackage>,
    intensity: BeaconsIntensity,
    /// True for a simulated burst/preview rather than live accepted state.
    simulated: bool,
}

impl TryFrom<RenderSnapshotFields> for BeaconsRenderSnapshot {
    type Error = &'static str;
    fn try_from(value: RenderSnapshotFields) -> Result<Self, Self::Error> {
        if value.intensity.visual_id != value.visual.visual_id {
            return Err("snapshot intensity must name its visual");
        }
        if value.package.is_some() != value.visual.design_id.is_some() {
            return Err("snapshot package must be present exactly when visual names a design");
        }
        if value.package.as_ref().map(|package| &package.design_id)
            != value.visual.design_id.as_ref()
        {
            return Err("snapshot package must match visual design");
        }
        Ok(Self {
            visual: value.visual,
            package: value.package,
            intensity: value.intensity,
            simulated: value.simulated,
        })
    }
}

fn snapshot_schema(schema: &mut Schema) {
    // Standard JSON Schema expresses presence, not equality between arbitrary
    // sibling strings. The generated TS parse door also checks both ID matches.
    schema.insert(
        "allOf".into(),
        serde_json::json!([{
            "if":{"properties":{"visual":{"type":"object",
                "properties":{"design_id":true},"required":["design_id"]}}},
            "then":{"properties":{"package":true},"required":["package"]},
            "else":{"properties":{"package":false}}
        }]),
    );
}
