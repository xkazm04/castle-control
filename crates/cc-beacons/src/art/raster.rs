//! The one decode/encode door for art images: PNG and still WebP into RGBA8.
//! Bounded before allocation; animated or oversized input is refused.
use super::ArtError;
use std::io::Cursor;

/// Largest edge accepted from any provider or package (OpenAI tops out at 3840).
pub const MAX_EDGE: u32 = 4096;
const MAX_PIXELS: u64 = 16 * 1024 * 1024;

/// Straight (non-premultiplied) RGBA8, row-major, no padding.
#[derive(Clone, PartialEq, Eq)]
pub struct Rgba {
    pub width: u32,
    pub height: u32,
    pub pixels: Vec<u8>,
}

impl std::fmt::Debug for Rgba {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Rgba({}x{})", self.width, self.height)
    }
}

impl Rgba {
    /// Fully transparent image of the given size.
    pub fn transparent(width: u32, height: u32) -> Result<Self, ArtError> {
        check_size(width, height)?;
        Ok(Self {
            width,
            height,
            pixels: vec![0; width as usize * height as usize * 4],
        })
    }
    pub fn pixel(&self, x: u32, y: u32) -> [u8; 4] {
        let i = (y as usize * self.width as usize + x as usize) * 4;
        [
            self.pixels[i],
            self.pixels[i + 1],
            self.pixels[i + 2],
            self.pixels[i + 3],
        ]
    }
    pub fn set(&mut self, x: u32, y: u32, value: [u8; 4]) {
        let i = (y as usize * self.width as usize + x as usize) * 4;
        self.pixels[i..i + 4].copy_from_slice(&value);
    }
    /// Copy of the rectangle `[x, x+w) x [y, y+h)`, which must lie inside.
    pub fn crop(&self, x: u32, y: u32, w: u32, h: u32) -> Result<Self, ArtError> {
        if w == 0 || h == 0 || x + w > self.width || y + h > self.height {
            return Err(ArtError::Invalid);
        }
        let mut out = Self::transparent(w, h)?;
        for row in 0..h {
            let from = ((y + row) as usize * self.width as usize + x as usize) * 4;
            let to = row as usize * w as usize * 4;
            out.pixels[to..to + w as usize * 4]
                .copy_from_slice(&self.pixels[from..from + w as usize * 4]);
        }
        Ok(out)
    }
}

fn check_size(width: u32, height: u32) -> Result<(), ArtError> {
    if width == 0
        || height == 0
        || width > MAX_EDGE
        || height > MAX_EDGE
        || u64::from(width) * u64::from(height) > MAX_PIXELS
    {
        return Err(ArtError::Invalid);
    }
    Ok(())
}

pub fn is_png(bytes: &[u8]) -> bool {
    bytes.starts_with(b"\x89PNG\r\n\x1a\n")
}
pub fn is_webp(bytes: &[u8]) -> bool {
    bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP")
}

/// Decode PNG or still WebP. Any other format, or a malformed image, is Invalid.
pub fn decode(bytes: &[u8]) -> Result<Rgba, ArtError> {
    if is_png(bytes) {
        decode_png(bytes)
    } else if is_webp(bytes) {
        decode_webp(bytes)
    } else {
        Err(ArtError::Invalid)
    }
}

fn decode_png(bytes: &[u8]) -> Result<Rgba, ArtError> {
    let mut decoder = png::Decoder::new_with_limits(
        Cursor::new(bytes),
        png::Limits {
            bytes: MAX_PIXELS as usize * 4 * 2,
        },
    );
    decoder.set_transformations(
        png::Transformations::EXPAND | png::Transformations::STRIP_16 | png::Transformations::ALPHA,
    );
    let mut reader = decoder.read_info().map_err(|_| ArtError::Invalid)?;
    let (width, height) = {
        let info = reader.info();
        (info.width, info.height)
    };
    check_size(width, height)?;
    let size = reader.output_buffer_size().ok_or(ArtError::Invalid)?;
    let mut buffer = vec![0; size];
    let frame = reader
        .next_frame(&mut buffer)
        .map_err(|_| ArtError::Invalid)?;
    buffer.truncate(frame.buffer_size());
    let pixels = match frame.color_type {
        png::ColorType::Rgba => buffer,
        png::ColorType::GrayscaleAlpha => buffer
            .chunks_exact(2)
            .flat_map(|ga| [ga[0], ga[0], ga[0], ga[1]])
            .collect(),
        _ => return Err(ArtError::Invalid),
    };
    if pixels.len() != width as usize * height as usize * 4 {
        return Err(ArtError::Invalid);
    }
    Ok(Rgba {
        width,
        height,
        pixels,
    })
}

fn decode_webp(bytes: &[u8]) -> Result<Rgba, ArtError> {
    let mut decoder =
        image_webp::WebPDecoder::new(Cursor::new(bytes)).map_err(|_| ArtError::Invalid)?;
    if decoder.is_animated() {
        return Err(ArtError::Invalid);
    }
    let (width, height) = decoder.dimensions();
    check_size(width, height)?;
    let size = decoder.output_buffer_size().ok_or(ArtError::Invalid)?;
    let mut buffer = vec![0; size];
    decoder
        .read_image(&mut buffer)
        .map_err(|_| ArtError::Invalid)?;
    let pixels = if decoder.has_alpha() {
        buffer
    } else {
        buffer
            .chunks_exact(3)
            .flat_map(|rgb| [rgb[0], rgb[1], rgb[2], 255])
            .collect()
    };
    if pixels.len() != width as usize * height as usize * 4 {
        return Err(ArtError::Invalid);
    }
    Ok(Rgba {
        width,
        height,
        pixels,
    })
}

/// Lossless RGBA8 PNG. Deterministic for identical input.
pub fn encode_png(image: &Rgba) -> Result<Vec<u8>, ArtError> {
    check_size(image.width, image.height)?;
    let mut out = Vec::new();
    let mut encoder = png::Encoder::new(&mut out, image.width, image.height);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    let mut writer = encoder.write_header().map_err(|_| ArtError::Invalid)?;
    writer
        .write_image_data(&image.pixels)
        .map_err(|_| ArtError::Invalid)?;
    writer.finish().map_err(|_| ArtError::Invalid)?;
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn png_round_trips_and_garbage_is_refused() {
        let mut image = Rgba::transparent(3, 2).unwrap();
        image.set(1, 1, [10, 20, 30, 40]);
        let bytes = encode_png(&image).unwrap();
        assert!(is_png(&bytes));
        assert_eq!(decode(&bytes).unwrap(), image);
        assert_eq!(decode(b"simulated not an image"), Err(ArtError::Invalid));
        assert_eq!(Rgba::transparent(0, 4).unwrap_err(), ArtError::Invalid);
        assert_eq!(
            image.crop(1, 1, 2, 1).unwrap().pixel(0, 0),
            [10, 20, 30, 40]
        );
        assert!(image.crop(2, 0, 2, 1).is_err());
    }
}
