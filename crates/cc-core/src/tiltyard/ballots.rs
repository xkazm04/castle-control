//! Post-verdict ballots only. Mirrors ballot-window.ts and tally.ts (unit weight).
use cc_types::*;
use std::collections::HashSet;

// ECMAScript whitespace: Rust's trim differs for BOM and NEL.
fn space(c: char) -> bool {
    matches!(c, '\u{0009}'..='\u{000d}' | ' ' | '\u{00a0}' | '\u{1680}'
        | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}'
        | '\u{205f}' | '\u{3000}' | '\u{feff}')
}
fn cheer_end(text: &str) -> Option<usize> {
    if !text.get(..5)?.eq_ignore_ascii_case("cheer") {
        return None;
    }
    let digits = text[5..].bytes().take_while(u8::is_ascii_digit).count();
    if digits == 0 {
        return None;
    }
    let end = 5 + digits;
    let rest = &text[end..];
    if !rest.chars().next().is_some_and(space) {
        return None;
    }
    Some(text.len() - rest.trim_start_matches(space).len())
}
pub fn ballot_option(text: &str) -> Option<TiltyardWinner> {
    let text = text.trim_matches(space);
    let text = cheer_end(text).map_or(text, |end| &text[end..]);
    let side = match text.as_bytes().first()? {
        b'1' => TiltyardWinner::Left,
        b'2' => TiltyardWinner::Right,
        _ => return None,
    };
    let rest = text[1..].trim_start_matches('!');
    (rest.is_empty() || rest.chars().next().is_some_and(space)).then_some(side)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Status {
    Barred,
    Held,
    Chatter,
    Repeat,
    Counted,
}
#[derive(Debug)]
pub struct BallotEvent {
    pub t_ms: i64,
    pub side: Option<TiltyardWinner>,
    pub status: Status,
    pub simulated: bool,
    pub cheer: bool,
}
#[derive(Debug, PartialEq)]
pub struct Tally {
    pub counted: TiltyardCounted,
    pub barred: TiltyardCounted,
    pub held: u32,
    pub repeat: u32,
    pub chatter: u32,
    pub cheers_as_one: u32,
    pub seen: u32,
    pub simulated: bool,
}
pub(super) fn millis(at: &Timestamp) -> i64 {
    chrono::DateTime::parse_from_rfc3339(&String::from(at.clone()))
        .expect("validated timestamp")
        .timestamp_millis()
}
pub fn classify_window(
    items: &[GatehouseChatItem],
    opened_at: &Timestamp,
    window_ms: u32,
) -> Vec<BallotEvent> {
    classify(items, |at| {
        let elapsed = at - millis(opened_at);
        (elapsed >= 0 && elapsed <= i64::from(window_ms)).then_some(elapsed)
    })
}
pub(super) fn classify(
    items: &[GatehouseChatItem],
    time: impl Fn(i64) -> Option<i64>,
) -> Vec<BallotEvent> {
    let mut ordered: Vec<_> = items
        .iter()
        .filter_map(|item| time(millis(&item.message.at)).map(|t| (t, item)))
        .collect();
    ordered.sort_by_key(|(t, _)| *t); // Stable: equal timestamps retain ledger/page order.
    let mut voted = HashSet::new();
    let mut messages = HashSet::new();
    ordered
        .into_iter()
        .filter_map(|(t_ms, item)| {
            if !messages.insert(item.message.message_id.clone()) {
                return None;
            }
            let side = ballot_option(&item.message.text);
            let status = match item.decision.verdict {
                Verdict::Bar => Status::Barred,
                Verdict::Hold => Status::Held,
                Verdict::Pass if side.is_none() => Status::Chatter,
                Verdict::Pass if !voted.insert(String::from(item.message.user_id.clone())) => {
                    Status::Repeat
                }
                Verdict::Pass => Status::Counted,
            };
            Some(BallotEvent {
                t_ms,
                side,
                status,
                simulated: item.provenance == GatehouseProvenance::Simulated,
                cheer: cheer_end(item.message.text.trim_start_matches(space)).is_some(),
            })
        })
        .collect()
}
pub fn tally_at(events: &[BallotEvent], elapsed_ms: i64) -> Tally {
    let mut tally = Tally {
        counted: empty(),
        barred: empty(),
        held: 0,
        repeat: 0,
        chatter: 0,
        cheers_as_one: 0,
        seen: 0,
        simulated: false,
    };
    for event in events.iter().filter(|event| event.t_ms <= elapsed_ms) {
        tally.seen += 1;
        match event.status {
            Status::Counted => {
                increment(&mut tally.counted, event.side);
                tally.simulated |= event.simulated;
                tally.cheers_as_one += u32::from(event.cheer);
            }
            Status::Barred => increment(&mut tally.barred, event.side),
            Status::Held => tally.held += 1,
            Status::Repeat => tally.repeat += 1,
            Status::Chatter => tally.chatter += 1,
        }
    }
    tally
}
fn increment(counted: &mut TiltyardCounted, side: Option<TiltyardWinner>) {
    match side {
        Some(TiltyardWinner::Left) => counted.left += 1,
        Some(TiltyardWinner::Right) => counted.right += 1,
        None => {}
    }
}
pub(super) fn empty() -> TiltyardCounted {
    TiltyardCounted { left: 0, right: 0 }
}
