//! Read-only hypothetical evaluation. Never instantiate the live service here.
use crate::{Classifier, IngestedMessage, Result, classifier, date, internal, rules};
use cc_types::{
    Action, DrillOutcome, DrillState, GatehouseText, RecordedMessage, Rule, RuleClass, RuleMode,
    Verdict,
};
use std::{collections::BTreeSet, time::Duration};

#[derive(Default)]
pub(crate) struct Evaluator {
    care: BTreeSet<String>,
    strikes: rules::Strikes,
}

impl Evaluator {
    pub async fn evaluate(
        &mut self,
        msg: &RecordedMessage,
        source: &GatehouseText,
        ruleset: &[Rule],
        prompts: &[GatehouseText],
        engine: &dyn Classifier,
    ) -> Result<DrillOutcome> {
        let mut out = DrillOutcome {
            message_id: msg.message_id.clone(),
            source: source.clone(),
            at: msg.at.clone(),
            state: DrillState::NotProvoked,
            verdict: None,
            action: None,
            rule_id: None,
            passed: None,
        };
        if msg.text.trim().is_empty() {
            out.state = DrillState::NotEvaluable;
            return Ok(out);
        }
        if rules::disclosure(&msg.text) || self.care.contains(&String::from(msg.user_id.clone())) {
            self.care.insert(String::from(msg.user_id.clone()));
            out.rule_id = Some("crisis-care".to_owned().try_into().map_err(internal)?);
            out.verdict = Some(Verdict::Hold);
            return Ok(out);
        }
        let mut hit = None;
        for rule in ruleset
            .iter()
            .filter(|r| r.rule_class == RuleClass::Pattern)
        {
            let pattern = rules::compile(
                rule.pattern
                    .as_deref()
                    .ok_or_else(|| internal("pattern missing"))?,
            )?;
            if rules::variants(&msg.text)
                .iter()
                .any(|text| pattern.is_match(text))
            {
                hit = Some((rule, Verdict::Bar));
                break;
            }
        }
        if hit.is_none() {
            let plain: Vec<_> = ruleset
                .iter()
                .filter(|r| r.rule_class == RuleClass::Classifier)
                .cloned()
                .collect();
            if !plain.is_empty() {
                let ingested = IngestedMessage {
                    message_id: msg.message_id.clone(),
                    user_id: String::from(msg.user_id.clone())
                        .try_into()
                        .map_err(internal)?,
                    login: String::new(),
                    text: msg.text.clone(),
                    at: msg.at.clone(),
                    simulated: true,
                    metadata: None,
                };
                let prompt = classifier::prompt(&plain, &[ingested]);
                let system = format!(
                    "{}\n{}",
                    classifier::SYSTEM,
                    prompts
                        .iter()
                        .cloned()
                        .map(String::from)
                        .collect::<Vec<_>>()
                        .join("\n")
                );
                let response =
                    tokio::time::timeout(Duration::from_secs(2), engine.classify(&system, &prompt))
                        .await;
                let response = match response {
                    Ok(Ok(response)) => response,
                    _ => {
                        out.state = DrillState::EngineFailed;
                        return Ok(out);
                    }
                };
                let Some(parsed) = classifier::parse(&response, &plain, 1) else {
                    out.state = DrillState::NotEvaluable;
                    return Ok(out);
                };
                if let Some((id, verdict)) = &parsed[0] {
                    hit = Some((
                        ruleset
                            .iter()
                            .find(|r| &r.rule_id == id)
                            .ok_or_else(|| internal("unknown replay rule"))?,
                        *verdict,
                    ));
                }
            }
        }
        out.verdict = Some(Verdict::Pass);
        if let Some((rule, verdict)) = hit {
            out.rule_id = Some(rule.rule_id.clone());
            let (action, _) =
                self.strikes
                    .hit(&String::from(msg.user_id.clone()), rule, &msg.at)?;
            if rule.mode == RuleMode::Armed {
                if verdict == Verdict::Hold || matches!(action, Action::Hold | Action::Ban) {
                    // Imported logs cannot manufacture human consent or a ban grant.
                    out.verdict = Some(Verdict::Hold);
                } else {
                    out.action = Some(action);
                    out.verdict = Some(if action == Action::Warn {
                        Verdict::Pass
                    } else {
                        Verdict::Bar
                    });
                }
            }
        }
        // Validate the replay clock even when no strike policy was exercised.
        date(&msg.at)?;
        Ok(out)
    }
}
