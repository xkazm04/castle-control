//! Deterministic anchor measurement by image analysis; no model is consulted.
//!
//! - vote bar: `track_rect` is the largest enclosed dark region inside the
//!   housing; `track_radius` is its corner radius over its height, estimated
//!   from the diagonal gap at each corner; `segments` come from the housing hues.
//! - frame: `window_rect` is the largest enclosed transparent region around the
//!   centre (fallback: an enclosed near-black opaque region around the centre).
//! - beacon: `core_rect` is the bounding box of the largest region whose pixels
//!   differ between the original and the effect-removed base (see `split`).
//! - draw vessel (v1 heuristic, documented): within the opaque bounding box of
//!   the object, `chamber_rect` is the central 50% of the width by the 20%..60%
//!   band of the height and `mouth` sits at the horizontal centre, 88% down.
//!   No entry token is derived.
use super::ArtError;
use super::palette;
use super::raster::Rgba;
use super::regions::{Mask, PixelRect, Region, luma, opaque_bbox};
use cc_types::{ArtAnchors, ArtPoint, ArtRect, Intensity};

const OPAQUE: u8 = 200;
const TRANSPARENT: u8 = 32;
/// Largest luma of a "dark" track pixel; tracks are prompted dark and tinted.
const DARK_LUMA: f64 = 72.0;
/// Near-black window fallback for frames generated with a black centre.
const BLACK_LUMA: f64 = 24.0;
/// Largest per-channel distance from the track's centre colour still "evenly lit".
const EVEN: f64 = 36.0;

trait AbsDiff {
    fn abs_diff_f(self, other: f64) -> f64;
}
impl AbsDiff for f64 {
    fn abs_diff_f(self, other: f64) -> f64 {
        (self - other).abs()
    }
}

/// Median colour of the candidate's pixels on its middle row.
fn seed_colour(image: &Rgba, region: &Region) -> [f64; 3] {
    let row = region.bbox.y + region.bbox.h / 2;
    let mut channels: [Vec<u8>; 3] = Default::default();
    for &i in &region.members {
        if i / image.width == row {
            let p = image.pixel(i % image.width, row);
            for c in 0..3 {
                channels[c].push(p[c]);
            }
        }
    }
    channels.map(|mut v| {
        v.sort_unstable();
        v.get(v.len() / 2).map_or(0.0, |&m| f64::from(m))
    })
}

fn unit(value: f64) -> Result<Intensity, ArtError> {
    Intensity::try_from(value.clamp(0.0, 1.0)).map_err(|_| ArtError::Invalid)
}

/// Normalise a pixel rectangle to fractions of the image.
pub fn rect(image: &Rgba, r: PixelRect) -> Result<ArtRect, ArtError> {
    let (w, h) = (f64::from(image.width), f64::from(image.height));
    Ok(ArtRect {
        x: unit(round(f64::from(r.x) / w))?,
        y: unit(round(f64::from(r.y) / h))?,
        w: unit(round(f64::from(r.w) / w))?,
        h: unit(round(f64::from(r.h) / h))?,
    })
}

fn point(x: f64, y: f64) -> Result<ArtPoint, ArtError> {
    Ok(ArtPoint {
        x: unit(round(x))?,
        y: unit(round(y))?,
    })
}

/// Four decimals: stable across platforms and plenty for a 4K canvas.
fn round(value: f64) -> f64 {
    (value * 10_000.0).round() / 10_000.0
}

