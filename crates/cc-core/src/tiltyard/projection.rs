//! Viewer-free aggregate projection; closed cards keep the recorded pair.
use super::{bracket, invalid};
use cc_types::*;

pub(super) fn snapshot(
    s: &TiltyardSession,
    last: Option<&TiltyardClosedMatch>,
    at: Timestamp,
) -> Result<TiltyardRenderSnapshot, ErrorEnvelope> {
    use TiltyardSessionPhase as P;
    let closed = s.verdict.as_ref().or_else(|| {
        (bracket::current(&s.bracket).is_none())
            .then_some(last)
            .flatten()
    });
    let (a, b, round) = if let Some(closed) = closed {
        (
            &closed.a,
            &closed.b,
            String::from(closed.round.clone())
                .parse::<usize>()
                .map_err(|_| invalid())?,
        )
    } else {
        let (round, _, m) = bracket::current(&s.bracket).ok_or_else(invalid)?;
        (&m.a, &m.b, round)
    };
    let find = |id: &TiltyardId| {
        s.list
            .items
            .iter()
            .find(|item| &item.id == id)
            .ok_or_else(invalid)
    };
    let rounds = s.bracket.seeds.len().ilog2() as usize;
    let round_label = match rounds - round {
        1 => "Final",
        2 => "Semifinal",
        _ => "Quarterfinal",
    };
    let number = if closed.is_some() {
        s.history.len()
    } else {
        s.history.len() + 1
    };
    Ok(TiltyardRenderSnapshot {
        left: TiltyardSide {
            label: find(a)?.title.clone(),
            count: s.counted.left,
        },
        right: TiltyardSide {
            label: find(b)?.title.clone(),
            count: s.counted.right,
        },
        ballots: s.counted.left.saturating_add(s.counted.right),
        phase: match s.phase {
            P::Live => TiltyardRenderPhase::Open,
            P::Verdict if closed.is_some_and(|c| c.verdict.how == TiltyardDecision::Call) => {
                TiltyardRenderPhase::Called
            }
            P::Verdict => TiltyardRenderPhase::Closed,
            P::CalledOff => TiltyardRenderPhase::Cancelled,
            P::Done => TiltyardRenderPhase::Finished,
        },
        round_label: round_label.to_owned().try_into().map_err(|_| invalid())?,
        match_label: format!("Match {number}")
            .try_into()
            .map_err(|_| invalid())?,
        window_ends_at: s.window_ends_at.clone(),
        window_remaining_ms: (s.phase == P::CalledOff && s.match_key.is_some())
            .then(|| u32::from(s.window_ms) - s.elapsed_ms),
        verdict: closed.map(|c| c.verdict.clone()),
        champion: s.champion.as_ref().map(find).transpose()?.cloned(),
        simulated: s.simulated,
        at,
    })
}
