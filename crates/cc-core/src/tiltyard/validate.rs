//! State-dependent D5a invariants, beyond the structural cc-types door.
use super::{bracket, engine::seed_order, invalid};
use cc_types::*;
use std::{cmp::Ordering, collections::HashSet};

pub(super) fn list(list: &TiltyardList) -> Result<(), ErrorEnvelope> {
    if !(2..=64).contains(&list.items.len()) {
        return Err(invalid());
    }
    let mut ids = HashSet::new();
    if list
        .items
        .iter()
        .any(|item| !ids.insert(String::from(item.id.clone())))
        || list
            .items
            .windows(2)
            .any(|pair| seed_order(&pair[0].seed, &pair[1].seed) == Ordering::Greater)
    {
        return Err(invalid());
    }
    Ok(())
}
// Reconstructing via the sole legal progression also checks references, exact
// 2/4/8 size, pairing topology, round shape and sequential winners.
fn timeline(s: &TiltyardSession) -> Result<Vec<TiltyardBracket>, ErrorEnvelope> {
    let mut cursor = bracket::start(&s.list);
    let mut past = Vec::new();
    for _ in 0..s.bracket.seeds.len() {
        if cursor == s.bracket {
            return Ok(past);
        }
        let (round, index, m) = bracket::current(&cursor).ok_or_else(invalid)?;
        let winner = s
            .bracket
            .rounds
            .get(round)
            .and_then(|r| r.0.get(index))
            .and_then(|m| m.winner.clone())
            .ok_or_else(invalid)?;
        if winner != m.a && winner != m.b {
            return Err(invalid());
        }
        past.push(cursor.clone());
        bracket::pick(&mut cursor, winner);
    }
    Err(invalid())
}
pub(super) fn session(s: &TiltyardSession) -> Result<(), ErrorEnvelope> {
    list(&s.list)?;
    let past = timeline(s)?;
    if past != s.history
        || s.elapsed_ms > u32::from(s.window_ms)
        || (s.counted.left == 0 && s.counted.right == 0 && s.simulated)
        || s.calls
            .iter()
            .any(|call| !s.bracket.seeds.contains(&call.winner))
    {
        return Err(invalid());
    }
    use TiltyardSessionPhase as P;
    let current = bracket::current(&s.bracket);
    let champion = bracket::champion(&s.bracket);
    match s.phase {
        P::Live
            if current.is_some()
                && s.verdict.is_none()
                && s.champion.is_none()
                && s.remaining_ms == 0
                && s.match_key == bracket::key(&s.key, &s.bracket)
                && s.window_ends_at.is_some() => {}
        P::Verdict if s.champion.is_none() && s.window_ends_at.is_none() => {
            let closed = s.verdict.as_ref().ok_or_else(invalid)?;
            let previous = past.last().ok_or_else(invalid)?;
            let (round, index, m) = bracket::current(previous).ok_or_else(invalid)?;
            let winner = if closed.verdict.side == TiltyardWinner::Left {
                &m.a
            } else {
                &m.b
            };
            let duration = if closed.verdict.how == TiltyardDecision::Call {
                3000
            } else {
                4000
            };
            if closed.a != m.a
                || closed.b != m.b
                || String::from(closed.round.clone()) != round.to_string()
                || closed.index != index as u32
                || Some(closed.match_key.clone()) != bracket::key(&s.key, previous)
                || s.match_key != Some(closed.match_key.clone())
                || closed.counted != s.counted
                || closed.elapsed_ms != s.elapsed_ms
                || s.remaining_ms == 0
                || s.remaining_ms > duration
                || s.bracket.rounds[round].0[index].winner.as_ref() != Some(winner)
            {
                return Err(invalid());
            }
            if closed.verdict.how != TiltyardDecision::Call {
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
                if closed.verdict != super::engine::decide(&s.counted, &a.seed, &b.seed) {
                    return Err(invalid());
                }
            }
        }
        P::CalledOff
            if s.verdict.is_none()
                && s.remaining_ms == 0
                && s.window_ends_at.is_none()
                && s.match_key == bracket::key(&s.key, &s.bracket)
                && s.champion == champion
                && (champion.is_none() || s.elapsed_ms == 0) => {}
        P::Done
            if current.is_none()
                && champion.is_some()
                && s.champion == champion
                && s.verdict.is_none()
                && s.match_key.is_none()
                && s.remaining_ms == 0
                && s.elapsed_ms == 0
                && s.window_ends_at.is_none() => {}
        _ => return Err(invalid()),
    }
    Ok(())
}
