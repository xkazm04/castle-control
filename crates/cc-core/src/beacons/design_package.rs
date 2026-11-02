//! Builds the data-only DesignPackage for a custom or library design: image
//! layers in logical pixels of the base image, plus intensity bindings.
//!
//! - beacon with an effect: base (static) and the effect sprite placed at
//!   `core_rect`, its opacity (0.15..1) and scale (0.85..1.1) bound to
//!   intensity, with x/y bindings keeping it centred while it swells;
//!   `behind` paints the effect first. Without an effect the base
//!   carries the glow-only binding the presets use (opacity 0.35..1, scale
//!   0.9..1.05).
//! - frame: one layer with the preset frame binding (opacity 0.25..1).
//! - vote bar: one static housing layer; the overlay draws segments.
//! - draw vessel: the static vessel plus, when present, the entry token as a
//!   hidden (opacity 0) layer at the mouth so the overlay can serve it; the
//!   Lots plate animates it from `VesselArt`.
use super::internal;
use cc_types::{ArtAnchors, ArtAssetKind, ArtRect, DesignId, DesignPackage, LocalAssetPath};
use serde_json::{Value, json};

pub(crate) struct Layers<'a> {
    pub kind: ArtAssetKind,
    pub width: u32,
    pub height: u32,
    pub base: &'a LocalAssetPath,
    pub effect: Option<&'a LocalAssetPath>,
    pub effect_behind: bool,
    pub token: Option<(&'a LocalAssetPath, u32, u32)>,
    pub anchors: &'a ArtAnchors,
}

fn binding(property: &str, at_zero: f64, at_one: f64) -> Value {
    json!({"property": property, "output_range": {"at_zero": at_zero, "at_one": at_one}})
}

/// Scale is anchored at the layer's top-left corner, so a scale binding comes
/// with x/y bindings that shift by half the growth and keep the centre still.
fn swell(rect: (f64, f64, u32, u32), at_zero: f64, at_one: f64) -> [Value; 3] {
    let (x, y, width, height) = rect;
    // Rounded to 1/10000 px so stored packages hash identically everywhere.
    let shift = |start: f64, size: u32, scale: f64| {
        ((start + f64::from(size) * (1.0 - scale) / 2.0) * 10_000.0).round() / 10_000.0
    };
    [
        binding("scale", at_zero, at_one),
        binding("x", shift(x, width, at_zero), shift(x, width, at_one)),
        binding("y", shift(y, height, at_zero), shift(y, height, at_one)),
    ]
}

fn layer(
    asset: &LocalAssetPath,
    rect: (f64, f64, u32, u32),
    opacity: f64,
    bindings: Vec<Value>,
) -> Value {
    let (x, y, width, height) = rect;
    json!({"kind": "image", "asset": asset,
        "properties": {"x": x, "y": y, "width": width.max(1), "height": height.max(1),
            "scale": 1.0, "opacity": opacity},
        "bindings": bindings})
}

fn pixels(rect: &ArtRect, width: u32, height: u32) -> (f64, f64, u32, u32) {
    let (w, h) = (f64::from(width), f64::from(height));
    let x = f64::from(rect.x.clone()).clamp(0.0, 1.0);
    let y = f64::from(rect.y.clone()).clamp(0.0, 1.0);
    // Clamp in consumers: the contract does not check x + w <= 1.
    let rw = f64::from(rect.w.clone()).clamp(0.0, 1.0 - x);
    let rh = f64::from(rect.h.clone()).clamp(0.0, 1.0 - y);
    (
        (x * w).round(),
        (y * h).round(),
        (rw * w).round() as u32,
        (rh * h).round() as u32,
    )
}

