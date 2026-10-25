//! Class-based orchestration. Every completed attempt, including fallbacks, is audited.
use crate::{
    AnswerShape, CliRuntime, Endpoint, EngineClass, Failure, Keychain, Outcome, Result, Route,
    RoutingTable, Transport, api::Answer, cli::CliCall, ladder::fallback, ledger::Audit,
};
use cc_store::{Store, Timestamp};
use cc_types::{EngineSettings, Settings, Verdict, parse_engine_settings};
use ulid::Ulid;

pub struct Call<'a> {
    pub class: EngineClass,
    pub prompt: &'a str,
    /// Supplied by the deterministic classifier; never manufacture a pass on failure.
    pub rules_verdict: Option<Verdict>,
}
pub struct Engine {
    settings: EngineSettings,
    endpoint: Endpoint,
    routes: RoutingTable,
    cli: Option<CliRuntime>,
}
impl Engine {
    pub fn new(settings: &Settings, routes: RoutingTable, cli: Option<CliRuntime>) -> Result<Self> {
        let settings = parse_engine_settings(settings).map_err(|_| Failure::Invalid)?;
        let endpoint = Endpoint::new(&settings)?;
        Ok(Self {
            settings,
            endpoint,
            routes,
            cli,
        })
    }
    /// A keychain label is passed per call. Neither credentials nor prompts are logged.
    /// Audit failure returns an error; an unrecorded decision is never handed onward.
    pub async fn complete(
        &self,
        call: Call<'_>,
        store: &mut Store,
        vault: &dyn Keychain,
        key_label: Option<&str>,
    ) -> Result<crate::Reply> {
        self.complete_with_shape(call, store, vault, key_label, AnswerShape::Verdict)
            .await
    }
    /// Use the caller's structured-answer parser while keeping the normal
    /// admission, live/CLI separation, fallback ladder and audit door unchanged.
    pub async fn complete_with_shape(
        &self,
        call: Call<'_>,
        store: &mut Store,
        vault: &dyn Keychain,
        key_label: Option<&str>,
        shape: AnswerShape<'_>,
    ) -> Result<crate::Reply> {
        let route = self.routes.get(call.class, self.settings.cli_provider);
        let call_id = Ulid::new();
        let at = Timestamp::now();
        let attempted = self
            .attempt(&route, call.prompt, vault, key_label, shape)
            .await;
        let mut model_served = None;
        let mut cost_microusd = 0;
        let mut thread_id = None;
        let outcome = match attempted {
            Ok(answer) => {
                cost_microusd = answer.cost_microusd;
                // Structured live answers are parsed at one door, never trusted text.
                if let Some(reason) = answer.failure {
                    fallback(reason, call.rules_verdict)
                } else if route.transport == Transport::Endpoint
                    && route
                        .evidence
                        .as_ref()
                        .is_none_or(|e| e.served_model != answer.model_served)
                {
                    // Endpoint aliases are fine, but silently switching the actual model
                    // invalidates the measured floor. Keep the known cost in the audit.
                    fallback(Failure::NotAdmitted, call.rules_verdict)
                } else if crate::model::live(call.class) && !shape.accepts(&answer.text) {
                    fallback(Failure::Parse, call.rules_verdict)
                } else {
                    model_served = answer.model_served;
                    thread_id = answer.thread_id;
                    Outcome::Model { text: answer.text }
                }
            }
            Err(reason) => fallback(reason, call.rules_verdict),
        };
        let provider = match route.transport {
            Transport::Endpoint => self.endpoint.provider(),
            Transport::Cli => crate::model::provider(self.settings.cli_provider),
        };
        Audit {
            call_id,
            at,
            class: call.class,
            provider,
            model_selected: route.model,
            model_served,
            cost_microusd,
        }
        .append(store)?;
        Ok(crate::Reply {
            call_id,
            outcome,
            thread_id,
        })
    }
    async fn attempt(
        &self,
        route: &Route,
        prompt: &str,
        vault: &dyn Keychain,
        key_label: Option<&str>,
        shape: AnswerShape<'_>,
    ) -> Result<Answer> {
        match route.transport {
            Transport::Endpoint => {
                if !self.endpoint.authorized() {
                    return Err(Failure::CloudOptIn);
                }
                if !route.evidence.as_ref().is_some_and(|e| {
                    e.admits(route.class) && e.matches(&route.model, self.endpoint.identity())
                }) {
                    return Err(Failure::NotAdmitted);
                }
                // A cloud credential must never be forwarded to a local HTTP endpoint.
                let key = if self.endpoint.provider() == crate::EngineProvider::OpenaiApi {
                    match key_label {
                        Some(label) => Some(vault.load(label)?),
                        None => None,
                    }
                } else {
                    None
                };
                let limit = crate::admission::budget(route.class);
                self.endpoint
                    .complete_with_shape(
                        &route.model,
                        prompt,
                        route.prices,
                        key.as_deref(),
                        limit.total_ms.min(limit.silence_ms),
                        shape,
                    )
                    .await
            }
            Transport::Cli => {
                if crate::model::live(route.class) {
                    return Err(Failure::CliOnLive);
                }
                let cli = self.cli.as_ref().ok_or(Failure::Unavailable)?;
                cli.complete(
                    CliCall {
                        class: route.class,
                        provider: self.settings.cli_provider,
                        model: &route.model,
                        prompt,
                        prices: route.prices,
                        key_label,
                    },
                    vault,
                )
                .await
            }
        }
    }
}
