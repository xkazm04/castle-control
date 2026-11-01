//! In-memory sample data for the isolated rehearsal composition only.
use cc_gatehouse::herald::DirectionSeed;
use rand::seq::SliceRandom;

pub(crate) fn seeds() -> Vec<DirectionSeed> {
    [
        ("sample_castle", "Sample: Castle", "castle"),
        ("sample_forest", "Sample: Forest", "forest"),
        ("sample_sea", "Sample: Sea", "sea"),
    ]
    .into_iter()
    .map(|(key, label, keyword)| DirectionSeed {
        key: key.to_owned().try_into().expect("static sample key"),
        label: label.to_owned().try_into().expect("static sample label"),
        keywords: vec![keyword.to_owned()],
    })
    .collect()
}

pub(super) fn ballots() -> Vec<&'static str> {
    // Roughly 50/30/20, with bounded count jitter and shuffled arrival order.
    // Every round includes all three samples, even at the jitter extremes.
    let castle = rand::random_range(14..=16);
    let forest = rand::random_range(8..=10);
    let mut ballots = vec!["vote castle"; castle];
    ballots.extend(std::iter::repeat_n("vote forest", forest));
    ballots.resize(30, "vote sea");
    ballots.shuffle(&mut rand::rng());
    ballots
}
