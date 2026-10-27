//! Screenshot bytes stay in memory; no real scenes or images become fixtures.
use crate::live_support::{Observer, success};
use base64::{Engine, engine::general_purpose::STANDARD};
use serde_json::json;
use std::time::Duration;

pub async fn check(observer: &mut Observer, source_name: &str) {
    let version = observer.request("GetVersion", json!({})).await;
    success(&version);
    assert!(
        version["responseData"]["supportedImageFormats"]
            .as_array()
            .is_some_and(|formats| formats.iter().any(|format| format == "bmp")),
        "live screenshot requires OBS's BMP writer"
    );
    // Give CEF time to load before taking the first frame; retry within 10 s.
    for _ in 0..10 {
        tokio::time::sleep(Duration::from_secs(1)).await;
        let response = observer
            .request(
                "GetSourceScreenshot",
                json!({"sourceName":source_name,"imageFormat":"bmp",
                    "imageWidth":320,"imageHeight":180}),
            )
            .await;
        success(&response);
        let encoded = response["responseData"]["imageData"]
            .as_str()
            .and_then(|data| data.strip_prefix("data:image/bmp;base64,"))
            .expect("live screenshot must be a BMP data URL (image withheld)");
        let bytes = STANDARD
            .decode(encoded)
            .expect("live screenshot base64 invalid (image withheld)");
        if nonwhite_bmp(&bytes).expect("live screenshot BMP invalid (image withheld)") {
            return;
        }
    }
    panic!(
        "live overlay screenshot remained white or transparent: inconclusive on owner OBS; human visual check is authoritative"
    );
}

// Qt's BMP writer emits uncompressed BGR/BGRA. Check pixels, never BMP headers
// or row padding: those contain non-white bytes even for an all-white image.
// Transparent BGRA pixels are inconclusive regardless of their hidden RGB.
fn nonwhite_bmp(bytes: &[u8]) -> Option<bool> {
    fn word(bytes: &[u8], offset: usize) -> Option<u32> {
        Some(u32::from_le_bytes(
            bytes.get(offset..offset + 4)?.try_into().ok()?,
        ))
    }
    if bytes.get(..2)? != b"BM"
        || word(bytes, 14)? < 40
        || word(bytes, 18)? != 320
        || ![180, (-180_i32) as u32].contains(&word(bytes, 22)?)
        || bytes.get(26..28)? != [1, 0]
        || word(bytes, 30)? != 0
    {
        return None;
    }
    let pixel_size = match bytes.get(28..30)? {
        [24, 0] => 3,
        [32, 0] => 4,
        _ => return None,
    };
    let offset = usize::try_from(word(bytes, 10)?).ok()?;
    if offset < 14 + usize::try_from(word(bytes, 14)?).ok()? {
        return None;
    }
    let stride = (320 * pixel_size + 3) & !3;
    let end = offset.checked_add(stride * 180)?;
    let pixels = bytes.get(offset..end)?;
    Some(pixels.chunks_exact(stride).any(|row| {
        row[..320 * pixel_size]
            .chunks_exact(pixel_size)
            .any(|pixel| pixel[..3] != [255, 255, 255] && (pixel_size == 3 || pixel[3] != 0))
    }))
}

#[test]
fn simulated_screenshot_checks_pixels_and_rejects_invalid_frames() {
    // Synthetic white 320x180 BMP, with non-white header and alpha bytes.
    let mut bytes = vec![0; 54 + 320 * 180 * 4];
    bytes[..2].copy_from_slice(b"BM");
    for (offset, value) in [(10, 54_u32), (14, 40), (18, 320), (22, 180)] {
        bytes[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
    }
    bytes[26] = 1;
    bytes[28] = 32;
    for pixel in bytes[54..].chunks_exact_mut(4) {
        pixel[..3].fill(255);
        pixel[3] = 255;
    }
    assert_eq!(nonwhite_bmp(&bytes), Some(false));
    bytes[54] = 0;
    assert_eq!(nonwhite_bmp(&bytes), Some(true));
    // Owner OBS returns fully transparent frames: hidden RGB is inconclusive.
    for pixel in bytes[54..].chunks_exact_mut(4) {
        pixel[3] = 0;
    }
    assert_eq!(nonwhite_bmp(&bytes), Some(false));
    bytes[54..].fill(0);
    assert_eq!(nonwhite_bmp(&bytes), Some(false));
    assert_eq!(nonwhite_bmp(&bytes[..100]), None);
    bytes[30] = 1;
    assert_eq!(nonwhite_bmp(&bytes), None);
}
