// Adapted from Shadowrunr OS @ 7e4b6f8,
// crates/shadowrunr-daemon/src/moderator/store.rs (Apache-2.0; see NOTICE).
use crate::{ActionIntent, GatePath, Gatehouse, IngestedMessage, Result, internal, rules};
use cc_store::{DataStore, DecisionAction, LedgerEvent, LedgerKind, StoredItem, TwitchUserId};
use cc_types::{
    Action, Decision, DecisionId, DecisionKind, MessageId, ModeAcknowledgement, Operator, Rule,
    RuleClass, RuleId, RuleMode, Timestamp, Verdict,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs::{self, OpenOptions},
    io::Write,
    path::Path,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Consent {
    pub decision_id: DecisionId,
    pub acknowledgement: ModeAcknowledgement,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ManagedRule {
    pub rule: Rule,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub consent: Option<Consent>,
}

pub(crate) type Config = BTreeMap<RuleId, ManagedRule>;

#[cfg(test)]
thread_local! {
    pub(crate) static RECORD_READS: std::cell::Cell<usize> = const { std::cell::Cell::new(0) };
}

pub(crate) fn rail() -> Rule {
    Rule {
        rule_id: RuleId::try_from("crisis-care".to_owned()).expect("static slug"),
        name: "Crisis disclosure handoff".into(),
        rule_class: RuleClass::Rail,
        mode: RuleMode::Armed,
        action: Action::Hold,
        delivery: "streamer".into(),
        pattern: None,
        text: None,
        timeout_s: None,
        strikes: None,
        auto_ban_grant: None,
    }
}

pub(crate) fn load(path: &Path) -> Result<Config> {
    let config: Config = match fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(internal)?,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            let rule = rail();
            BTreeMap::from([(
                rule.rule_id.clone(),
                ManagedRule {
                    rule,
                    consent: None,
                },
            )])
        }
        Err(e) => return Err(internal(e)),
    };
    for (id, managed) in &config {
        rules::validate(managed.rule.clone())?;
        if id != &managed.rule.rule_id {
            return Err(internal("rule key mismatch"));
        }
        if managed.rule.rule_class == RuleClass::Rail {
            let mut expected = rail();
            expected.delivery = managed.rule.delivery.clone();
            if managed.rule != expected || managed.consent.is_some() {
                return Err(internal("rail mutation"));
            }
        }
    }
    if !config.contains_key(&rail().rule_id) {
        return Err(internal("missing care rail"));
    }
    Ok(config)
}

pub(crate) fn save(path: &Path, config: &Config) -> Result<()> {
    let temp = path.with_extension("tmp");
    let mut file = OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(&temp)
        .map_err(internal)?;
    file.write_all(&serde_json::to_vec(config).map_err(internal)?)
        .map_err(internal)?;
    file.sync_all().map_err(internal)?;
    fs::rename(temp, path).map_err(internal)
}

/// Private persistence schema, not a second wire contract. No message text or
/// login enters caches/audit metadata. Original text is kept under retention.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Record {
    pub decision_id: DecisionId,
    pub message_id: MessageId,
    pub kind: DecisionKind,
    pub verdict: Verdict,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rule_id: Option<RuleId>,
    pub operator: Operator,
    pub at: Timestamp,
    pub simulated: bool,
    pub reason_codes: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user_id: Option<TwitchUserId>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub moderator_id: Option<TwitchUserId>,
    pub path: GatePath,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent: Option<DecisionId>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub intent: Option<ActionIntent>,
    pub care: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rule_snapshot: Option<Rule>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub live_capture: Option<cc_types::GatehouseLiveCapture>,
}

struct AuditContext<'a> {
    path: GatePath,
    parent: Option<DecisionId>,
    intent: Option<ActionIntent>,
    care: bool,
    actor: Option<&'a crate::gate::GateActor>,
}

