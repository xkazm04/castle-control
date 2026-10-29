use super::internal;
use crate::Registry;
use cc_types::*;

pub(super) fn mutation(proposal: &WritProposal) -> RpcRequest {
    match proposal {
        WritProposal::DrawUpsert(diff) => RpcRequest::DrawUpsert(diff.after.clone()),
        WritProposal::RulesUpsert(diff) => RpcRequest::RulesUpsert(diff.after.clone()),
        WritProposal::RulesSetMode(diff) => RpcRequest::RulesSetMode(diff.after.clone()),
        WritProposal::VisualUpsert(diff) => RpcRequest::VisualUpsert(diff.after.clone()),
        WritProposal::CurveSet(diff) => RpcRequest::CurveSet(diff.after.clone()),
    }
}

/// Read whole typed snapshots through the same registry as the desktop. Never
/// trust the model's before value, and never create a second configuration store.
pub(super) async fn snapshot(
    proposal: &WritProposal,
    registry: &Registry,
) -> Result<WritProposal, ErrorEnvelope> {
    Ok(match proposal {
        WritProposal::DrawUpsert(diff) => {
            let result: DrawListResult = read(registry, RpcRequest::DrawList(Empty {})).await?;
            WritProposal::DrawUpsert(WritDiff {
                before: result
                    .draws
                    .into_iter()
                    .find(|draw| draw.draw_id == diff.after.draw.draw_id)
                    .map(|draw| DrawUpsertParams { draw }),
                after: diff.after.clone(),
            })
        }
        WritProposal::RulesUpsert(diff) => {
            let result: RulesListResult = read(registry, RpcRequest::RulesList(Empty {})).await?;
            WritProposal::RulesUpsert(WritDiff {
                before: result
                    .rules
                    .into_iter()
                    .find(|rule| rule.rule_id == diff.after.rule.rule_id)
                    .map(|rule| RulesUpsertParams { rule }),
                after: diff.after.clone(),
            })
        }
        WritProposal::RulesSetMode(diff) => {
            let result: RulesListResult = read(registry, RpcRequest::RulesList(Empty {})).await?;
            let rule = result
                .rules
                .into_iter()
                .find(|rule| rule.rule_id == diff.after.rule_id)
                .ok_or_else(|| {
                    ErrorEnvelope::new(ErrorCode::NotFound, "proposal rule not found")
                })?;
            let mut after = diff.after.clone();
            after.acknowledgement = None;
            WritProposal::RulesSetMode(WritDiff {
                before: Some(RulesSetModeParams {
                    rule_id: rule.rule_id,
                    mode: rule.mode,
                    acknowledgement: None,
                }),
                after,
            })
        }
        WritProposal::VisualUpsert(diff) => {
            let result: VisualListResult = read(registry, RpcRequest::VisualList(Empty {})).await?;
            WritProposal::VisualUpsert(WritDiff {
                before: result
                    .visuals
                    .into_iter()
                    .find(|visual| visual.visual_id == diff.after.visual.visual_id)
                    .map(|visual| VisualUpsertParams { visual }),
                after: diff.after.clone(),
            })
        }
        WritProposal::CurveSet(diff) => {
            let result: VisualListResult = read(registry, RpcRequest::VisualList(Empty {})).await?;
            let visual = result
                .visuals
                .into_iter()
                .find(|visual| visual.visual_id == diff.after.visual_id)
                .ok_or_else(|| {
                    ErrorEnvelope::new(ErrorCode::NotFound, "proposal visual not found")
                })?;
            WritProposal::CurveSet(WritDiff {
                before: Some(CurveSetParams {
                    visual_id: visual.visual_id,
                    curve: visual.curve,
                }),
                after: diff.after.clone(),
            })
        }
    })
}

pub(super) async fn check(
    proposal: &WritProposal,
    registry: &Registry,
) -> Result<(), ErrorEnvelope> {
    if let WritProposal::DrawUpsert(diff) = proposal {
        let result: DrawCheckResult = read(
            registry,
            RpcRequest::DrawCheck(DrawCheckParams {
                policy: diff.after.draw.policy.clone(),
            }),
        )
        .await?;
        if result.result == CheckResult::Blocked {
            return Err(ErrorEnvelope::new(
                ErrorCode::BlockedByPolicy,
                result.reasons.join(", "),
            ));
        }
    }
    // A typed struct literal is not proof of schema validity. Re-enter the
    // existing generated request parser before handing parameters to a handler.
    cc_types::parse_request(&serde_json::to_vec(&mutation(proposal)).map_err(|_| internal())?)?;
    Ok(())
}

async fn read<T: serde::de::DeserializeOwned>(
    registry: &Registry,
    request: RpcRequest,
) -> Result<T, ErrorEnvelope> {
    serde_json::from_value(registry.dispatch_inner(&request).await?).map_err(|_| internal())
}
