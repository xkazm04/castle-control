//! The single validation door for Leonardo request inputs and response schemas.
use super::{
    ArtError, BackgroundResult, Charge, CostRecord, Generation, GenerationState, ImageAsset,
    ImageRequest, Provenance,
};
use serde::Deserialize;

pub(super) fn valid_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

pub(super) fn validate_request(request: &ImageRequest, quantity: u8) -> Result<(), ArtError> {
    if request.prompt.trim().is_empty()
        || request.prompt.chars().count() > 1500
        || !valid_id(&request.model_id)
        || !(1..=8).contains(&quantity)
        || ![request.width, request.height]
            .into_iter()
            .all(|v| (32..=1536).contains(&v) && v.is_multiple_of(8))
    {
        return Err(ArtError::Invalid);
    }
    Ok(())
}

#[derive(Deserialize)]
struct ProviderCost {
    amount: String,
    unit: CostUnit,
}
#[derive(Deserialize)]
enum CostUnit {
    #[serde(rename = "CREDITS")]
    Credits,
    #[serde(rename = "DOLLARS")]
    Dollars,
}

fn decimal_parts(value: &str) -> Result<(&str, &str), ArtError> {
    let (whole, fractional) = value.split_once('.').unwrap_or((value, ""));
    if whole.is_empty()
        || whole.len() > 12
        || fractional.len() > 6
        || !whole
            .bytes()
            .chain(fractional.bytes())
            .all(|b| b.is_ascii_digit())
        || (value.contains('.') && fractional.is_empty())
    {
        return Err(ArtError::Response);
    }
    Ok((whole, fractional))
}

fn cost_record(
    cost: Option<ProviderCost>,
    legacy_credits: Option<serde_json::Number>,
    model: &str,
    call_id: String,
) -> Result<CostRecord, ArtError> {
    let cost = cost
        .or_else(|| {
            legacy_credits.map(|c| ProviderCost {
                amount: c.to_string(),
                unit: CostUnit::Credits,
            })
        })
        .ok_or(ArtError::Response)?;
    let (whole, fractional) = decimal_parts(&cost.amount)?;
    let charge = match cost.unit {
        CostUnit::Credits => Charge::Credits(cost.amount),
        CostUnit::Dollars => {
            let whole: u64 = whole.parse().map_err(|_| ArtError::Response)?;
            let fraction: u64 = format!("{fractional:0<6}")
                .parse()
                .map_err(|_| ArtError::Response)?;
            Charge::MicroUsd(whole * 1_000_000 + fraction)
        }
    };
    Ok(CostRecord {
        call_id,
        model: model.into(),
        charge,
    })
}

#[derive(Deserialize)]
struct GenerationEnvelope {
    #[serde(rename = "sdGenerationJob")]
    job: GenerationJob,
}
#[derive(Deserialize)]
struct GenerationJob {
    #[serde(rename = "generationId")]
    generation_id: String,
    #[serde(rename = "apiCreditCost")]
    api_credit_cost: Option<serde_json::Number>,
    cost: Option<ProviderCost>,
}
pub(super) fn generation(body: &str, model: &str, call_id: String) -> Result<Generation, ArtError> {
    let envelope: GenerationEnvelope =
        serde_json::from_str(body).map_err(|_| ArtError::Response)?;
    if !valid_id(&envelope.job.generation_id) {
        return Err(ArtError::Response);
    }
    Ok(Generation {
        generation_id: envelope.job.generation_id,
        cost: cost_record(
            envelope.job.cost,
            envelope.job.api_credit_cost,
            model,
            call_id,
        )?,
    })
}

#[derive(Deserialize)]
struct StateEnvelope {
    generations_by_pk: State,
}
#[derive(Deserialize)]
struct State {
    id: String,
    status: Status,
    generated_images: Vec<GeneratedImage>,
}
#[derive(Deserialize)]
#[serde(rename_all = "UPPERCASE")]
enum Status {
    Pending,
    Processing,
    Complete,
    Failed,
}
#[derive(Deserialize)]
struct GeneratedImage {
    id: String,
    url: String,
}

fn valid_url(value: &str) -> bool {
    reqwest::Url::parse(value).is_ok_and(|url| {
        url.scheme() == "https"
            && url.host_str().is_some()
            && url.username().is_empty()
            && url.password().is_none()
    })
}

pub(super) fn state(body: &str, generation_id: &str) -> Result<GenerationState, ArtError> {
    let envelope: StateEnvelope = serde_json::from_str(body).map_err(|_| ArtError::Response)?;
    let state = envelope.generations_by_pk;
    if state.id != generation_id {
        return Err(ArtError::Response);
    }
    match state.status {
        Status::Pending | Status::Processing => Ok(GenerationState::Pending),
        Status::Failed => Ok(GenerationState::Failed),
        Status::Complete => {
            let assets = state
                .generated_images
                .into_iter()
                .map(|image| {
                    if !valid_id(&image.id) || !valid_url(&image.url) {
                        return Err(ArtError::Response);
                    }
                    Ok(ImageAsset {
                        image_id: Some(image.id),
                        url: image.url,
                        generated: true,
                        provenance: Provenance::LeonardoGenerated,
                    })
                })
                .collect::<Result<Vec<_>, _>>()?;
            Ok(GenerationState::Complete(assets))
        }
    }
}

#[derive(Deserialize)]
struct BackgroundEnvelope {
    id: String,
    cost: ProviderCost,
    results: Vec<BackgroundImage>,
}
#[derive(Deserialize)]
struct BackgroundImage {
    url: String,
    #[serde(rename = "contentType")]
    content_type: String,
}
pub(super) fn background(body: &str, call_id: String) -> Result<BackgroundResult, ArtError> {
    let response: BackgroundEnvelope =
        serde_json::from_str(body).map_err(|_| ArtError::Response)?;
    if !valid_id(&response.id) {
        return Err(ArtError::Response);
    }
    let cost = cost_record(Some(response.cost), None, "remove-bg", call_id)?;
    let assets = response
        .results
        .into_iter()
        .map(|image| {
            if !valid_url(&image.url) || image.content_type != "image/png" {
                return Err(ArtError::Response);
            }
            Ok(ImageAsset {
                image_id: None,
                url: image.url,
                generated: true,
                provenance: Provenance::LeonardoBackgroundRemoved,
            })
        })
        .collect::<Result<Vec<_>, _>>()?;
    Ok(BackgroundResult { assets, cost })
}