impl Record {
    pub(crate) fn decision(&self) -> Decision {
        Decision {
            decision_id: self.decision_id.clone(),
            message_id: self.message_id.clone(),
            kind: self.kind,
            verdict: self.verdict,
            rule_id: self.rule_id.clone(),
            operator: self.operator,
            at: self.at.clone(),
            simulated: self.simulated,
            reason_codes: self.reason_codes.clone(),
            message_text: None,
        }
    }
}

impl Gatehouse {
    pub(crate) fn records(&self) -> Result<Vec<Record>> {
        #[cfg(test)]
        RECORD_READS.with(|reads| reads.set(reads.get() + 1));
        let committed: BTreeMap<_, _> = self
            .store
            .read_ledger(LedgerKind::Decisions)
            .map_err(internal)?
            .into_iter()
            .filter_map(|line| match line.event {
                LedgerEvent::Decision { decision_id, .. } => Some((decision_id, ())),
                _ => None,
            })
            .collect();
        self.store
            .items(DataStore::Caches)
            .map_err(internal)?
            .into_iter()
            .filter(|item| committed.contains_key(&item.id))
            .map(|item| serde_json::from_str(&item.content).map_err(internal))
            .collect()
    }

    pub(crate) fn original(&self, record: &Record) -> Result<IngestedMessage> {
        let id = record
            .decision_id
            .as_str()
            .parse::<ulid::Ulid>()
            .map_err(internal)?;
        let item = self
            .store
            .items(DataStore::Recordings)
            .map_err(internal)?
            .into_iter()
            .find(|item| item.id == id)
            .ok_or_else(|| internal("original erased or expired"))?;
        let msg: IngestedMessage = serde_json::from_str(&item.content).map_err(internal)?;
        if msg.message_id != record.message_id || Some(&msg.user_id) != record.user_id.as_ref() {
            return Err(internal("queue association mismatch"));
        }
        Ok(msg)
    }

    pub(crate) fn caring(&self, user: &TwitchUserId) -> Result<bool> {
        Ok(self
            .records()?
            .iter()
            .any(|r| r.user_id.as_ref() == Some(user) && r.care))
    }

    /// The only append_ledger call in the crate. Audit metadata is prepared first;
    /// only committed IDs are read back. A failure returns no action intent.
    pub(crate) fn record(
        &mut self,
        decision: Decision,
        msg: Option<&IngestedMessage>,
        path: GatePath,
        parent: Option<DecisionId>,
        intent: Option<ActionIntent>,
        care: bool,
    ) -> Result<Decision> {
        self.persist_record(
            decision,
            msg,
            AuditContext {
                path,
                parent,
                intent,
                care,
                actor: None,
            },
        )
    }

    pub(crate) fn record_external(
        &mut self,
        decision: Decision,
        msg: Option<&IngestedMessage>,
        path: GatePath,
        parent: Option<DecisionId>,
        actor: &crate::gate::GateActor,
    ) -> Result<Decision> {
        self.persist_record(
            decision,
            msg,
            AuditContext {
                path,
                parent,
                intent: None,
                care: false,
                actor: Some(actor),
            },
        )
    }

