// Adapted from Shadowrunr OS @ 7e4b6f8,
// crates/shadowrunr-daemon/src/moderator/rules.rs (Apache-2.0; see NOTICE).
use crate::{Result, date, error, internal};
use cc_types::{Action, ErrorCode, Rule, RuleId, Timestamp};
use regex::{Regex, RegexBuilder};
use std::collections::{BTreeMap, VecDeque};

#[cfg(test)]
thread_local! {
    pub(crate) static COMPILES: std::cell::Cell<usize> = const { std::cell::Cell::new(0) };
}

pub(crate) fn compile(pattern: &str) -> Result<Regex> {
    #[cfg(test)]
    COMPILES.with(|compiles| compiles.set(compiles.get() + 1));
    RegexBuilder::new(pattern)
        .case_insensitive(true)
        .size_limit(1 << 20)
        .build()
        .map_err(|_| error(ErrorCode::Invalid, "invalid or oversized rule regex"))
}

pub(crate) fn validate(rule: Rule) -> Result<Rule> {
    // Rust callers can construct structs directly; use the same contract door.
    let rule: Rule = serde_json::from_value(serde_json::to_value(rule).map_err(internal)?)
        .map_err(|_| error(ErrorCode::Invalid, "invalid rule"))?;
    if let Some(pattern) = &rule.pattern {
        compile(pattern)?;
    }
    Ok(rule)
}

fn destretch(text: &str, keep: usize) -> String {
    let mut out = String::new();
    let mut iter = text.chars().peekable();
    while let Some(c) = iter.next() {
        let mut n = 1;
        while iter.peek() == Some(&c) {
            iter.next();
            n += 1;
        }
        out.extend(std::iter::repeat_n(c, if n >= 3 { keep } else { n }));
    }
    out
}

pub(crate) fn variants(text: &str) -> Vec<String> {
    let normalized: String = text
        .to_lowercase()
        .chars()
        .filter(|c| !matches!(c, '\u{200b}' | '\u{200c}' | '\u{200d}' | '\u{feff}'))
        .map(|c| match c {
            '’' | '‘' => '\'',
            _ => c,
        })
        .collect();
    vec![
        text.to_owned(),
        destretch(&normalized, 1),
        destretch(&normalized, 2),
        normalized,
    ]
}

/// Recall-biased: ambiguous danger language also reaches the streamer. Never a
/// diagnosis or an automatic external report.
pub(crate) fn disclosure(text: &str) -> bool {
    const SIGNALS: &[&str] = &[
        "suicid",
        "self harm",
        "self-harm",
        "selfharm",
        "kill myself",
        "kill my self",
        "killing myself",
        "end my life",
        "ending my life",
        "take my life",
        "hurt myself",
        "hurting myself",
        "cut myself",
        "cutting myself",
        "want to die",
        "wanna die",
        "wish i was dead",
        "wish i were dead",
        "better off dead",
        "can't go on",
        "cannot go on",
        "cant go on",
        "can't keep going",
        "not safe",
        "overdos",
        "took pills",
        "taken pills",
        "being abused",
        "in danger",
        "need help",
        "please help",
        "emergency",
        "in crisis",
        "don't want to live",
        "dont want to live",
        "do not want to live",
        "won't be here tomorrow",
        "wont be here tomorrow",
        "can't stay safe",
        "cant stay safe",
        "make it through tonight",
        "may not be here tomorrow",
        "want it all to stop",
    ];
    variants(text).iter().any(|v| {
        let compact: String = v.chars().filter(|c| c.is_alphanumeric()).collect();
        SIGNALS.iter().any(|signal| {
            let signal: String = signal.chars().filter(|c| c.is_alphanumeric()).collect();
            compact.contains(&signal)
        })
    })
}

/// Only tagged rule hits call this method. Normal conversation never incurs a
/// persistence penalty; state resets on restart, as in the pinned source.
#[derive(Default)]
pub(crate) struct Strikes {
    hits: BTreeMap<(String, RuleId), (i64, VecDeque<i64>)>,
}

impl Strikes {
    pub fn hit(
        &mut self,
        user: &str,
        rule: &Rule,
        at: &Timestamp,
    ) -> Result<(Action, Option<u32>)> {
        let Some(policy) = &rule.strikes else {
            return Ok((rule.action, rule.timeout_s));
        };
        let now = date(at)?.timestamp();
        let window = i64::from(policy.window_s);
        self.hits
            .retain(|_, (own_window, q)| q.back().is_some_and(|t| now - *t <= *own_window));
        let (own_window, q) = self
            .hits
            .entry((user.to_owned(), rule.rule_id.clone()))
            .or_insert_with(|| (window, VecDeque::new()));
        *own_window = window;
        while q.front().is_some_and(|t| now - *t > window) {
            q.pop_front();
        }
        q.push_back(now);
        Ok(if q.len() >= policy.count as usize {
            (policy.then, policy.then_timeout_s)
        } else {
            (rule.action, rule.timeout_s)
        })
    }
}

#[cfg(test)]
mod compile_count_tests {
    use super::COMPILES;
    use crate::{Classifier, ClassifierError, Gatehouse, IngestedMessage};
    use async_trait::async_trait;
    use cc_store::TwitchUserId;
    use cc_types::{Action, Rule, RuleClass, RuleId, RuleMode, RulesUpsertParams, Timestamp};

    struct NoClassifier;
    #[async_trait]
    impl Classifier for NoClassifier {
        async fn classify(&self, _: &str, _: &str) -> Result<String, ClassifierError> {
            panic!("pattern-only messages must not call the classifier")
        }
    }

    fn pattern(id: &str, pattern: &str) -> Rule {
        Rule {
            rule_id: RuleId::try_from(id.to_owned()).unwrap(),
            name: "Simulated rule".into(),
            rule_class: RuleClass::Pattern,
            mode: RuleMode::Shadow,
            action: Action::Delete,
            delivery: "streamer".into(),
            pattern: Some(pattern.into()),
            text: None,
            timeout_s: None,
            strikes: None,
            auto_ban_grant: None,
        }
    }

    fn message(index: usize) -> IngestedMessage {
        IngestedMessage {
            message_id: format!("simulated-{index}").try_into().unwrap(),
            user_id: TwitchUserId::parse(&(100 + index).to_string()).unwrap(),
            login: format!("simulated_{index}"),
            text: "Ordinary simulated chat".into(),
            at: Timestamp::now(),
            simulated: true,
            metadata: None,
        }
    }

    #[tokio::test]
    async fn rule_patterns_compile_once_per_rule_not_per_message() {
        let root = tempfile::tempdir().unwrap();
        let mut gate = Gatehouse::open(root.path()).unwrap();
        for (id, text) in [("p1", "zzz1"), ("p2", "zzz2"), ("p3", "zzz3")] {
            gate.rules_upsert(RulesUpsertParams {
                rule: pattern(id, text),
                display: None,
            })
            .unwrap();
        }
        COMPILES.set(0);
        gate.screen_batch((0..50).map(message).collect(), &NoClassifier)
            .await
            .unwrap();
        assert!(COMPILES.get() <= 3, "compiled {} times", COMPILES.get());
    }
}
