// Adapted from Shadowrunr OS @ 7e4b6f8,
// crates/shadowrunr-daemon/src/moderator/tests.rs (Apache-2.0; see NOTICE).
#![allow(dead_code)]
use async_trait::async_trait;
use cc_gatehouse::{Classifier, ClassifierError, Gatehouse, IngestedMessage};
use cc_store::{Clock, TwitchUserId};
use cc_types::{
    Action, ModeAcknowledgement, Rule, RuleClass, RuleId, RuleMode, RulesSetModeParams,
    RulesUpsertParams, Timestamp,
};
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicUsize, Ordering},
};

pub const NOW: &str = "2026-10-25T12:00:00Z";

pub struct TestClock(pub Mutex<String>);
impl Clock for TestClock {
    fn now(&self) -> cc_store::Timestamp {
        cc_store::Timestamp::parse(&self.0.lock().unwrap()).unwrap()
    }
}
impl TestClock {
    pub fn set(&self, time: &str) {
        *self.0.lock().unwrap() = time.into();
    }
}

pub fn at(time: &str) -> Timestamp {
    Timestamp::try_from(time.to_owned()).unwrap()
}

pub struct Fixture {
    pub gate: Gatehouse,
    pub root: tempfile::TempDir,
    pub clock: Arc<TestClock>,
}
impl Fixture {
    pub fn new() -> Self {
        let root = tempfile::tempdir().unwrap();
        let clock = Arc::new(TestClock(Mutex::new(NOW.into())));
        let gate = Gatehouse::with_clock(root.path(), clock.clone()).unwrap();
        Self { gate, root, clock }
    }
    pub fn upsert(&mut self, rule: Rule) {
        self.gate.rules_upsert(RulesUpsertParams { rule }).unwrap();
    }
    pub fn arm(&mut self, id: &str) {
        self.gate
            .rules_set_mode(RulesSetModeParams {
                rule_id: RuleId::try_from(id.to_owned()).unwrap(),
                mode: RuleMode::Armed,
                acknowledgement: Some(ModeAcknowledgement {
                    at: at(NOW),
                    reason: "Simulated test consent".into(),
                }),
            })
            .unwrap();
    }
}

pub fn pattern(id: &str, action: Action) -> Rule {
    Rule {
        rule_id: RuleId::try_from(id.to_owned()).unwrap(),
        name: "Simulated rule".into(),
        rule_class: RuleClass::Pattern,
        mode: RuleMode::Shadow,
        action,
        delivery: "streamer".into(),
        pattern: Some("tagged".into()),
        text: None,
        timeout_s: (action == Action::Timeout).then_some(60),
        strikes: None,
        auto_ban_grant: None,
    }
}

pub fn plain(action: Action) -> Rule {
    let mut rule = pattern("classifier", action);
    rule.rule_class = RuleClass::Classifier;
    rule.pattern = None;
    rule.text = Some("Reject tagged simulated messages".into());
    rule
}

pub fn message(id: usize, user: u64, text: &str) -> IngestedMessage {
    IngestedMessage {
        message_id: format!("simulated-{id}").try_into().unwrap(),
        user_id: TwitchUserId::parse(&user.to_string()).unwrap(),
        login: format!("sim_{user}"),
        text: text.into(),
        at: at(NOW),
        simulated: true,
        metadata: None,
    }
}

pub struct Fake {
    pub response: String,
    pub calls: AtomicUsize,
    pub prompts: Mutex<Vec<String>>,
    pub fail: bool,
}
impl Fake {
    pub fn new(response: &str) -> Self {
        Self {
            response: response.into(),
            calls: AtomicUsize::new(0),
            prompts: Mutex::new(Vec::new()),
            fail: false,
        }
    }
    pub fn calls(&self) -> usize {
        self.calls.load(Ordering::SeqCst)
    }
}
#[async_trait]
impl Classifier for Fake {
    async fn classify(&self, system: &str, prompt: &str) -> Result<String, ClassifierError> {
        assert!(system.contains("untrusted data"));
        self.calls.fetch_add(1, Ordering::SeqCst);
        self.prompts.lock().unwrap().push(prompt.to_owned());
        if self.fail {
            Err(ClassifierError)
        } else {
            Ok(self.response.clone())
        }
    }
}
