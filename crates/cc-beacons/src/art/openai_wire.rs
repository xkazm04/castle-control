//! The single validation door for OpenAI image requests and responses.
use super::openai::{OpenAiBackground, OpenAiImageRequest, OpenAiModel, OpenAiSize};
use super::{ArtError, Charge, CostRecord, raster};
use base64::Engine as _;
use serde::Deserialize;
use serde_json::{Value, json};

/// ESTIMATE, not a bill: OpenAI list prices in micro-USD per million tokens,
/// read 2026-11-02 (docs pricing page lists gpt-image-2 at $5 text in, $8
/// image in, $30 image out; third-party sources state the 2.5 models use the
/// same rates). The receipt is computed from the response's own `usage`.
pub const PRICE_TEXT_INPUT: u64 = 5_000_000;
pub const PRICE_IMAGE_INPUT: u64 = 8_000_000;
pub const PRICE_IMAGE_OUTPUT: u64 = 30_000_000;

/// Largest decoded image accepted (the overlay package byte cap).
pub const MAX_IMAGE_BYTES: usize = 8 * 1024 * 1024;
const MAX_PROMPT: usize = 4000;

pub(super) fn validate(request: &OpenAiImageRequest) -> Result<(), ArtError> {
    if request.prompt.trim().is_empty() || request.prompt.chars().count() > MAX_PROMPT {
        return Err(ArtError::Invalid);
    }
    if let OpenAiSize::Exact { width, height } = request.size {
        valid_size(width, height)?;
    }
    Ok(())
}

/// OpenAI's GPT image size rules: both edges multiples of 16, at most 3840,
/// long edge at most three times the short edge.
pub fn valid_size(width: u32, height: u32) -> Result<(), ArtError> {
    let edges = [width, height]
        .into_iter()
        .all(|v| (16..=3840).contains(&v) && v.is_multiple_of(16));
    if !edges || width.max(height) > 3 * width.min(height) {
        return Err(ArtError::Invalid);
    }
    Ok(())
}

fn size(request: &OpenAiImageRequest) -> String {
    match request.size {
        OpenAiSize::Exact { width, height } => format!("{width}x{height}"),
        OpenAiSize::Auto => "auto".into(),
    }
}

fn background(request: &OpenAiImageRequest) -> &'static str {
    match request.background {
        OpenAiBackground::Transparent => "transparent",
        OpenAiBackground::Opaque => "opaque",
    }
}

/// JSON body of POST /v1/images/generations: one PNG, returned as base64.
pub(super) fn generation_body(request: &OpenAiImageRequest) -> Value {
    json!({
        "model": request.model.wire(), "prompt": request.prompt, "n": 1,
        "size": size(request), "background": background(request), "output_format": "png",
    })
}

/// Text fields of the multipart POST /v1/images/edits, in a fixed order.
pub(super) fn edit_fields(request: &OpenAiImageRequest) -> Vec<(&'static str, String)> {
    vec![
        ("model", request.model.wire().into()),
        ("prompt", request.prompt.clone()),
        ("n", "1".into()),
        ("size", size(request)),
        ("background", background(request).into()),
        ("output_format", "png".into()),
    ]
}

