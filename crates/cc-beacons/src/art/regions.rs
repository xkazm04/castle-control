//! Pixel masks and connected regions for deterministic anchor measurement.
use super::raster::Rgba;

/// Pixel rectangle `[x, x+w) x [y, y+h)`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PixelRect {
    pub x: u32,
    pub y: u32,
    pub w: u32,
    pub h: u32,
}

impl PixelRect {
    pub fn contains(&self, x: u32, y: u32) -> bool {
        x >= self.x && y >= self.y && x < self.x + self.w && y < self.y + self.h
    }
    pub fn area(&self) -> u64 {
        u64::from(self.w) * u64::from(self.h)
    }
}

/// One 4-connected region of a mask.
#[derive(Debug, Clone)]
pub struct Region {
    pub bbox: PixelRect,
    pub pixels: u64,
    /// True when no pixel lies on the image border.
    pub enclosed: bool,
    pub contains_centre: bool,
    /// Row-major pixel indices, kept for sprite extraction.
    pub members: Vec<u32>,
}

pub struct Mask {
    pub width: u32,
    pub height: u32,
    pub bits: Vec<bool>,
}

impl Mask {
    pub fn from_fn(image: &Rgba, mut test: impl FnMut([u8; 4]) -> bool) -> Self {
        let bits = image
            .pixels
            .chunks_exact(4)
            .map(|p| test([p[0], p[1], p[2], p[3]]))
            .collect();
        Self {
            width: image.width,
            height: image.height,
            bits,
        }
    }

    fn get(&self, x: i64, y: i64) -> bool {
        x >= 0
            && y >= 0
            && x < i64::from(self.width)
            && y < i64::from(self.height)
            && self.bits[(y as usize) * self.width as usize + x as usize]
    }

    /// Erode then dilate by `radius` (square kernel): removes speckle thinner
    /// than the kernel while keeping the shape of larger regions.
    pub fn open(&self, radius: u32) -> Self {
        let erode = self.morph(radius, true);
        erode.morph(radius, false)
    }

    pub fn dilate(&self, radius: u32) -> Self {
        self.morph(radius, false)
    }

    fn morph(&self, radius: u32, erode: bool) -> Self {
        let r = i64::from(radius);
        // Separable square kernel: horizontal pass then vertical pass.
        let pass = |source: &Mask, horizontal: bool| {
            let mut bits = vec![false; source.bits.len()];
            for y in 0..i64::from(source.height) {
                for x in 0..i64::from(source.width) {
                    let mut hit = erode;
                    for d in -r..=r {
                        let (sx, sy) = if horizontal { (x + d, y) } else { (x, y + d) };
                        let value = source.get(sx, sy);
                        if erode && !value {
                            hit = false;
                            break;
                        }
                        if !erode && value {
                            hit = true;
                            break;
                        }
                    }
                    bits[y as usize * source.width as usize + x as usize] = hit;
                }
            }
            Mask {
                width: source.width,
                height: source.height,
                bits,
            }
        };
        pass(&pass(self, true), false)
    }

    /// All 4-connected regions, largest first (ties keep scan order).
    pub fn regions(&self) -> Vec<Region> {
        let (w, h) = (self.width as usize, self.height as usize);
        let mut seen = vec![false; self.bits.len()];
        let mut regions = Vec::new();
        let mut stack = Vec::new();
        let centre = (self.height / 2) as usize * w + (self.width / 2) as usize;
        for start in 0..self.bits.len() {
            if seen[start] || !self.bits[start] {
                continue;
            }
            seen[start] = true;
            stack.push(start);
            let mut members = Vec::new();
            let (mut x0, mut y0, mut x1, mut y1) = (usize::MAX, usize::MAX, 0, 0);
            let mut enclosed = true;
            let mut contains_centre = false;
            while let Some(index) = stack.pop() {
                members.push(index as u32);
                contains_centre |= index == centre;
                let (x, y) = (index % w, index / w);
                x0 = x0.min(x);
                y0 = y0.min(y);
                x1 = x1.max(x);
                y1 = y1.max(y);
                if x == 0 || y == 0 || x + 1 == w || y + 1 == h {
                    enclosed = false;
                }
                let mut visit = |next: usize| {
                    if !seen[next] && self.bits[next] {
                        seen[next] = true;
                        stack.push(next);
                    }
                };
                if x > 0 {
                    visit(index - 1);
                }
                if x + 1 < w {
                    visit(index + 1);
                }
                if y > 0 {
                    visit(index - w);
                }
                if y + 1 < h {
                    visit(index + w);
                }
            }
            regions.push(Region {
                bbox: PixelRect {
                    x: x0 as u32,
                    y: y0 as u32,
                    w: (x1 - x0 + 1) as u32,
                    h: (y1 - y0 + 1) as u32,
                },
                pixels: members.len() as u64,
                enclosed,
                contains_centre,
                members,
            });
        }
        regions.sort_by_key(|r| std::cmp::Reverse(r.pixels));
        regions
    }
}

/// Bounding box of every pixel whose alpha reaches `alpha_min`.
pub fn opaque_bbox(image: &Rgba, alpha_min: u8) -> Option<PixelRect> {
    let (mut x0, mut y0, mut x1, mut y1) = (u32::MAX, u32::MAX, 0, 0);
    for y in 0..image.height {
        for x in 0..image.width {
            if image.pixel(x, y)[3] >= alpha_min {
                x0 = x0.min(x);
                y0 = y0.min(y);
                x1 = x1.max(x);
                y1 = y1.max(y);
            }
        }
    }
    (x0 != u32::MAX).then(|| PixelRect {
        x: x0,
        y: y0,
        w: x1 - x0 + 1,
        h: y1 - y0 + 1,
    })
}

/// Rec. 709 luma of a straight RGB pixel, 0..255.
pub fn luma(p: [u8; 4]) -> f64 {
    0.2126 * f64::from(p[0]) + 0.7152 * f64::from(p[1]) + 0.0722 * f64::from(p[2])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn regions_report_enclosure_centre_and_size_order() {
        let mut image = Rgba::transparent(9, 9).unwrap();
        // A ring: the enclosed hole is the centre, the outside touches the border.
        for y in 1..8 {
            for x in 1..8 {
                if x == 1 || y == 1 || x == 7 || y == 7 {
                    image.set(x, y, [200, 200, 200, 255]);
                }
            }
        }
        let regions = Mask::from_fn(&image, |p| p[3] < 32).regions();
        assert_eq!(regions.len(), 2);
        assert!(!regions[0].enclosed);
        let hole = &regions[1];
        assert!(hole.enclosed && hole.contains_centre);
        assert_eq!(
            hole.bbox,
            PixelRect {
                x: 2,
                y: 2,
                w: 5,
                h: 5
            }
        );
        assert_eq!(
            opaque_bbox(&image, 128),
            Some(PixelRect {
                x: 1,
                y: 1,
                w: 7,
                h: 7
            })
        );
    }

    #[test]
    fn opening_removes_speckle_but_keeps_blocks() {
        let mut image = Rgba::transparent(12, 12).unwrap();
        image.set(1, 1, [0, 0, 0, 255]);
        for y in 4..10 {
            for x in 4..10 {
                image.set(x, y, [0, 0, 0, 255]);
            }
        }
        let opened = Mask::from_fn(&image, |p| p[3] > 0).open(1);
        let regions = opened.regions();
        assert_eq!(regions.len(), 1);
        assert_eq!(
            regions[0].bbox,
            PixelRect {
                x: 4,
                y: 4,
                w: 6,
                h: 6
            }
        );
    }
}
