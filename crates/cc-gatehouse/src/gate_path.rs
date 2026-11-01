use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GatePath {
    Skipped,
    FoundNothing,
    Care,
    VerifiedAuthority,
    Shadow,
    PatternAction,
    ClassifierAction,
    BanPending,
    HumanReview,
    Withheld,
    Configuration,
    AutoModHeld,
    SuspiciousReview,
    ExternalHuman,
    GateSetting,
}

impl GatePath {
    pub(crate) fn label(self) -> &'static str {
        match self {
            Self::Skipped => "gate_skipped",
            Self::FoundNothing => "gate_found_nothing",
            Self::Care => "care",
            Self::VerifiedAuthority => "verified_authority",
            Self::Shadow => "shadow",
            Self::PatternAction => "pattern_action",
            Self::ClassifierAction => "classifier_action",
            Self::BanPending => "ban_pending",
            Self::HumanReview => "human_review",
            Self::Withheld => "withheld",
            Self::Configuration => "configuration",
            Self::AutoModHeld => "automod_held",
            Self::SuspiciousReview => "suspicious_review",
            Self::ExternalHuman => "external_human",
            Self::GateSetting => "gate_setting",
        }
    }
}
