//! Pairing and progression ported from packages/duel/src/bracket.ts.
use cc_types::*;

pub(super) fn start(list: &TiltyardList) -> TiltyardBracket {
    let size = if list.items.len() >= 8 {
        8
    } else if list.items.len() >= 4 {
        4
    } else {
        2
    };
    let seeds: Vec<_> = list
        .items
        .iter()
        .take(size)
        .map(|item| item.id.clone())
        .collect();
    let pairs: &[(usize, usize)] = match size {
        8 => &[(0, 7), (3, 4), (1, 6), (2, 5)],
        4 => &[(0, 3), (1, 2)],
        _ => &[(0, 1)],
    };
    let matches = pairs
        .iter()
        .map(|&(a, b)| TiltyardMatch {
            a: seeds[a].clone(),
            b: seeds[b].clone(),
            winner: None,
        })
        .collect();
    TiltyardBracket {
        seeds,
        rounds: vec![TiltyardMatches(matches)],
    }
}

pub(super) fn current(bracket: &TiltyardBracket) -> Option<(usize, usize, &TiltyardMatch)> {
    let round = bracket.rounds.len().checked_sub(1)?;
    bracket.rounds[round]
        .0
        .iter()
        .enumerate()
        .find(|(_, m)| m.winner.is_none())
        .map(|(index, m)| (round, index, m))
}

pub(super) fn key(prefix: &TiltyardId, bracket: &TiltyardBracket) -> Option<TiltyardMatchKey> {
    current(bracket).map(|(round, index, _)| {
        format!("{}:{round}:{index}", String::from(prefix.clone()))
            .try_into()
            .expect("bounded match key")
    })
}

pub(super) fn pick(bracket: &mut TiltyardBracket, winner: TiltyardId) {
    let Some((round, index, _)) = current(bracket) else {
        return;
    };
    bracket.rounds[round].0[index].winner = Some(winner);
    let done = &bracket.rounds[round].0;
    if done.len() > 1 && done.iter().all(|m| m.winner.is_some()) {
        let next = done
            .chunks_exact(2)
            .map(|pair| TiltyardMatch {
                a: pair[0].winner.clone().expect("complete round"),
                b: pair[1].winner.clone().expect("complete round"),
                winner: None,
            })
            .collect();
        bracket.rounds.push(TiltyardMatches(next));
    }
}

pub(super) fn champion(bracket: &TiltyardBracket) -> Option<TiltyardId> {
    let last = &bracket.rounds.last()?.0;
    (last.len() == 1).then(|| last[0].winner.clone()).flatten()
}