/// Track rect, radius and three segment colours of a vote bar housing.
pub fn vote_bar(image: &Rgba) -> Result<ArtAnchors, ArtError> {
    let housing = opaque_bbox(image, OPAQUE).ok_or(ArtError::Invalid)?;
    let dark = Mask::from_fn(image, |p| p[3] >= OPAQUE && luma(p) <= DARK_LUMA).open(1);
    let candidate = dark
        .regions()
        .into_iter()
        .filter(|r| r.enclosed && r.bbox.w * 10 >= housing.w * 3 && r.bbox.w > r.bbox.h)
        .max_by_key(|r| r.pixels)
        .ok_or(ArtError::Invalid)?;
    // The dark candidate can bleed into dark housing metal. Refine it to the
    // evenly lit interior: pixels close to the colour at the candidate's
    // centre line, keeping the enclosed region through that centre.
    let seed = seed_colour(image, &candidate);
    let even = Mask::from_fn(image, |p| {
        p[3] >= OPAQUE && (0..3).all(|c| f64::from(p[c]).abs_diff_f(seed[c]) <= EVEN)
    })
    .open(1);
    let (cx, cy) = (
        candidate.bbox.x + candidate.bbox.w / 2,
        candidate.bbox.y + candidate.bbox.h / 2,
    );
    let refined = even.regions().into_iter().find(|r| {
        r.enclosed
            && r.bbox.contains(cx, cy)
            && r.bbox.w * 10 >= housing.w * 3
            && r.bbox.w > r.bbox.h
            && r.members.contains(&(cy * image.width + cx))
    });
    let (dark, track) = match refined {
        Some(region) => (even, region),
        None => (dark, candidate),
    };
    let track = &track;
    let radius = corner_radius(&dark, track);
    let mean = palette::mean(image, track.members.iter().copied());
    let housing_pixels = (0..image.width * image.height).filter(|&i| {
        let (x, y) = (i % image.width, i / image.width);
        !track.bbox.contains(x, y) && image.pixel(x, y)[3] >= OPAQUE
    });
    Ok(ArtAnchors {
        track_rect: Some(rect(image, track.bbox)?),
        track_radius: Some(unit(round(radius))?),
        segments: Some(palette::segments(image, housing_pixels, mean)?),
        ..ArtAnchors::default()
    })
}

/// Corner radius over track height. A rounded corner of radius r leaves a gap
/// of r(1 - 1/sqrt 2) along the diagonal from the bounding-box corner.
fn corner_radius(mask: &Mask, region: &Region) -> f64 {
    let b = region.bbox;
    let limit = b.w.min(b.h) / 2;
    let member = |x: u32, y: u32| mask.bits[(y * mask.width + x) as usize];
    let corners: [(u32, u32, i64, i64); 4] = [
        (b.x, b.y, 1, 1),
        (b.x + b.w - 1, b.y, -1, 1),
        (b.x, b.y + b.h - 1, 1, -1),
        (b.x + b.w - 1, b.y + b.h - 1, -1, -1),
    ];
    let gaps: u32 = corners
        .iter()
        .map(|&(x, y, dx, dy)| {
            (0..limit)
                .find(|&k| {
                    let px = (i64::from(x) + dx * i64::from(k)) as u32;
                    let py = (i64::from(y) + dy * i64::from(k)) as u32;
                    member(px, py)
                })
                .unwrap_or(limit)
        })
        .sum();
    let gap = f64::from(gaps) / 4.0;
    let radius = gap / (1.0 - std::f64::consts::FRAC_1_SQRT_2);
    (radius / f64::from(b.h)).min(0.5)
}

/// The open centre of a facecam frame.
pub fn frame(image: &Rgba) -> Result<ArtAnchors, ArtError> {
    let pick = |regions: Vec<Region>| {
        let enclosed = regions.into_iter().filter(|r| r.enclosed);
        let mut enclosed: Vec<_> = enclosed.collect();
        enclosed
            .iter()
            .position(|r| r.contains_centre)
            .map(|i| enclosed.swap_remove(i))
            .or_else(|| enclosed.into_iter().next())
    };
    let window = pick(Mask::from_fn(image, |p| p[3] < TRANSPARENT).regions())
        .filter(|r| {
            r.contains_centre
                || r.bbox.area() * 4 >= u64::from(image.width) * u64::from(image.height)
        })
        .or_else(|| {
            pick(Mask::from_fn(image, |p| p[3] >= OPAQUE && luma(p) <= BLACK_LUMA).regions())
                .filter(|r| r.contains_centre)
        })
        .ok_or(ArtError::Invalid)?;
    Ok(ArtAnchors {
        window_rect: Some(rect(image, window.bbox)?),
        ..ArtAnchors::default()
    })
}

