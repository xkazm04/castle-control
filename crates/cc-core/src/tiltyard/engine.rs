//! Pure Chat reducer. Source: packages/duel/src/session/chat.ts, CHAT_TRANSITIONS.
use super::{ballots::empty, bracket, invalid};
use cc_types::*;
use std::cmp::Ordering;

pub(super) fn seed_order(a: &TiltyardSeed, b: &TiltyardSeed) -> Ordering {
    let (a, b) = (String::from(a.clone()), String::from(b.clone()));
    a.len().cmp(&b.len()).then_with(|| a.cmp(&b))
}
pub fn decide(counted: &TiltyardCounted, a: &TiltyardSeed, b: &TiltyardSeed) -> TiltyardVerdict {
    let side = if counted.left == counted.right {
        if seed_order(a, b) != Ordering::Greater {
            TiltyardWinner::Left
        } else {
            TiltyardWinner::Right
        }
    } else if counted.left > counted.right {
        TiltyardWinner::Left
    } else {
        TiltyardWinner::Right
    };
    TiltyardVerdict {
        side,
        how: if counted.left == counted.right {
            TiltyardDecision::Tie
        } else {
            TiltyardDecision::Tally
        },
    }
}
pub fn start(
    list: TiltyardList,
    key: TiltyardId,
    window_ms: TiltyardWindowMs,
) -> Result<TiltyardSession, ErrorEnvelope> {
    super::validate::list(&list)?;
    let bracket = bracket::start(&list);
    Ok(TiltyardSession {
        phase: TiltyardSessionPhase::Live,
        match_key: bracket::key(&key, &bracket),
        list,
        bracket,
        history: vec![],
        window_ms,
        key,
        elapsed_ms: 0,
        speed: 1.try_into().expect("speed"),
        calls: vec![],
        verdict: None,
        remaining_ms: 0,
        counted: empty(),
        simulated: false,
        window_ends_at: None,
        champion: None,
    })
}
fn close(s: &mut TiltyardSession, call: Option<TiltyardWinner>) -> Result<(), ErrorEnvelope> {
    let Some((round, index, m)) = bracket::current(&s.bracket) else {
        return Ok(());
    };
    let a = s
        .list
        .items
        .iter()
        .find(|item| item.id == m.a)
        .ok_or_else(invalid)?;
    let b = s
        .list
        .items
        .iter()
        .find(|item| item.id == m.b)
        .ok_or_else(invalid)?;
    let verdict = call.map_or_else(
        || decide(&s.counted, &a.seed, &b.seed),
        |side| TiltyardVerdict {
            side,
            how: TiltyardDecision::Call,
        },
    );
    let winner = if verdict.side == TiltyardWinner::Left {
        m.a.clone()
    } else {
        m.b.clone()
    };
    let closed = TiltyardClosedMatch {
        a: m.a.clone(),
        b: m.b.clone(),
        verdict: verdict.clone(),
        counted: s.counted.clone(),
        elapsed_ms: s.elapsed_ms,
        round: round.to_string().try_into().map_err(|_| invalid())?,
        index: index as u32,
        match_key: s.match_key.clone().ok_or_else(invalid)?,
    };
    s.history.push(s.bracket.clone());
    bracket::pick(&mut s.bracket, winner.clone());
    s.remaining_ms = if verdict.how == TiltyardDecision::Call {
        3000
    } else {
        4000
    };
    if verdict.how == TiltyardDecision::Call {
        s.calls.push(TiltyardCall {
            winner,
            counted: s.counted.clone(),
        });
    }
    s.verdict = Some(closed);
    s.phase = TiltyardSessionPhase::Verdict;
    Ok(())
}
fn settle(s: &mut TiltyardSession) {
    s.phase = if bracket::current(&s.bracket).is_some() {
        TiltyardSessionPhase::Live
    } else {
        TiltyardSessionPhase::Done
    };
    s.verdict = None;
    s.remaining_ms = 0;
    s.elapsed_ms = 0;
    s.match_key = bracket::key(&s.key, &s.bracket);
    s.champion = bracket::champion(&s.bracket);
    if s.phase == TiltyardSessionPhase::Live {
        s.counted = empty();
        s.simulated = false;
    }
}
pub fn step(s: &mut TiltyardSession, action: &TiltyardAction) -> Result<(), ErrorEnvelope> {
    use TiltyardAction as A;
    use TiltyardSessionPhase as P;
    match action {
        A::Start {
            list,
            key,
            window_ms,
        } => *s = start(list.clone(), key.clone(), *window_ms)?,
        A::Reset {} => *s = start(s.list.clone(), s.key.clone(), s.window_ms)?,
        A::Speed {} => {
            s.speed = (if u32::from(s.speed) == 1 { 3 } else { 1 })
                .try_into()
                .expect("speed")
        }
        A::Undo {} => {
            if let Some(bracket) = s.history.pop() {
                s.bracket = bracket;
                s.phase = P::Live;
                s.elapsed_ms = 0;
                s.match_key = bracket::key(&s.key, &s.bracket);
                s.verdict = None;
                s.champion = None;
                s.remaining_ms = 0;
                s.counted = empty();
                s.simulated = false;
            }
        }
        A::Pick { side } if s.phase == P::Live => close(s, Some(*side))?,
        A::Enter {} if s.phase == P::Live => close(s, None)?,
        A::Tick { ms } if s.phase == P::Live => {
            s.elapsed_ms = u64::from(s.elapsed_ms)
                .saturating_add(u64::from(*ms) * u64::from(u32::from(s.speed)))
                .min(u64::from(u32::from(s.window_ms))) as u32;
            if s.elapsed_ms >= u32::from(s.window_ms) {
                close(s, None)?;
            }
        }
        A::Pick { .. } | A::Enter {} if s.phase == P::Verdict => settle(s),
        A::Tick { ms } if s.phase == P::Verdict => {
            s.remaining_ms = s.remaining_ms.saturating_sub(*ms);
            if s.remaining_ms == 0 {
                settle(s);
            }
        }
        A::Cancel {} if matches!(s.phase, P::Live | P::Verdict) => {
            if s.phase == P::Verdict {
                settle(s);
            }
            s.phase = P::CalledOff;
        }
        A::Enter {} if s.phase == P::CalledOff => {
            if bracket::current(&s.bracket).is_some() {
                s.phase = P::Live;
            } else {
                *s = start(s.list.clone(), s.key.clone(), s.window_ms)?;
            }
        }
        A::Enter {} if s.phase == P::Done => {
            *s = start(s.list.clone(), s.key.clone(), s.window_ms)?
        }
        _ => {}
    }
    // Wall-clock projection belongs to the host, never to this reducer.
    s.window_ends_at = None;
    Ok(())
}
