// Protocol: https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md
use crate::Error;
use base64::{Engine, engine::general_purpose::STANDARD};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use zeroize::Zeroizing;

#[derive(Deserialize)]
pub(crate) struct Frame {
    pub op: u8,
    pub d: Value,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Hello {
    pub rpc_version: u32,
    pub authentication: Option<Challenge>,
}
#[derive(Deserialize)]
pub(crate) struct Challenge {
    pub salt: String,
    pub challenge: String,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Version {
    pub obs_version: String,
    pub obs_web_socket_version: String,
    pub rpc_version: u32,
    pub available_requests: Vec<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Response {
    pub request_type: String,
    pub request_id: String,
    pub request_status: RequestStatus,
    #[serde(default)]
    pub response_data: Value,
}
#[derive(Deserialize)]
pub(crate) struct RequestStatus {
    pub result: bool,
    pub code: u32,
}
#[derive(Debug, Clone, Serialize)]
pub struct BrowserSource {
    pub scene_name: String,
    pub source_name: String,
    pub url: String,
    pub width: u32,
    pub height: u32,
}
impl BrowserSource {
    pub(crate) fn request(&self) -> Result<Value, Error> {
        let url = self
            .url
            .parse::<axum::http::Uri>()
            .map_err(|_| Error::Invalid)?;
        if url.scheme_str() != Some("http")
            || url.host() != Some("localhost")
            || url.port_u16().is_none_or(|port| port == 0)
            || url.path() != "/"
            || url.query().is_some()
            || url.authority().map(|a| a.as_str())
                != url.port_u16().map(|p| format!("localhost:{p}")).as_deref()
            || self.scene_name.trim().is_empty()
            || self.source_name.trim().is_empty()
            || !(1..=8192).contains(&self.width)
            || !(1..=8192).contains(&self.height)
        {
            return Err(Error::Invalid);
        }
        Ok(json!({
            "sceneName": self.scene_name, "inputName": self.source_name,
            "inputKind": "browser_source", "sceneItemEnabled": true,
            "inputSettings": {"url": self.url, "width": self.width, "height": self.height,
                "is_local_file": false, "shutdown": false}
        }))
    }
}

pub(crate) fn authentication(password: &str, challenge: &Challenge) -> Zeroizing<String> {
    let mut first = Sha256::new();
    first.update(password.as_bytes());
    first.update(challenge.salt.as_bytes());
    let secret = Zeroizing::new(STANDARD.encode(first.finalize()));
    let mut second = Sha256::new();
    second.update(secret.as_bytes());
    second.update(challenge.challenge.as_bytes());
    Zeroizing::new(STANDARD.encode(second.finalize()))
}
