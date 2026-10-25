// Adapted from Shadowrunr OS @ 7e4b6f8,
// crates/shadowrunr-engine/src/api.rs.
use crate::{Failure, ModelName, Prices, Result, limits::http_failure};
use cc_store::EngineProvider;
use cc_types::EngineSettings;
use serde::Deserialize;
use serde_json::json;
use std::time::{Duration, Instant};
#[cfg(test)]
#[path = "api_tests.rs"]
mod tests;

pub const CLOUD_NOTICE: &str = "Cloud classification sends chat to OpenAI using your key. It is off by default; enable it only after reviewing Twitch data permissions.";
pub(crate) const MAX_OUTPUT: usize = 1_048_576;

pub struct Endpoint {
    client: reqwest::Client,
    url: reqwest::Url,
    provider: EngineProvider,
    authorized: bool,
}
pub(crate) struct Answer {
    pub text: String,
    pub model_served: Option<ModelName>,
    pub thread_id: Option<String>,
    pub cost_microusd: u64,
    pub total_ms: u64,
    pub longest_silence_ms: u64,
    pub failure: Option<Failure>,
}
impl Endpoint {
    /// Settings are parsed exclusively by cc-types before reaching this door.
    /// Remote arbitrary hosts and redirects are refused even with cloud opt-in.
    pub fn new(settings: &EngineSettings) -> Result<Self> {
        let base = reqwest::Url::parse(&settings.live_endpoint).map_err(|_| Failure::Invalid)?;
        // DNS rebinding is avoided by requiring literal loopback, not DNS names.
        let local = base
            .host_str()
            .and_then(|host| {
                host.trim_matches(['[', ']'])
                    .parse::<std::net::IpAddr>()
                    .ok()
            })
            .is_some_and(|ip| ip.is_loopback());
        let provider = if local {
            EngineProvider::LocalEndpoint
        } else {
            EngineProvider::OpenaiApi
        };
        let authorized = local
            || (settings.cloud_opt_in
                && base.scheme() == "https"
                && base.host_str() == Some("api.openai.com")
                && base.port_or_known_default() == Some(443));
        let mut url = base;
        let path = format!(
            "{}/{}",
            url.path().trim_end_matches('/'),
            if local {
                "chat/completions"
            } else {
                "responses"
            }
        );
        url.set_path(&path);
        let client = reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|_| Failure::Unavailable)?;
        Ok(Self {
            client,
            url,
            provider,
            authorized,
        })
    }
    pub fn provider(&self) -> EngineProvider {
        self.provider
    }
    pub(crate) fn identity(&self) -> &str {
        self.url.as_str()
    }
    pub(crate) fn authorized(&self) -> bool {
        self.authorized
    }
    pub(crate) async fn complete(
        &self,
        model: &ModelName,
        prompt: &str,
        prices: Prices,
        key: Option<&str>,
        timeout_ms: u64,
    ) -> Result<Answer> {
        if !self.authorized {
            return Err(Failure::CloudOptIn);
        }
        if self.provider == EngineProvider::OpenaiApi && key.is_none() {
            return Err(Failure::Auth);
        }
        let body = if self.provider == EngineProvider::LocalEndpoint {
            json!({"model":model.as_str(),"messages":[{"role":"user","content":prompt}],
                "stream":false,"max_tokens":2048,"response_format":{"type":"json_object"}})
        } else {
            json!({"model":model.as_str(),"input":prompt,"store":false,"max_output_tokens":2048})
        };
        let started = Instant::now();
        let mut request = self
            .client
            .post(self.url.clone())
            .json(&body)
            .timeout(Duration::from_millis(timeout_ms));
        if let Some(key) = key {
            request = request.bearer_auth(key);
        }
        let response = async {
            let mut response = request.send().await.map_err(|error| {
                if error.is_timeout() {
                    Failure::Timeout
                } else {
                    Failure::Unavailable
                }
            })?;
            if !response.status().is_success() {
                return Err(http_failure(response.status().as_u16()));
            }
            let mut bytes = Vec::new();
            while let Some(chunk) = response.chunk().await.map_err(|_| Failure::Unavailable)? {
                if bytes.len() + chunk.len() > MAX_OUTPUT {
                    return Err(Failure::Parse);
                }
                bytes.extend_from_slice(&chunk);
            }
            parse_response(&bytes, self.provider, prices)
        };
        let mut answer = tokio::time::timeout(Duration::from_millis(timeout_ms), response)
            .await
            .map_err(|_| Failure::Timeout)??;
        answer.total_ms = started.elapsed().as_millis().min(u64::MAX as u128) as u64;
        // Nonstreaming: conservatively charge the entire call as silence.
        answer.longest_silence_ms = answer.total_ms;
        Ok(answer)
    }
}

#[derive(Deserialize)]
struct Usage {
    #[serde(default)]
    prompt_tokens: u64,
    #[serde(default)]
    completion_tokens: u64,
    #[serde(default)]
    input_tokens: u64,
    #[serde(default)]
    output_tokens: u64,
}
#[derive(Deserialize)]
struct Message {
    content: String,
}
#[derive(Deserialize)]
struct Choice {
    message: Message,
    finish_reason: Option<String>,
}
#[derive(Deserialize)]
struct Content {
    #[serde(rename = "type")]
    kind: String,
    #[serde(default)]
    text: String,
}
#[derive(Deserialize)]
struct Output {
    #[serde(rename = "type")]
    kind: String,
    #[serde(default)]
    content: Vec<Content>,
}
#[derive(Deserialize)]
struct Response {
    model: ModelName,
    usage: Usage,
    #[serde(default)]
    choices: Vec<Choice>,
    #[serde(default)]
    output: Vec<Output>,
    status: Option<String>,
}
pub(crate) fn parse_response(
    bytes: &[u8],
    provider: EngineProvider,
    prices: Prices,
) -> Result<Answer> {
    let response: Response = serde_json::from_slice(bytes).map_err(|_| Failure::Parse)?;
    let (text, cost) = if provider == EngineProvider::LocalEndpoint {
        let choice = response.choices.into_iter().next().ok_or(Failure::Parse)?;
        if choice.finish_reason.as_deref() != Some("stop") {
            return Err(Failure::Parse);
        }
        (
            choice.message.content,
            prices.cost(
                response.usage.prompt_tokens,
                response.usage.completion_tokens,
            ),
        )
    } else {
        if response.status.as_deref() != Some("completed") {
            return Err(Failure::Parse);
        }
        let text: String = response
            .output
            .into_iter()
            .filter(|o| o.kind == "message")
            .flat_map(|o| o.content)
            .filter(|c| c.kind == "output_text")
            .map(|c| c.text)
            .collect();
        (
            text,
            prices.cost(response.usage.input_tokens, response.usage.output_tokens),
        )
    };
    if text.trim().is_empty() {
        return Err(Failure::Parse);
    }
    Ok(Answer {
        text,
        model_served: Some(response.model),
        cost_microusd: cost,
        thread_id: None,
        total_ms: 0,
        longest_silence_ms: 0,
        failure: None,
    })
}
