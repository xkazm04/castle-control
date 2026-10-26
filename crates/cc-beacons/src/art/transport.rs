use super::{ArtError, SecretKey};
use async_trait::async_trait;
use reqwest::header::{AUTHORIZATION, HeaderValue};
use serde_json::Value;
use std::time::Duration;
use zeroize::Zeroizing;

const ORIGIN: &str = "https://cloud.leonardo.ai/api/rest/";
const MAX_RESPONSE: usize = 2 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HttpMethod {
    Get,
    Post,
}
#[derive(Debug, Clone, PartialEq)]
pub struct HttpRequest {
    pub method: HttpMethod,
    /// Relative provider path, constructed only inside the image client.
    pub path: String,
    pub body: Option<Value>,
}
/// No Debug: even an unsuccessful provider response might echo credentials.
pub struct HttpResponse {
    pub status: u16,
    pub body: String,
}

#[async_trait]
pub trait HttpTransport: Send + Sync {
    /// Implementations must not log credentials, headers, or response bodies.
    async fn send(&self, key: &SecretKey, request: HttpRequest) -> Result<HttpResponse, ArtError>;
}

pub struct ReqwestTransport(reqwest::Client);
impl ReqwestTransport {
    pub fn new() -> Result<Self, ArtError> {
        reqwest::Client::builder()
            .https_only(true)
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(45))
            .build()
            .map(Self)
            .map_err(|_| ArtError::Transport)
    }
}

#[async_trait]
impl HttpTransport for ReqwestTransport {
    async fn send(&self, key: &SecretKey, request: HttpRequest) -> Result<HttpResponse, ArtError> {
        // Fixed destination; neither provider output nor callers can redirect a key.
        let allowed_path = request.path == "v1/generations"
            || request.path == "v2/generationssync"
            || request
                .path
                .strip_prefix("v1/generations/")
                .is_some_and(super::wire::valid_id);
        if !allowed_path {
            return Err(ArtError::Invalid);
        }
        let value = Zeroizing::new(format!("Bearer {}", key.value()));
        let mut authorization = HeaderValue::from_str(&value).map_err(|_| ArtError::Invalid)?;
        authorization.set_sensitive(true);
        let method = match request.method {
            HttpMethod::Get => reqwest::Method::GET,
            HttpMethod::Post => reqwest::Method::POST,
        };
        let mut call = self
            .0
            .request(method, format!("{ORIGIN}{}", request.path))
            .header(AUTHORIZATION, authorization)
            .header("accept", "application/json");
        if let Some(body) = request.body {
            call = call.json(&body);
        }
        let mut response = call.send().await.map_err(|_| ArtError::Transport)?;
        let status = response.status().as_u16();
        // Drop error bodies entirely, even when a provider echoes Authorization.
        if !(200..300).contains(&status) {
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
