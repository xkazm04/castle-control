//! Vote segment colours derived from the housing palette, checked for
//! contrast against the measured track.
use super::ArtError;
use super::raster::Rgba;
use cc_types::HexColor;

const BINS: usize = 24;
/// Minimum hue distance between two chosen segment hues, in bins (45 degrees).
const SEPARATION: usize = 3;
/// WCAG contrast ratio every segment keeps against the track interior.
const MIN_CONTRAST: f64 = 3.0;
/// Hue used when the housing is fully neutral (grey metal): a cool cyan.
const NEUTRAL_HUE: f64 = 190.0;

/// Mean straight RGB of the given row-major pixel indices.
pub fn mean(image: &Rgba, indices: impl Iterator<Item = u32>) -> [f64; 3] {
    let (mut sum, mut n) = ([0.0; 3], 0.0);
    for i in indices {
        let p = image.pixel(i % image.width, i / image.width);
        for c in 0..3 {
            sum[c] += f64::from(p[c]);
        }
        n += 1.0;
    }
    if n == 0.0 {
        [0.0; 3]
    } else {
        sum.map(|v| v / n)
    }
}

fn hsv(p: [u8; 4]) -> (f64, f64, f64) {
    let [r, g, b] = [p[0], p[1], p[2]].map(|v| f64::from(v) / 255.0);
    let max = r.max(g).max(b);
    let delta = max - r.min(g).min(b);
    let hue = if delta == 0.0 {
        0.0
    } else if max == r {
        60.0 * ((g - b) / delta).rem_euclid(6.0)
    } else if max == g {
        60.0 * ((b - r) / delta + 2.0)
    } else {
        60.0 * ((r - g) / delta + 4.0)
    };
    let saturation = if max == 0.0 { 0.0 } else { delta / max };
    (hue, saturation, max)
}

fn rgb(hue: f64, saturation: f64, value: f64) -> [f64; 3] {
    let c = value * saturation;
    let x = c * (1.0 - ((hue / 60.0).rem_euclid(2.0) - 1.0).abs());
    let m = value - c;
    let (r, g, b) = match (hue.rem_euclid(360.0) / 60.0) as u32 {
        0 => (c, x, 0.0),
        1 => (x, c, 0.0),
        2 => (0.0, c, x),
        3 => (0.0, x, c),
        4 => (x, 0.0, c),
        _ => (c, 0.0, x),
    };
    [r + m, g + m, b + m].map(|v| v * 255.0)
}

fn luminance(rgb: [f64; 3]) -> f64 {
    let lin = |v: f64| {
        let v = v / 255.0;
        if v <= 0.040_45 {
            v / 12.92
        } else {
            ((v + 0.055) / 1.055).powf(2.4)
        }
    };
    0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2])
}

pub fn contrast(a: [f64; 3], b: [f64; 3]) -> f64 {
    let (la, lb) = (luminance(a), luminance(b));
    (la.max(lb) + 0.05) / (la.min(lb) + 0.05)
}

/// Three distinct vivid hues from the housing (most saturated weight first),
/// completed by triadic rotation, each brightened or darkened until it reaches
/// MIN_CONTRAST against `track`.
pub fn segments(
    image: &Rgba,
    housing: impl Iterator<Item = u32>,
    track: [f64; 3],
) -> Result<[HexColor; 3], ArtError> {
    let mut histogram = [0.0f64; BINS];
    for i in housing {
        let (h, s, v) = hsv(image.pixel(i % image.width, i / image.width));
        if s >= 0.25 && v >= 0.2 {
            histogram[(h / (360.0 / BINS as f64)) as usize % BINS] += s * v;
        }
    }
    let mut order: Vec<usize> = (0..BINS).filter(|&b| histogram[b] > 0.0).collect();
    order.sort_by(|&a, &b| histogram[b].total_cmp(&histogram[a]).then(a.cmp(&b)));
    let distance = |a: usize, b: usize| {
        let d = a.abs_diff(b);
        d.min(BINS - d)
    };
    let mut chosen: Vec<usize> = Vec::new();
    for bin in order {
        if chosen.len() < 3 && chosen.iter().all(|&c| distance(c, bin) >= SEPARATION) {
            chosen.push(bin);
        }
    }
    let step = 360.0 / BINS as f64;
    let mut hues: Vec<f64> = chosen.iter().map(|&b| (b as f64 + 0.5) * step).collect();
    let first = hues.first().copied().unwrap_or(NEUTRAL_HUE);
    for turn in [120.0, 240.0, 60.0, 180.0, 300.0] {
        let hue = (first + turn).rem_euclid(360.0);
        let far = hues.iter().all(|&h| {
            let d = (h - hue).abs();
            d.min(360.0 - d) >= step * SEPARATION as f64
        });
        if hues.len() < 3 && far {
            hues.push(hue);
        }
    }
    let colours: Vec<HexColor> = hues
        .into_iter()
        .take(3)
        .map(|hue| {
            let dark_track = luminance(track) < 0.18;
            let mut value: f64 = if dark_track { 1.0 } else { 0.45 };
            let mut saturation: f64 = 0.8;
            for _ in 0..12 {
                if contrast(rgb(hue, saturation, value), track) >= MIN_CONTRAST {
                    break;
                }
                if dark_track {
                    saturation = (saturation - 0.1).max(0.0);
                } else {
                    value = (value - 0.05).max(0.0);
                }
            }
            let [r, g, b] = rgb(hue, saturation, value).map(|v| v.round().clamp(0.0, 255.0) as u8);
            HexColor::try_from(format!("#{r:02X}{g:02X}{b:02X}")).map_err(|_| ArtError::Invalid)
        })
        .collect::<Result<_, _>>()?;
    colours.try_into().map_err(|_| ArtError::Invalid)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hex(c: &HexColor) -> [f64; 3] {
        let s = String::from(c.clone());
        [1, 3, 5].map(|i| f64::from(u8::from_str_radix(&s[i..i + 2], 16).unwrap()))
    }

    #[test]
    fn segments_follow_housing_hues_and_contrast_with_a_dark_track() {
        let mut image = Rgba::transparent(4, 1).unwrap();
        image.set(0, 0, [200, 40, 40, 255]); // red housing
        image.set(1, 0, [200, 40, 40, 255]);
        image.set(2, 0, [40, 60, 200, 255]); // blue accent
        let track = [12.0, 14.0, 20.0];
        let colours = segments(&image, 0..3, track).unwrap();
        for colour in &colours {
            assert!(contrast(hex(colour), track) >= MIN_CONTRAST);
        }
        assert_eq!(String::from(colours[0].clone()), "#FF4C33");
        let distinct: std::collections::BTreeSet<_> =
            colours.iter().map(|c| String::from(c.clone())).collect();
        assert_eq!(distinct.len(), 3);
    }

    #[test]
    fn neutral_housing_still_yields_three_contrasting_colours() {
        let mut image = Rgba::transparent(2, 1).unwrap();
        image.set(0, 0, [120, 120, 120, 255]);
        let colours = segments(&image, 0..1, [200.0, 200.0, 200.0]).unwrap();
        for colour in &colours {
            assert!(contrast(hex(colour), [200.0, 200.0, 200.0]) >= MIN_CONTRAST);
        }
    }
}
