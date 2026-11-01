//! Generated SIMULATED night ballots; the leading token is the real Chat grammar.
pub(crate) fn text(index: u64) -> &'static str {
    if index % 3 == 2 {
        "2 SIMULATED duel ballot right"
    } else {
        "1 SIMULATED duel ballot left"
    }
}