/// v1 vessel heuristic; see the module documentation.
pub fn draw_vessel(image: &Rgba) -> Result<ArtAnchors, ArtError> {
    let object = opaque_bbox(image, OPAQUE).ok_or(ArtError::Invalid)?;
    let (ox, oy, ow, oh) = (
        f64::from(object.x),
        f64::from(object.y),
        f64::from(object.w),
        f64::from(object.h),
    );
    let (w, h) = (f64::from(image.width), f64::from(image.height));
    Ok(ArtAnchors {
        chamber_rect: Some(ArtRect {
            x: unit(round((ox + ow * 0.25) / w))?,
            y: unit(round((oy + oh * 0.2) / h))?,
            w: unit(round(ow * 0.5 / w))?,
            h: unit(round(oh * 0.4 / h))?,
        }),
        mouth: Some(point((ox + ow * 0.5) / w, (oy + oh * 0.88) / h)?),
        ..ArtAnchors::default()
    })
}

/// Result of comparing an original beacon with its effect-removed base.
#[derive(Debug)]
pub struct Split {
    pub core: PixelRect,
    /// Original pixels inside the difference, transparent elsewhere, cropped
    /// to `core` so the sprite fills `core_rect` exactly.
    pub effect: Rgba,
}

/// Per-pixel difference above this (max channel delta, alpha-weighted)
/// counts as "changed". Generative edits re-render faint noise everywhere.
const DIFF: u16 = 72;

/// Largest changed region between `original` and `base`. None when the images
/// differ in size, nothing changed, or the change is implausible for a core
/// (under 0.1% or over 60% of the canvas): the caller keeps base = original.
pub fn split(original: &Rgba, base: &Rgba) -> Result<Option<Split>, ArtError> {
    if original.width != base.width || original.height != base.height {
        return Ok(None);
    }
    let changed = Mask {
        width: original.width,
        height: original.height,
        bits: original
            .pixels
            .chunks_exact(4)
            .zip(base.pixels.chunks_exact(4))
            .map(|(a, b)| difference(a, b) > DIFF)
            .collect(),
    }
    .open(2);
    let total = u64::from(original.width) * u64::from(original.height);
    let Some(region) = changed.regions().into_iter().next() else {
        return Ok(None);
    };
    if region.pixels * 1000 < total || region.bbox.area() * 10 > total * 6 {
        return Ok(None);
    }
    let soft = Mask {
        width: changed.width,
        height: changed.height,
        bits: {
            let mut bits = vec![false; changed.bits.len()];
            for &i in &region.members {
                bits[i as usize] = true;
            }
            bits
        },
    }
    .dilate(2);
    let core = region.bbox;
    let mut effect = Rgba::transparent(core.w, core.h)?;
    for y in 0..core.h {
        for x in 0..core.w {
            let (sx, sy) = (core.x + x, core.y + y);
            if soft.bits[(sy * soft.width + sx) as usize] {
                effect.set(x, y, original.pixel(sx, sy));
            }
        }
    }
    Ok(Some(Split { core, effect }))
}

fn difference(a: &[u8], b: &[u8]) -> u16 {
    // Premultiply so differences under full transparency do not count.
    let pre = |p: &[u8], c: usize| u16::from(p[c]) * u16::from(p[3]) / 255;
    (0..3)
        .map(|c| pre(a, c).abs_diff(pre(b, c)))
        .chain(std::iter::once(u16::from(a[3]).abs_diff(u16::from(b[3]))))
        .max()
        .unwrap_or(0)
}
