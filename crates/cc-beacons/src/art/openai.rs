//! OpenAI GPT image provider: generations and reference edits on the
//! streamer's own key. Results arrive as base64 in the response body, so no
//! download host is ever contacted. Each call returns an ESTIMATED micro-USD
//! receipt computed from the response's usage tokens (see `openai_wire`).
use super::{
    ArtError, CostRecord, HttpResponse, KeyStore, OpenAiKeychain, SecretKey, openai_wire as wire,
};
use async_trait::async_trait;
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE, HeaderValue};
use serde_json::Value;
use std::time::Duration;
use ulid::Ulid;
use zeroize::Zeroizing;

const ORIGIN: &str = "https://api.openai.com/v1/";
/// A 3840px PNG as base64 plus envelope stays well under this.
const MAX_RESPONSE: usize = 16 * 1024 * 1024;
/// Fixed multipart boundary; `wire::multipart` refuses a collision.
const BOUNDARY: &str = "castle-control-art-7f3a9c1e5b";

/// Product model aliases. `ArtModelId` admits no dots, so the wire names are
/// reached through these dotless ids.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OpenAiModel {
    /// `gpt-image-2-5-flare` -> `gpt-image-2.5-flare`: fast drafts (default).
    Flare,
    /// `gpt-image-2-5-sunburst` -> `gpt-image-2.5-sunburst`: final quality and edits.
    Sunburst,
}
impl OpenAiModel {
    pub const DEFAULT: Self = Self::Flare;
    pub fn parse(id: &str) -> Result<Self, ArtError> {
        match id {
            "gpt-image-2-5-flare" => Ok(Self::Flare),
            "gpt-image-2-5-sunburst" => Ok(Self::Sunburst),
            _ => Err(ArtError::Invalid),
        }
    }
    pub fn id(self) -> &'static str {
        match self {
            Self::Flare => "gpt-image-2-5-flare",
            Self::Sunburst => "gpt-image-2-5-sunburst",
        }
    }
    pub fn wire(self) -> &'static str {
        match self {
            Self::Flare => "gpt-image-2.5-flare",
            Self::Sunburst => "gpt-image-2.5-sunburst",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OpenAiSize {
    Exact {
        width: u32,
        height: u32,
    },
    /// Provider-chosen size; used for edits of images whose size breaks the rules.
    Auto,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OpenAiBackground {
    Transparent,
    Opaque,
}

#[derive(Debug, Clone)]
pub struct OpenAiImageRequest {
    pub prompt: String,
    pub model: OpenAiModel,
    pub size: OpenAiSize,
    pub background: OpenAiBackground,
}

/// One paid result. `png` is an error when the image was unusable; the
/// receipt is still exact and must be recorded before `png` is examined.
#[derive(Debug)]
pub struct OpenAiImage {
    pub cost: CostRecord,
    pub png: Result<Vec<u8>, ArtError>,
}

#[async_trait]
pub trait OpenAiImages: Send + Sync {
    /// Key presence only, read now; never a network check.
    fn available(&self) -> Result<bool, ArtError>;
    async fn generate(&self, request: &OpenAiImageRequest) -> Result<OpenAiImage, ArtError>;
    /// `image` is the PNG or WebP reference; one image comes back.
    async fn edit(
        &self,
        request: &OpenAiImageRequest,
        image: &[u8],
    ) -> Result<OpenAiImage, ArtError>;
}

/// A fully formed call; the transport only adds the origin and credential.
pub enum OpenAiCall {
    Generation(Value),
    Edit {
        fields: Vec<(&'static str, String)>,
        image: Vec<u8>,
        mime: &'static str,
    },
}

#[async_trait]
pub trait OpenAiTransport: Send + Sync {
    /// Implementations must not log credentials, headers, or bodies.
    async fn send(&self, key: &SecretKey, call: OpenAiCall) -> Result<HttpResponse, ArtError>;
}

pub struct OpenAiReqwest(reqwest::Client);
impl OpenAiReqwest {
    pub fn new() -> Result<Self, ArtError> {
        reqwest::Client::builder()
            .https_only(true)
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(10))
            // Complex image prompts can take about two minutes.
            .timeout(Duration::from_secs(180))
            .build()
            .map(Self)
            .map_err(|_| ArtError::Transport)
    }
}

#[async_trait]
impl OpenAiTransport for OpenAiReqwest {
    async fn send(&self, key: &SecretKey, call: OpenAiCall) -> Result<HttpResponse, ArtError> {
        let value = Zeroizing::new(format!("Bearer {}", key.value()));
        let mut authorization = HeaderValue::from_str(&value).map_err(|_| ArtError::Invalid)?;
        authorization.set_sensitive(true);
        // Fixed destinations; nothing a caller or response supplies picks a host.
        let request = match call {
            OpenAiCall::Generation(body) => self
                .0
                .post(format!("{ORIGIN}images/generations"))
                .json(&body),
            OpenAiCall::Edit {
                fields,
                image,
                mime,
            } => self
                .0
                .post(format!("{ORIGIN}images/edits"))
                .header(
                    CONTENT_TYPE,
                    format!("multipart/form-data; boundary={BOUNDARY}"),
                )
                .body(wire::multipart(BOUNDARY, &fields, &image, mime)?),
        };
        let mut response = request
            .header(AUTHORIZATION, authorization)
            .header("accept", "application/json")
            .send()
            .await
            .map_err(|_| ArtError::Transport)?;
        let status = response.status().as_u16();
        if !(200..300).contains(&status) {
            // Drop error bodies entirely, even when a provider echoes headers.
            return Ok(HttpResponse {
                status,
                body: String::new(),
            });
        }
        let mut bytes = Zeroizing::new(Vec::new());
        while let Some(chunk) = response.chunk().await.map_err(|_| ArtError::Transport)? {
            if bytes.len().saturating_add(chunk.len()) > MAX_RESPONSE {
                return Err(ArtError::Response);
            }
            bytes.extend_from_slice(&chunk);
        }
        let body = String::from_utf8(bytes.to_vec()).map_err(|_| ArtError::Response)?;
        Ok(HttpResponse { status, body })
    }
}

pub struct OpenAiClient<T = OpenAiReqwest, S = OpenAiKeychain> {
    transport: T,
    keys: S,
    account: String,
}

impl OpenAiClient {
    /// Keychain service `castle-control`, account `openai`. Reads nothing yet.
    pub fn from_keychain() -> Result<Self, ArtError> {
        Self::new(
            OpenAiReqwest::new()?,
            OpenAiKeychain,
            super::OPENAI_KEYCHAIN_ACCOUNT.into(),
        )
    }
}

impl<T, S> OpenAiClient<T, S> {
    pub fn new(transport: T, keys: S, account: String) -> Result<Self, ArtError> {
        if account.trim().is_empty() {
            return Err(ArtError::Invalid);
        }
        Ok(Self {
            transport,
            keys,
            account,
        })
    }
}

impl<T: OpenAiTransport, S: KeyStore> OpenAiClient<T, S> {
    async fn call(
        &self,
        request: &OpenAiImageRequest,
        call: OpenAiCall,
    ) -> Result<OpenAiImage, ArtError> {
        wire::validate(request)?;
        // Reload per call: deleting the key disables the very next request.
        let key = self
            .keys
            .load(&self.account)?
            .ok_or(ArtError::Unavailable)?;
        let leaks = match &call {
            OpenAiCall::Generation(body) => key.appears_in(&body.to_string()),
            OpenAiCall::Edit { fields, .. } => fields.iter().any(|(_, v)| key.appears_in(v)),
        };
        if leaks {
            return Err(ArtError::Invalid);
        }
        let response = self.transport.send(&key, call).await?;
        let body = Zeroizing::new(response.body);
        if !(200..300).contains(&response.status) {
            return Err(ArtError::Http(response.status));
        }
        if key.appears_in(&body) {
            return Err(ArtError::Response);
        }
        let (cost, png) = wire::image(&body, request.model, Ulid::new().to_string(), request.size)?;
        Ok(OpenAiImage { cost, png })
    }
}

#[async_trait]
impl<T: OpenAiTransport, S: KeyStore> OpenAiImages for OpenAiClient<T, S> {
    fn available(&self) -> Result<bool, ArtError> {
        Ok(self.keys.load(&self.account)?.is_some())
    }
    async fn generate(&self, request: &OpenAiImageRequest) -> Result<OpenAiImage, ArtError> {
        self.call(
            request,
            OpenAiCall::Generation(wire::generation_body(request)),
        )
        .await
    }
    async fn edit(
        &self,
        request: &OpenAiImageRequest,
        image: &[u8],
    ) -> Result<OpenAiImage, ArtError> {
        let mime = if super::raster::is_png(image) {
            "image/png"
        } else if super::raster::is_webp(image) {
            "image/webp"
        } else {
            return Err(ArtError::Invalid);
        };
        if image.len() > wire::MAX_IMAGE_BYTES {
            return Err(ArtError::Invalid);
        }
        let call = OpenAiCall::Edit {
            fields: wire::edit_fields(request),
            image: image.to_vec(),
            mime,
        };
        self.call(request, call).await
    }
}
