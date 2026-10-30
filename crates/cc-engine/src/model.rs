// Adapted from Shadowrunr OS @ 7e4b6f8,
// crates/shadowrunr-engine/src/model.rs.
use crate::{Evidence, Failure, Result};
use cc_store::{EngineClass, EngineProvider, ModelName};
use cc_types::{CliProvider, EngineSettings};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Transport {
    Endpoint,
    Cli,
}
/// Explicit prices in micro-USD per million tokens. Local/subscription calls
/// have zero marginal provider bill. No ambient model or pricing defaults.
#[derive(Clone, Copy, Debug, Default)]
pub struct Prices {
    pub input: u64,
    pub output: u64,
}
impl Prices {
    pub(crate) fn cost(self, input: u64, output: u64) -> u64 {
        let amount = (input as u128 * self.input as u128 + output as u128 * self.output as u128)
            .div_ceil(1_000_000);
        amount.min(u64::MAX as u128) as u64
    }
}
#[derive(Clone, Debug)]
pub struct Route {
    pub class: EngineClass,
    pub model: ModelName,
    pub transport: Transport,
    pub prices: Prices,
    pub evidence: Option<Evidence>,
}
/// The sole class-to-model table. Callers supply a class, never a model.
#[derive(Clone, Debug)]
pub struct RoutingTable {
    rows: [Option<Route>; 4],
    claude_model: Option<ModelName>,
    codex_model: Option<ModelName>,
}
impl RoutingTable {
    pub fn new(local: ModelName, claude: ModelName, codex: ModelName) -> Self {
        let rows = [
            EngineClass::Live,
            EngineClass::NearLive,
            EngineClass::Batch,
            EngineClass::Offline,
        ]
        .map(|class| {
            Some(Route {
                class,
                model: local.clone(),
                prices: Prices::default(),
                evidence: None,
                transport: if live(class) {
                    Transport::Endpoint
                } else {
                    Transport::Cli
                },
            })
        });
        Self {
            rows,
            claude_model: Some(claude),
            codex_model: Some(codex),
        }
    }
    pub(crate) fn from_settings(settings: &EngineSettings) -> Result<Self> {
        let parse = |model: &Option<String>| {
            model
                .as_deref()
                .map(ModelName::parse)
                .transpose()
                .map_err(|_| Failure::Invalid)
        };
        let local = parse(&settings.model_local)?;
        let claude_model = parse(&settings.model_claude)?;
        let codex_model = parse(&settings.model_codex)?;
        let selected = match settings.cli_provider {
            CliProvider::ClaudeCli => &claude_model,
            CliProvider::CodexCli => &codex_model,
        };
        let rows = [
            EngineClass::Live,
            EngineClass::NearLive,
            EngineClass::Batch,
            EngineClass::Offline,
        ]
        .map(|class| {
            let model = if live(class) { &local } else { selected };
            model.clone().map(|model| Route {
                class,
                model,
                prices: Prices::default(),
                evidence: None,
                transport: if live(class) {
                    Transport::Endpoint
                } else {
                    Transport::Cli
                },
            })
        });
        Ok(Self {
            rows,
            claude_model,
            codex_model,
        })
    }
    pub fn set(&mut self, route: Route) -> Result<()> {
        if live(route.class) && route.transport == Transport::Cli {
            return Err(Failure::CliOnLive);
        }
        let position = index(route.class);
        self.rows[position] = Some(route);
        Ok(())
    }
    pub(crate) fn get(&self, class: EngineClass, cli: CliProvider) -> Result<Route> {
        let cli_key = match cli {
            CliProvider::ClaudeCli => "engine.model_claude",
            CliProvider::CodexCli => "engine.model_codex",
        };
        let mut row = self.rows[index(class)]
            .clone()
            .ok_or(Failure::MissingModel(if live(class) {
                "engine.model_local"
            } else {
                cli_key
            }))?;
        if row.transport == Transport::Cli {
            row.model = match cli {
                CliProvider::ClaudeCli => self.claude_model.clone(),
                CliProvider::CodexCli => self.codex_model.clone(),
            }
            .ok_or(Failure::MissingModel(cli_key))?;
        }
        Ok(row)
    }
}
pub(crate) fn live(class: EngineClass) -> bool {
    matches!(class, EngineClass::Live | EngineClass::NearLive)
}
fn index(class: EngineClass) -> usize {
    match class {
        EngineClass::Live => 0,
        EngineClass::NearLive => 1,
        EngineClass::Batch => 2,
        EngineClass::Offline => 3,
    }
}
pub(crate) fn provider(cli: CliProvider) -> EngineProvider {
    match cli {
        CliProvider::ClaudeCli => EngineProvider::ClaudeCli,
        CliProvider::CodexCli => EngineProvider::CodexCli,
    }
}