    fn persist_record(
        &mut self,
        decision: Decision,
        msg: Option<&IngestedMessage>,
        context: AuditContext<'_>,
    ) -> Result<Decision> {
        let AuditContext {
            path,
            parent,
            intent,
            care,
            actor,
        } = context;
        let decision: Decision =
            serde_json::from_value(serde_json::to_value(decision).map_err(internal)?)
                .map_err(internal)?;
        let id = decision
            .decision_id
            .as_str()
            .parse::<ulid::Ulid>()
            .map_err(internal)?;
        let at =
            cc_store::Timestamp::parse(&String::from(decision.at.clone())).map_err(internal)?;
        if let Some(msg) = msg
            && !msg.login.is_empty()
        {
            self.store
                .map_user(msg.user_id.clone(), &msg.login)
                .map_err(internal)?;
        }
        let mut user_ids: Vec<_> = msg.map(|m| vec![m.user_id.clone()]).unwrap_or_default();
        if let Some(actor) = actor {
            self.store
                .map_user(actor.user_id.clone(), &actor.login)
                .map_err(internal)?;
            if !user_ids.contains(&actor.user_id) {
                user_ids.push(actor.user_id.clone());
            }
        }
        // Existing configuration records keep their legacy ledger-only shape.
        // New gate settings/external room events need a readable gate-roll entry
        // without fabricating a viewer or recording room changes as chat.
        if msg.is_some() || matches!(path, GatePath::GateSetting | GatePath::ExternalHuman) {
            let audit = Record {
                live_capture: self.live_capture.clone(),
                decision_id: decision.decision_id.clone(),
                message_id: decision.message_id.clone(),
                kind: decision.kind,
                verdict: decision.verdict,
                rule_id: decision.rule_id.clone(),
                operator: decision.operator,
                at: decision.at.clone(),
                simulated: decision.simulated,
                reason_codes: decision.reason_codes.clone(),
                user_id: msg.map(|m| m.user_id.clone()),
                moderator_id: actor.map(|a| a.user_id.clone()),
                path,
                parent,
                intent,
                care,
                rule_snapshot: decision
                    .rule_id
                    .as_ref()
                    .and_then(|id| self.config.get(id))
                    .map(|m| m.rule.clone()),
            };
            // Only pending review requires retaining the original. Erasure and
            // retention remain wholly owned by cc-store's existing inventory.
            if let Some(msg) = msg.filter(|_| {
                decision.kind == DecisionKind::BanPending
                    || matches!(path, GatePath::AutoModHeld | GatePath::SuspiciousReview)
            }) {
                self.store
                    .insert(
                        DataStore::Recordings,
                        &StoredItem {
                            id,
                            at: at.clone(),
                            user_ids: vec![msg.user_id.clone()],
                            content: serde_json::to_string(msg).map_err(internal)?,
                            simulated: msg.simulated,
                        },
                    )
                    .map_err(internal)?;
            }
            self.store
                .insert(
                    DataStore::Caches,
                    &StoredItem {
                        id,
                        at: at.clone(),
                        user_ids,
                        content: serde_json::to_string(&audit).map_err(internal)?,
                        simulated: decision.simulated,
                    },
                )
                .map_err(internal)?;
        }
        let action = match decision.kind {
            DecisionKind::Held => DecisionAction::Held,
            DecisionKind::Released => DecisionAction::Released,
            DecisionKind::Removed => DecisionAction::Removed,
            DecisionKind::Warned => DecisionAction::Warned,
            DecisionKind::TimedOut => DecisionAction::TimedOut,
            DecisionKind::Banned => DecisionAction::Banned,
            DecisionKind::BanPending => DecisionAction::BanPending,
            DecisionKind::ModeChanged => DecisionAction::ModeChanged,
            DecisionKind::Undone => DecisionAction::Undone,
            DecisionKind::WouldAct => DecisionAction::WouldAct,
        };
        self.store
            .append_ledger(
                at,
                self.clock.now(),
                LedgerEvent::Decision {
                    decision_id: id,
                    user_id: msg.map(|m| m.user_id.clone()),
                    action,
                },
            )
            .map_err(internal)?;
        Ok(decision)
    }

    /// Per-path coverage from committed audit records. Erased metadata is
    /// explicitly unmeasured, never counted as a gate that found nothing.
    pub fn ledger_summary(&self) -> Result<BTreeMap<String, u64>> {
        let mut summary = BTreeMap::new();
        for record in self.records()? {
            *summary.entry(record.path.label().to_owned()).or_default() += 1;
        }
        let ledger_count = self
            .store
            .read_ledger(LedgerKind::Decisions)
            .map_err(internal)?
            .len() as u64;
        let measured: u64 = summary.values().sum();
        summary.insert(
            "unmeasured_or_configuration".into(),
            ledger_count.saturating_sub(measured),
        );
        Ok(summary)
    }
}
