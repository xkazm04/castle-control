//! Generated crowd lines for the dress rehearsal. Every line is SIMULATED and
//! written here; no caller text or identity enters. A few recurring generated
//! chatters break typical streamer rules, so a rule the streamer writes and
//! arms in rehearsal has something to catch. None of them is a real account.

/// One recurring generated chatter (logins fit Twitch's 25 characters, which
/// the store enforces). Ids sit far above the per-message
/// sequence the cheering crowd uses, so they never collide in practice.
pub(super) struct Breaker {
    pub id: u64,
    pub login: &'static str,
    pub body: &'static str,
}

pub(super) const CHEER: &str = "crowd cheering from the rehearsal seats";

/// Spoilers, backseating and a link from a first-time chatter: three common
/// written channel rules. Bodies carry no digits so they never count as duel
/// ballots, and no sample keyword so they never move the herald's chart.
pub(super) const BREAKERS: [Breaker; 3] = [
    Breaker {
        id: 900_000_001,
        login: "simulated_viewer_spoiler",
        body: "spoiler: the new boss dies in the final phase, the twin is the traitor",
    },
    Breaker {
        id: 900_000_002,
        login: "simulated_viewer_backseat",
        body: "backseat: go left, use the shield, why are you not healing",
    },
    Breaker {
        id: 900_000_003,
        login: "simulated_viewer_newlink",
        body: "first time here, free followers at simulated-link.example/free",
    },
];

/// Spoilers come round most often: they are the film's headline rule.
const ROTATION: [usize; 4] = [0, 1, 0, 2];

/// Every third crowd line is a rule breaker, rotating through the cast.
pub(super) fn line(index: u64) -> Option<&'static Breaker> {
    (index % 3 == 2).then(|| &BREAKERS[ROTATION[(index / 3 % 4) as usize]])
}