/// RFC 7578 body. The boundary is a fixed token that cannot occur in the
/// fields (checked) and is vanishingly unlikely in image bytes; a collision
/// is refused rather than sent.
pub fn multipart(
    boundary: &str,
    fields: &[(&'static str, String)],
    image: &[u8],
    mime: &str,
) -> Result<Vec<u8>, ArtError> {
    let marker = format!("--{boundary}");
    if fields.iter().any(|(_, v)| v.contains(&marker))
        || image.windows(marker.len()).any(|w| w == marker.as_bytes())
    {
        return Err(ArtError::Invalid);
    }
    let extension = if mime == "image/webp" { "webp" } else { "png" };
    let mut body = Vec::new();
    for (name, value) in fields {
        body.extend_from_slice(
            format!(
                "{marker}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n"
            )
            .as_bytes(),
        );
    }
    body.extend_from_slice(
        format!(
            "{marker}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"image.{extension}\"\r\nContent-Type: {mime}\r\n\r\n"
        )
        .as_bytes(),
    );
    body.extend_from_slice(image);
    body.extend_from_slice(format!("\r\n{marker}--\r\n").as_bytes());
    Ok(body)
}

#[derive(Deserialize)]
struct Envelope {
    data: Vec<Datum>,
    usage: Usage,
}
#[derive(Deserialize)]
struct Datum {
    b64_json: Option<String>,
}
#[derive(Deserialize)]
struct Usage {
    input_tokens: u64,
    output_tokens: u64,
    input_tokens_details: Option<InputDetails>,
}
#[derive(Deserialize)]
struct InputDetails {
    text_tokens: u64,
    image_tokens: u64,
}

/// Estimated micro-USD from usage. Without an input breakdown every input
/// token is priced at the (higher) image rate, so the estimate never shrinks.
pub fn estimate(input: u64, text: Option<(u64, u64)>, output: u64) -> u64 {
    let (text, image) = text.unwrap_or((0, input));
    let total = u128::from(text) * u128::from(PRICE_TEXT_INPUT)
        + u128::from(image) * u128::from(PRICE_IMAGE_INPUT)
        + u128::from(output) * u128::from(PRICE_IMAGE_OUTPUT);
    total.div_ceil(1_000_000).min(u128::from(u64::MAX)) as u64
}

/// Parsed response: the receipt survives an unusable image, so a paid call is
/// always recorded. A missing usage block is a Response error (no receipt).
pub(super) fn image(
    body: &str,
    model: OpenAiModel,
    call_id: String,
    expected: OpenAiSize,
) -> Result<(CostRecord, Result<Vec<u8>, ArtError>), ArtError> {
    let envelope: Envelope = serde_json::from_str(body).map_err(|_| ArtError::Response)?;
    let usage = envelope.usage;
    let details = usage
        .input_tokens_details
        .map(|d| (d.text_tokens, d.image_tokens));
    if details.is_some_and(|(t, i)| t.saturating_add(i) != usage.input_tokens) {
        return Err(ArtError::Response);
    }
    let cost = CostRecord {
        call_id,
        model: model.id().into(),
        charge: Charge::MicroUsd(estimate(usage.input_tokens, details, usage.output_tokens)),
    };
    let png = (|| {
        let [datum] = <[Datum; 1]>::try_from(envelope.data).map_err(|_| ArtError::Response)?;
        let encoded = datum.b64_json.ok_or(ArtError::Response)?;
        if encoded.len() > MAX_IMAGE_BYTES / 3 * 4 + 4 {
            return Err(ArtError::Response);
        }
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .map_err(|_| ArtError::Response)?;
        if bytes.len() > MAX_IMAGE_BYTES || !raster::is_png(&bytes) {
            return Err(ArtError::Response);
        }
        let decoded = raster::decode(&bytes).map_err(|_| ArtError::Response)?;
        if let OpenAiSize::Exact { width, height } = expected
            && (decoded.width, decoded.height) != (width, height)
        {
            return Err(ArtError::Response);
        }
        Ok(bytes)
    })();
    Ok((cost, png))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn size_rules_follow_the_provider() {
        assert!(valid_size(1536, 512).is_ok());
        assert!(valid_size(512, 1536).is_ok());
        assert!(valid_size(1024, 1024).is_ok());
        for (w, h) in [(1544, 512), (1536, 504), (1552, 512), (1536, 496), (0, 16)] {
            assert_eq!(valid_size(w, h), Err(ArtError::Invalid), "{w}x{h}");
        }
    }

    #[test]
    fn estimate_is_documented_rates_rounded_up() {
        // 50 text + 0 image input, 1056 output: 250 + 31_680 micro-USD.
        assert_eq!(estimate(50, Some((50, 0)), 1056), 31_930);
        // No breakdown: input priced as image tokens.
        assert_eq!(estimate(50, None, 0), 400);
        assert_eq!(estimate(0, None, 1), 30);
        assert_eq!(estimate(u64::MAX, None, u64::MAX), u64::MAX);
    }

    #[test]
    fn multipart_frames_fields_and_refuses_boundary_collisions() {
        let body = multipart(
            "cc-simulated",
            &[("prompt", "p".into())],
            b"\x89PNG",
            "image/png",
        )
        .unwrap();
        let text = String::from_utf8_lossy(&body);
        assert!(text.starts_with(
            "--cc-simulated\r\nContent-Disposition: form-data; name=\"prompt\"\r\n\r\np\r\n"
        ));
        assert!(text.contains("name=\"image\"; filename=\"image.png\"\r\nContent-Type: image/png"));
        assert!(text.ends_with("\r\n--cc-simulated--\r\n"));
        assert!(multipart("b", &[("prompt", "x--b".into())], b"", "image/png").is_err());
        assert!(multipart("b", &[], b"--b", "image/png").is_err());
    }
}
