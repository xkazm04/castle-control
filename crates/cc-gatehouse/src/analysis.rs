//! Service-owned offline analysis; no network, model judge or live ledger writes.
use crate::{Classifier, ClassifierError, Gatehouse, Result, error, recorder::Recorder};
use crate::{
    drill::{Drill, ExpectedJudge, JudgeIdentity},
    herald::{HashedWords, Herald, PassedMessage},
    simulation::near_miss_bank,
};
use cc_types::{
    ConsensusGetParams, ConsensusGetResult, DrillConfiguration, DrillDiffParams, DrillDiffResult,
    DrillRunParams, DrillRunResult, ErrorCode, RecordingImportParams, RecordingImportResult,
    RuleClass, Timestamp,
};
use std::{collections::BTreeMap, sync::Arc};

pub(crate) struct Analysis {
    drill: Drill,
    herald: Herald,
}

impl Analysis {
    pub(crate) fn new(at: Timestamp) -> Result<Self> {
        let mut drill = Drill::new("rules-only".into());
        drill.register_bank(near_miss_bank())?;
        drill.register_judge(
            "rules-only".to_owned().try_into().expect("static label"),
            Arc::new(ExpectedJudge(JudgeIdentity {
                revision: "rules-only-v1".into(),
                model: "none".into(),
                tier: "deterministic-bank".into(),
                rubric: "Compare observed rule actions with immutable bank expectations".into(),
                parameters: BTreeMap::new(),
            })),
        )?;
        Ok(Self {
            drill,
            // No streamer seeds or emote meanings are invented. Until configured,
            // actually ingested messages can only populate the Other direction.
            herald: Herald::new(
                Vec::new(),
                BTreeMap::new(),
                Box::new(HashedWords),
                900.try_into().expect("nonzero history"),
                4_200,
                at,
            )?,
        })
    }
}

impl Gatehouse {
    pub fn recording_import(
        &mut self,
        params: RecordingImportParams,
    ) -> Result<RecordingImportResult> {
        Recorder::for_import(&mut self.store, self.clock.as_ref())?.import(params)
    }

    pub async fn drill_run(&mut self, params: DrillRunParams) -> Result<DrillRunResult> {
        rules_only(&params.configuration)?;
        let recording = Recorder::for_import(&mut self.store, self.clock.as_ref())?
            .resolve(&params.recording)?;
        self.analysis
            .drill
            .replay(&recording, params.configuration, &NoModel)
            .await
    }

    pub async fn drill_diff(&mut self, params: DrillDiffParams) -> Result<DrillDiffResult> {
        // Validate both sides before evaluating either one.
        rules_only(&params.baseline)?;
        rules_only(&params.candidate)?;
        let recording = Recorder::for_import(&mut self.store, self.clock.as_ref())?
            .resolve(&params.recording)?;
        self.analysis
            .drill
            .compare(&recording, params.baseline, params.candidate, &NoModel)
            .await
    }

    /// Rust-only post-verdict seam. Only ScreenedMessage::for_consensus can
    /// produce this token; recording imports and replay never call this method.
    pub fn consensus_ingest(&mut self, message: PassedMessage) -> Result<()> {
        self.analysis.herald.ingest(message)
    }

    pub fn consensus_get(&mut self, params: ConsensusGetParams) -> Result<ConsensusGetResult> {
        let at = self.now()?;
        self.analysis.herald.get(params, at)
    }
}

fn rules_only(config: &DrillConfiguration) -> Result<()> {
    if String::from(config.judge.clone()) != "rules-only"
        || config
            .rules
            .iter()
            .any(|rule| rule.rule_class == RuleClass::Classifier)
    {
        return Err(error(
            ErrorCode::Unavailable,
            "offline drill supports rules-only evaluation; model judges and classifiers are unavailable",
        ));
    }
    Ok(())
}

struct NoModel;
#[async_trait::async_trait]
impl Classifier for NoModel {
    async fn classify(&self, _: &str, _: &str) -> std::result::Result<String, ClassifierError> {
        Err(ClassifierError::RulesOnly)
    }
}
