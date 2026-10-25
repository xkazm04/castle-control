// Adapted from Shadowrunr OS @ 7e4b6f8,
// crates/shadowrunr-engine/src/stream.rs and alt_cli.rs.
//! One typed parser for both JSONL dialects. Raw errors are deliberately discarded.
use crate::{
    Failure, ModelName, Prices, Result,
    api::{Answer, MAX_OUTPUT},
};
use cc_types::CliProvider;
use serde::Deserialize;

#[derive(Deserialize, Default)]
struct Usage {
    #[serde(default)]
    input_tokens: u64,
    #[serde(default)]
    output_tokens: u64,
}
#[derive(Deserialize)]
struct Item {
    #[serde(rename = "type")]
    kind: String,
    text: Option<String>,
    model: Option<ModelName>,
}
#[derive(Deserialize)]
struct Event {
    #[serde(rename = "type")]
    kind: String,
    subtype: Option<String>,
    thread_id: Option<String>,
    session_id: Option<String>,
    model: Option<ModelName>,
    item: Option<Item>,
    result: Option<String>,
    is_error: Option<bool>,
    total_cost_usd: Option<f64>,
    usage: Option<Usage>,
    #[serde(rename = "permissionMode")]
    permission_mode: Option<String>,
    sandbox: Option<String>,
}
#[derive(Default)]
pub(crate) struct TurnParser {
    text: String,
    thread_id: Option<String>,
    model: Option<ModelName>,
    input: u64,
    output: u64,
    cost: Option<u64>,
    done: bool,
    failed: bool,
    posture: bool,
    bytes: usize,
}
impl TurnParser {
    pub fn feed(&mut self, line: &[u8], provider: CliProvider) -> Result<()> {
        self.bytes = self.bytes.saturating_add(line.len());
        if self.bytes > MAX_OUTPUT {
            return Err(Failure::Parse);
        }
        let event: Event = serde_json::from_slice(line).map_err(|_| Failure::Parse)?;
        if event.sandbox.as_deref().is_some_and(|s| s != "read-only")
            || event
                .permission_mode
                .as_deref()
                .is_some_and(|mode| mode != "plan")
        {
            return Err(Failure::Posture);
        }
        // A failure stays a failure even if a later success event arrives.
        if self.done && !matches!(event.kind.as_str(), "error" | "turn.failed") {
            return Err(Failure::Parse);
        }
        match (provider, event.kind.as_str()) {
            (CliProvider::CodexCli, "thread.started") => {
                self.thread_id = event.thread_id;
                // Codex normally reports only thread_id here; the runtime has already
                // exercised the sandbox with the native posture helper. An explicit
                // override contradicting that posture still fails this call.
                self.posture = event.sandbox.as_deref().is_none_or(|s| s == "read-only");
            }
            (CliProvider::CodexCli, "item.completed") => {
                let item = event.item.ok_or(Failure::Parse)?;
                if item.kind == "agent_message" {
                    self.text = item.text.ok_or(Failure::Parse)?;
                }
                if let Some(model) = item.model {
                    self.model = Some(model);
                }
            }
            (CliProvider::CodexCli, "turn.completed") => {
                self.done = true;
            }
            (_, "turn.failed" | "error") => {
                self.done = true;
                self.failed = true;
            }
            (CliProvider::ClaudeCli, "system") if event.subtype.as_deref() == Some("init") => {
                self.thread_id = event.session_id;
                self.model = event.model.clone();
                self.posture = event.permission_mode.as_deref() == Some("plan");
            }
            (CliProvider::ClaudeCli, "result") => {
                self.done = true;
                self.failed |=
                    event.is_error != Some(false) || event.subtype.as_deref() != Some("success");
                self.text = event.result.unwrap_or_default();
                if let Some(cost) = event.total_cost_usd {
                    if !cost.is_finite() || cost < 0.0 || cost > u64::MAX as f64 / 1_000_000.0 {
                        return Err(Failure::Parse);
                    }
                    self.cost = Some((cost * 1_000_000.0).ceil() as u64);
                }
            }
            // Progress, reasoning and rate-limit events are not model answers.
            _ => {}
        }
        if let Some(model) = event.model {
            self.model = Some(model);
        }
        if let Some(usage) = event.usage {
            self.input = usage.input_tokens;
            self.output = usage.output_tokens;
        }
        Ok(())
    }
    pub fn finish(self, prices: Prices) -> Result<Answer> {
        if self.failed {
            return Ok(Answer {
                text: String::new(),
                thread_id: None,
                model_served: None,
                cost_microusd: self
                    .cost
                    .unwrap_or_else(|| prices.cost(self.input, self.output)),
                total_ms: 0,
                longest_silence_ms: 0,
                failure: Some(Failure::Unavailable),
            });
        }
        if !self.done || self.text.trim().is_empty() {
            return Err(Failure::Parse);
        }
        if !self.posture {
            return Err(Failure::Posture);
        }
        Ok(Answer {
            text: self.text,
            thread_id: self.thread_id,
            model_served: self.model,
            cost_microusd: self
                .cost
                .unwrap_or_else(|| prices.cost(self.input, self.output)),
            total_ms: 0,
            longest_silence_ms: 0,
            failure: None,
        })
    }
}
