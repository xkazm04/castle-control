//! Custom design method payloads: design roots, the art director, layer
//! analysis, library import and vote bar design. Contract only.
use crate::{
    ArtAnchors, ArtAssetKind, ArtCostReceipt, ArtDimension, DesignId, DesignPackage, HexColor,
    LibraryAssetId, LocalAssetPath,
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

// Use Rust's Unicode whitespace set, as ArtGenerateParams does, rather than JS \S.
const NONBLANK: &str =
    r"[^\u0009-\u000D\u0020\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]";

fn text(value: &str, max: usize) -> bool {
    !value.trim().is_empty() && value.chars().count() <= max
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct DesignCreateParams {
    pub kind: ArtAssetKind,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct DesignCreateResult {
    pub design_id: DesignId,
}

/// One art-director request; `answer` re-runs it with the follow-up chosen.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(try_from = "ArtDirectFields")]
#[schemars(with = "ArtDirectFields")]
pub struct ArtDirectParams {
    pub kind: ArtAssetKind,
    pub request: String,
    pub width: ArtDimension,
    pub height: ArtDimension,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub answer: Option<String>,
}

#[derive(Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct ArtDirectFields {
    kind: ArtAssetKind,
    #[schemars(length(min = 1, max = 500), pattern(NONBLANK))]
    request: String,
    width: ArtDimension,
    height: ArtDimension,
    #[serde(default, deserialize_with = "crate::present")]
    #[schemars(with = "String", length(min = 1, max = 120), pattern(NONBLANK))]
    answer: Option<String>,
}
impl TryFrom<ArtDirectFields> for ArtDirectParams {
    type Error = &'static str;
    fn try_from(v: ArtDirectFields) -> Result<Self, Self::Error> {
        if !text(&v.request, 500) || v.answer.as_deref().is_some_and(|a| !text(a, 120)) {
            return Err("expected nonblank request <= 500 and answer <= 120 characters");
        }
        Ok(Self {
            kind: v.kind,
            request: v.request,
            width: v.width,
            height: v.height,
            answer: v.answer,
        })
    }
}

/// The director's interpretation and the prompt it will send to the provider.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(try_from = "ArtDirectionFields")]
#[schemars(with = "ArtDirectionFields")]
pub struct ArtDirection {
    pub kind: ArtAssetKind,
    pub interpretation: String,
    pub style_name: String,
    pub palette: Vec<HexColor>,
    pub assumptions: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub question: Option<ArtQuestion>,
    pub master_prompt: String,
    pub width: ArtDimension,
    pub height: ArtDimension,
}

#[derive(Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct ArtDirectionFields {
    kind: ArtAssetKind,
    #[schemars(pattern(NONBLANK))]
    interpretation: String,
    #[schemars(pattern(NONBLANK))]
    style_name: String,
    #[schemars(length(max = 6))]
    palette: Vec<HexColor>,
    #[schemars(length(max = 3), inner(pattern(NONBLANK)))]
    assumptions: Vec<String>,
    #[serde(default, deserialize_with = "crate::present")]
    #[schemars(with = "ArtQuestion")]
    question: Option<ArtQuestion>,
    #[schemars(length(min = 1, max = 1400), pattern(NONBLANK))]
    master_prompt: String,
    width: ArtDimension,
    height: ArtDimension,
}
impl TryFrom<ArtDirectionFields> for ArtDirection {
    type Error = &'static str;
    fn try_from(v: ArtDirectionFields) -> Result<Self, Self::Error> {
        if !text(&v.interpretation, usize::MAX) || !text(&v.style_name, usize::MAX) {
            return Err("expected nonblank interpretation and style name");
        }
        if v.palette.len() > 6 || v.assumptions.len() > 3 {
            return Err("expected at most six colours and three assumptions");
        }
        if !v.assumptions.iter().all(|a| text(a, usize::MAX)) || !text(&v.master_prompt, 1400) {
            return Err("expected nonblank assumptions and master prompt <= 1400 characters");
        }
        Ok(Self {
            kind: v.kind,
            interpretation: v.interpretation,
            style_name: v.style_name,
            palette: v.palette,
            assumptions: v.assumptions,
            question: v.question,
            master_prompt: v.master_prompt,
            width: v.width,
            height: v.height,
        })
    }
}

/// One follow-up question; `assumed` is the option preselected when unanswered.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(try_from = "ArtQuestionFields")]
#[schemars(with = "ArtQuestionFields")]
pub struct ArtQuestion {
    pub text: String,
    pub options: Vec<String>,
    pub assumed: String,
}

#[derive(Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct ArtQuestionFields {
    #[schemars(pattern(NONBLANK))]
    text: String,
    #[schemars(length(min = 2, max = 4), inner(pattern(NONBLANK)))]
    options: Vec<String>,
    #[schemars(pattern(NONBLANK))]
    assumed: String,
}
impl TryFrom<ArtQuestionFields> for ArtQuestion {
    type Error = &'static str;
    fn try_from(v: ArtQuestionFields) -> Result<Self, Self::Error> {
        let options =
            (2..=4).contains(&v.options.len()) && v.options.iter().all(|o| text(o, usize::MAX));
        if !options || !text(&v.text, usize::MAX) || !text(&v.assumed, usize::MAX) {
            return Err("expected nonblank question, assumed option and 2..4 options");
        }
        Ok(Self {
            text: v.text,
            options: v.options,
            assumed: v.assumed,
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ArtLayersParams {
    pub design_id: DesignId,
    pub asset: LocalAssetPath,
    pub kind: ArtAssetKind,
}

/// Base/effect split, measured anchors and the bound package; `costs` may be
/// empty when the kind has no effect and no paid edit call was made.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ArtLayers {
    pub design_id: DesignId,
    pub base: LocalAssetPath,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::present"
    )]
    #[schemars(with = "LocalAssetPath")]
    pub effect: Option<LocalAssetPath>,
    pub anchors: ArtAnchors,
    pub package: DesignPackage,
    pub costs: Vec<ArtCostReceipt>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct LibraryImportParams {
    pub library_id: LibraryAssetId,
    pub kind: ArtAssetKind,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct LibraryImportResult {
    pub design_id: DesignId,
}

/// An omitted design clears the vote bar art.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct VoteBarDesignSetParams {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "DesignId")]
    pub design_id: Option<DesignId>,
}
impl<'de> Deserialize<'de> for VoteBarDesignSetParams {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        #[derive(Deserialize)]
        #[serde(deny_unknown_fields)]
        struct Fields {
            #[serde(default, deserialize_with = "crate::present")]
            design_id: Option<DesignId>,
        }
        let f: Fields = crate::object(d)?;
        Ok(Self {
            design_id: f.design_id,
        })
    }
}
