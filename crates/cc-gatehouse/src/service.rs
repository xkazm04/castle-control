// Adapted from Shadowrunr OS @ 7e4b6f8,
// crates/shadowrunr-daemon/src/moderator/mod.rs (Apache-2.0; see NOTICE).
use crate::{
    GatePath, Result, error, internal,
    rules::{self, Strikes},
    store::{self, Config, Consent, ManagedRule},
};
use cc_store::{Clock, LedgerEvent, LedgerKind, Store, SystemClock};
use cc_types::{
    Decision, DecisionId, DecisionKind, Empty, ErrorCode, MessageId, Operator, Rule, RuleClass,
    RuleMode, RulesListResult, RulesSetModeParams, RulesUpsertParams, Timestamp, Verdict,
};
use std::{
    path::{Path, PathBuf},
    sync::Arc,
};

pub struct Gatehouse {
    pub(crate) store: Store,
    pub(crate) config: Config,
    pub(crate) config_path: PathBuf,
    pub(crate) clock: Arc<dyn Clock>,
    pub(crate) strikes: Strikes,
    pub(crate) gate_available: bool,
    pub(crate) gate_settings: crate::gate::Settings,
    pub(crate) room_leases:
        std::collections::BTreeMap<cc_types::LeaseId, crate::governor::LeaseRegistration>,
}

impl Gatehouse {
    pub fn open(root: impl AsRef<Path>) -> Result<Self> {
        Self::with_clock(root, Arc::new(SystemClock))
    }

    pub fn with_clock(root: impl AsRef<Path>, clock: Arc<dyn Clock>) -> Result<Self> {
        let store = Store::open(root.as_ref().join("store")).map_err(internal)?;
        let config_path = root.as_ref().join("rules.json");
        let config = store::load(&config_path)?;
        store::save(&config_path, &config)?;
        Ok(Self {
            store,
            config,
            config_path,
            clock,
            strikes: Strikes::default(),
            gate_available: true,
            gate_settings: crate::gate::Settings::default(),
            room_leases: Default::default(),
        })
    }

    pub(crate) fn now(&self) -> Result<Timestamp> {
        Timestamp::try_from(self.clock.now().as_rfc3339()).map_err(internal)
    }

    /// A failed readiness probe cannot be treated as a successful clean gate.
    pub fn set_gate_available(&mut self, available: bool) {
        self.gate_available = available;
    }

    pub fn rules_list(&self, _: Empty) -> Result<RulesListResult> {
        Ok(RulesListResult {
            rules: self.config.values().map(|m| m.rule.clone()).collect(),
        })
    }

    pub fn rules_upsert(&mut self, params: RulesUpsertParams) -> Result<Rule> {
        let rule = rules::validate(params.rule)?;
        let old = self.config.get(&rule.rule_id);
        if let Some(old) = old.filter(|m| m.rule.rule_class == RuleClass::Rail) {
            let mut expected = old.rule.clone();
            expected.delivery = rule.delivery.clone();
            if rule != expected {
                return Err(error(
                    ErrorCode::BlockedByPolicy,
                    "only rail delivery may change",
                ));
            }
        } else if rule.rule_class == RuleClass::Rail {
            return Err(error(
                ErrorCode::BlockedByPolicy,
                "rail detectors are owned by code",
            ));
        } else if old.is_none_or(|m| m.rule != rule) && rule.mode != RuleMode::Shadow {
            return Err(error(
                ErrorCode::NeedsHuman,
                "upsert is not arming consent; edit in shadow mode",
            ));
        }
        let consent = old
            .filter(|m| m.rule == rule)
            .and_then(|m| m.consent.clone());
        let mut next = self.config.clone();
        next.insert(
            rule.rule_id.clone(),
            ManagedRule {
                rule: rule.clone(),
                consent,
            },
        );
        store::save(&self.config_path, &next)?;
        self.config = next;
        Ok(rule)
    }

    pub fn rules_set_mode(&mut self, params: RulesSetModeParams) -> Result<Decision> {
        let mut managed = self
            .config
            .get(&params.rule_id)
            .cloned()
            .ok_or_else(|| error(ErrorCode::NotFound, "rule not found"))?;
        if managed.rule.rule_class == RuleClass::Rail {
            return Err(error(
                ErrorCode::BlockedByPolicy,
                "rail mode is fixed; only delivery may change",
            ));
        }
        if params.mode == RuleMode::Armed
            && params
                .acknowledgement
                .as_ref()
                .is_none_or(|ack| ack.reason.trim().is_empty())
        {
            return Err(error(
                ErrorCode::NeedsHuman,
                "arming requires acknowledgement",
            ));
        }
        let decision = Decision {
            decision_id: DecisionId::mint(),
            message_id: MessageId::try_from("configuration".to_owned()).map_err(internal)?,
            kind: DecisionKind::ModeChanged,
            verdict: Verdict::Hold,
            rule_id: Some(params.rule_id.clone()),
            operator: Operator::Human,
            at: self.now()?,
            simulated: false,
            reason_codes: vec!["mode_changed".into()],
            message_text: None,
        };
        // Consent is logged first. A crash before the config write grants nothing.
        let decision = self.record(decision, None, GatePath::Configuration, None, None, false)?;
        managed.rule.mode = params.mode;
        managed.consent = params
            .acknowledgement
            .filter(|_| params.mode == RuleMode::Armed)
            .map(|acknowledgement| Consent {
                decision_id: decision.decision_id.clone(),
                acknowledgement,
            });
        let mut next = self.config.clone();
        next.insert(params.rule_id, managed);
        store::save(&self.config_path, &next)?;
        self.config = next;
        Ok(decision)
    }

    pub(crate) fn consented(&self, managed: &ManagedRule) -> Result<bool> {
        let Some(consent) = &managed.consent else {
            return Ok(false);
        };
        Ok(self.store.read_ledger(LedgerKind::Decisions).map_err(internal)?.iter().any(|line| {
            matches!(&line.event, LedgerEvent::Decision { decision_id, user_id: None,
                action: cc_store::DecisionAction::ModeChanged } if decision_id.to_string() == consent.decision_id.as_str())
        }))
    }
}
