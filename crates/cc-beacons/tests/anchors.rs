//! Anchor measurement on committed SIMULATED fixtures and on library images.
mod simulated_art;

use cc_beacons::art::{anchors, raster};
use cc_types::{ArtAnchors, ArtRect};
use serde_json::Value;

fn close(a: &ArtRect, b: &ArtRect, tolerance: f64) {
    let pairs = [(&a.x, &b.x), (&a.y, &b.y), (&a.w, &b.w), (&a.h, &b.h)];
    for (got, want) in pairs {
        let (got, want) = (f64::from(got.clone()), f64::from(want.clone()));
        assert!((got - want).abs() <= tolerance, "{a:?} vs {b:?}");
    }
}

fn fixture(name: &str) -> raster::Rgba {
    raster::decode(&std::fs::read(simulated_art::path(name)).unwrap()).unwrap()
}

fn rect(x: f64, y: f64, w: f64, h: f64) -> ArtRect {
    serde_json::from_value(serde_json::json!({"x":x,"y":y,"w":w,"h":h})).unwrap()
}

#[test]
#[ignore = "rewrites the committed simulated fixtures"]
fn regenerate_simulated_fixtures() {
    for name in simulated_art::FIXTURES {
        std::fs::write(simulated_art::path(name), simulated_art::generate(name)).unwrap();
    }
}

#[test]
fn committed_fixtures_match_their_generator() {
    for name in simulated_art::FIXTURES {
        assert_eq!(
            std::fs::read(simulated_art::path(name)).unwrap(),
            simulated_art::generate(name),
            "{name} drifted from its generator"
        );
    }
}

#[test]
fn simulated_vote_bar_track_radius_and_segments() {
    let measured = anchors::vote_bar(&fixture("simulated-votebar.png")).unwrap();
    close(
        measured.track_rect.as_ref().unwrap(),
        &rect(96.0 / 768.0, 104.0 / 256.0, 576.0 / 768.0, 48.0 / 256.0),
        0.004,
    );
    let radius = f64::from(measured.track_radius.clone().unwrap());
    assert!((radius - 0.25).abs() <= 0.08, "radius {radius}");
    assert_eq!(measured.segments.as_ref().unwrap().len(), 3);
    assert!(measured.window_rect.is_none() && measured.core_rect.is_none());
}

#[test]
fn simulated_frame_window() {
    let measured = anchors::frame(&fixture("simulated-frame.png")).unwrap();
    close(
        measured.window_rect.as_ref().unwrap(),
        &rect(24.0 / 768.0, 24.0 / 432.0, 720.0 / 768.0, 384.0 / 432.0),
        0.0001,
    );
    // An opaque square has no open centre.
    let mut solid = raster::Rgba::transparent(64, 64).unwrap();
    solid.pixels.iter_mut().for_each(|v| *v = 255);
    assert!(anchors::frame(&solid).is_err());
}

#[test]
fn simulated_beacon_core_is_the_changed_region() {
    let original = fixture("simulated-beacon.png");
    let base = fixture("simulated-beacon-base.png");
    let split = anchors::split(&original, &base).unwrap().unwrap();
    // Disc radius 70 at (288,330): bbox (218,260) 141x141; texture noise ignored.
    for (got, want) in [
        (split.core.x, 218),
        (split.core.y, 260),
        (split.core.w, 141),
        (split.core.h, 141),
    ] {
        assert!(got.abs_diff(want) <= 2, "{:?}", split.core);
    }
    assert_eq!(
        (split.effect.width, split.effect.height),
        (split.core.w, split.core.h)
    );
    let centre = split.effect.pixel(split.core.w / 2, split.core.h / 2);
    assert_eq!(centre, [60, 240, 250, 255]);
    assert_eq!(
        split.effect.pixel(0, 0)[3],
        0,
        "outside the disc stays clear"
    );
    // Identical images: no split, so the caller keeps base = original.
    assert!(anchors::split(&original, &original).unwrap().is_none());
}

#[test]
fn vessel_heuristic_is_relative_to_the_object() {
    let measured: ArtAnchors = anchors::draw_vessel(&simulated_art::beacon(false)).unwrap();
    // Object bbox (128,120) 320x580 on 576x768.
    close(
        measured.chamber_rect.as_ref().unwrap(),
        &rect(208.0 / 576.0, 236.0 / 768.0, 160.0 / 576.0, 232.0 / 768.0),
        0.001,
    );
    let mouth = measured.mouth.unwrap();
    assert!((f64::from(mouth.x) - 0.5).abs() < 0.001);
    assert!((f64::from(mouth.y) - (120.0 + 580.0 * 0.88) / 768.0).abs() < 0.001);
}

/// Library images (apps/desktop/public/art/library) against their catalogued
/// anchors, which were measured independently when the library was built.
#[test]
fn library_anchors_are_reproduced() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../apps/desktop/public/art/library");
    let catalog: Value =
        serde_json::from_slice(&std::fs::read(root.join("library.json")).unwrap()).unwrap();
    let cases = [
        ("votebar-09", "track_rect", 0.012),
        ("votebar-10", "track_rect", 0.012),
        ("votebar-16", "track_rect", 0.012),
        ("frame-02", "window_rect", 0.004),
        ("frame-12", "window_rect", 0.004),
        ("frame-19", "window_rect", 0.004),
    ];
    for (id, key, tolerance) in cases {
        let entry = catalog["assets"]
            .as_array()
            .unwrap()
            .iter()
            .find(|a| a["id"] == id)
            .unwrap();
        let file = entry["file"]
            .as_str()
            .unwrap()
            .trim_start_matches("library/");
        let image = raster::decode(&std::fs::read(root.join(file)).unwrap()).unwrap();
        let measured = if key == "track_rect" {
            anchors::vote_bar(&image).unwrap().track_rect
        } else {
            anchors::frame(&image).unwrap().window_rect
        };
        let expected: ArtRect = serde_json::from_value(entry["anchors"][key].clone()).unwrap();
        close(&measured.unwrap(), &expected, tolerance);
    }
}
