#![allow(dead_code)]
use super::offline_common::text;
use cc_gatehouse::drill::{BlindJudge, Drill, ExpectedJudge, JudgeIdentity};
use cc_gatehouse::simulation::{RuleBank, near_miss_bank};
use cc_types::{DrillConfiguration, Rule};
use std::{collections::BTreeMap, sync::Arc};

pub fn identity() -> JudgeIdentity {
    JudgeIdentity {
        revision: "simulated-v1".into(),
        model: "offline-expected".into(),
        tier: "simulated-judge".into(),
        rubric: "observe actions against simulated cases".into(),
        parameters: BTreeMap::new(),
    }
}
pub fn service(bank: RuleBank, judge: Arc<dyn BlindJudge>) -> Drill {
    let mut drill = Drill::new("simulated-subject".into());
    drill.register_bank(bank).unwrap();
    drill
        .register_judge(text("simulated-judge"), judge)
        .unwrap();
    drill
}
pub fn standard() -> Drill {
    service(near_miss_bank(), Arc::new(ExpectedJudge(identity())))
}
pub fn config(rules: Vec<Rule>) -> DrillConfiguration {
    DrillConfiguration {
        rules,
        bank: text("simulated-near-misses-v1"),
        judge: text("simulated-judge"),
        prompts: vec![text("simulated prompt v1")],
    }
}