/// Package with a placeholder hash; the design store seals the real one.
pub(crate) fn build(
    id: &DesignId,
    spec: &Layers<'_>,
) -> Result<DesignPackage, cc_types::ErrorEnvelope> {
    let full = (0.0, 0.0, spec.width, spec.height);
    let mut layers = Vec::new();
    match (spec.kind, spec.effect, spec.anchors.core_rect.as_ref()) {
        (ArtAssetKind::Beacon, Some(effect), Some(core)) => {
            let rect = pixels(core, spec.width, spec.height);
            let mut bindings = vec![binding("opacity", 0.15, 1.0)];
            bindings.extend(swell(rect, 0.85, 1.1));
            let sprite = layer(effect, rect, 1.0, bindings);
            let body = layer(spec.base, full, 1.0, Vec::new());
            if spec.effect_behind {
                layers.extend([sprite, body]);
            } else {
                layers.extend([body, sprite]);
            }
        }
        (ArtAssetKind::Beacon, _, _) => {
            let mut bindings = vec![binding("opacity", 0.35, 1.0)];
            bindings.extend(swell(full, 0.9, 1.05));
            layers.push(layer(spec.base, full, 1.0, bindings));
        }
        (ArtAssetKind::Frame, _, _) => layers.push(layer(
            spec.base,
            full,
            1.0,
            vec![binding("opacity", 0.25, 1.0)],
        )),
        (ArtAssetKind::VoteBar, _, _) => layers.push(layer(spec.base, full, 1.0, Vec::new())),
        (ArtAssetKind::DrawVessel, _, _) => {
            layers.push(layer(spec.base, full, 1.0, Vec::new()));
            if let (Some((token, tw, th)), Some(mouth)) = (spec.token, spec.anchors.mouth.as_ref())
            {
                // A token a tenth of the vessel width, centred on the mouth.
                let size = (spec.width / 10).max(1);
                let th = (u64::from(size) * u64::from(th) / u64::from(tw.max(1))).max(1) as u32;
                let x = f64::from(mouth.x.clone()) * f64::from(spec.width) - f64::from(size) / 2.0;
                let y = f64::from(mouth.y.clone()) * f64::from(spec.height) - f64::from(th) / 2.0;
                layers.push(layer(
                    token,
                    (x.round(), y.round(), size, th),
                    0.0,
                    Vec::new(),
                ));
            }
        }
    }
    serde_json::from_value(json!({
        "design_id": id, "content_hash": "0".repeat(64), "layers": layers,
        "privileges": {"kind": "data_only"}
    }))
    .map_err(|_| internal())
}

#[cfg(test)]
mod tests {
    use super::*;
    use cc_types::DesignLayer;

    fn path(v: &str) -> LocalAssetPath {
        v.to_owned().try_into().unwrap()
    }

    #[test]
    fn beacon_effect_sits_on_the_core_with_intensity_bindings() {
        let anchors: ArtAnchors =
            serde_json::from_value(json!({"core_rect":{"x":0.25,"y":0.5,"w":0.5,"h":0.25}}))
                .unwrap();
        let (base, effect) = (path("base.png"), path("effect.png"));
        let mut spec = Layers {
            kind: ArtAssetKind::Beacon,
            width: 400,
            height: 800,
            base: &base,
            effect: Some(&effect),
            effect_behind: false,
            token: None,
            anchors: &anchors,
        };
        let id: DesignId = "simulated-design".to_owned().try_into().unwrap();
        let package = build(&id, &spec).unwrap();
        let DesignLayer::Image {
            asset,
            properties,
            bindings,
        } = &package.layers[1]
        else {
            panic!("image layer")
        };
        assert_eq!(asset, &effect);
        assert_eq!(
            (
                f64::from(properties.x.clone()),
                f64::from(properties.y.clone())
            ),
            (100.0, 400.0)
        );
        assert_eq!(
            (properties.width.get(), properties.height.get()),
            (200, 200)
        );
        assert_eq!(bindings.len(), 4);
        // Centre stays on the core while scale runs 0.85..1.1 (top-left anchored).
        let json = serde_json::to_value(bindings).unwrap();
        assert_eq!(
            json[2]["output_range"],
            json!({"at_zero": 115.0, "at_one": 90.0})
        );
        assert_eq!(
            json[3]["output_range"],
            json!({"at_zero": 415.0, "at_one": 390.0})
        );
        spec.effect_behind = true;
        let behind = build(&id, &spec).unwrap();
        assert!(matches!(&behind.layers[0], DesignLayer::Image { asset, .. } if asset == &effect));
        spec.effect = None;
        assert_eq!(build(&id, &spec).unwrap().layers.len(), 1);
    }
}
