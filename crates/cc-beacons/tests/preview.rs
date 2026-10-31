//! Generated bursts and an injected clock; no live audience data.
use cc_beacons::{
    intake::InputSelection,
    intensity::{Clock, IntensityEngine, simulate},
    preview::{PREVIEW_HOLD_S, PREVIEW_MAX_S, PreviewSession},
};
use cc_types::*;
use std::{cell::Cell, rc::Rc, time::Duration};

#[derive(Clone, Default)]
struct FakeClock(Rc<Cell<Duration>>);
impl Clock for FakeClock {
    fn now(&self) -> Duration {
        self.0.get()
    }
}
fn visual(decay: IntensityDecay) -> Visual {
    serde_json::from_value(serde_json::json!({
        "visual_id":"simulated-preview", "name":"Simulated preview",
        "curve":{"ranges":[{"total":0,"intensity":0.0},{"total":50,"intensity":1.0}],
        "decay":decay}
    }))
    .unwrap()
}
fn burst() -> SimulatedBurst {
    SimulatedBurst {
        source: ContributionSource::Gift,
        amount: 50,
    }
}
fn inputs() -> InputSelection {
    InputSelection::new(vec![(ContributionSource::Gift, 1)]).unwrap()
}
fn exponential(seconds: u32) -> IntensityDecay {
    IntensityDecay::Exponential {
        half_life_s: seconds.try_into().unwrap(),
    }
}
fn value(session: &mut PreviewSession<FakeClock>) -> Option<f64> {
    session.snapshot().unwrap().map(|v| f64::from(v.intensity))
}

#[test]
fn preview_decay_matches_live_math_and_is_repeatable() {
    for _ in 0..2 {
        let clock = FakeClock::default();
        let config = visual(exponential(60));
        let mut preview = PreviewSession::new(&config, &inputs(), &burst(), clock.clone()).unwrap();
        let mut live = IntensityEngine::new(
            config,
            "111".to_owned().try_into().unwrap(),
            inputs(),
            clock.clone(),
        )
        .unwrap();
        live.contribute(&Contribution {
            source: ContributionSource::Gift,
            broadcaster_id: "111".to_owned().try_into().unwrap(),
            event_id: "simulated-burst".to_owned().try_into().unwrap(),
            user_id: None,
            amount: 50,
            dedupe_key: "simulated-burst".into(),
        })
        .unwrap();
        assert_eq!(value(&mut preview), Some(1.0));
        clock.0.set(Duration::from_secs(60));
        assert_eq!(value(&mut preview), Some(0.5));
        assert_eq!(f64::from(live.snapshot().unwrap().intensity), 0.5);
    }
}

#[test]
fn preview_ends_at_first_floor_tick_and_never_reactivates() {
    let clock = FakeClock::default();
    let mut session =
        PreviewSession::new(&visual(exponential(60)), &inputs(), &burst(), clock.clone()).unwrap();
    for second in 0..=458 {
        clock.0.set(Duration::from_secs(second));
        assert!(value(&mut session).unwrap() > 0.005);
    }
    clock.0.set(Duration::from_secs(459));
    assert_eq!(value(&mut session), None);
    clock.0.set(Duration::ZERO);
    assert_eq!(value(&mut session), None);
}

#[test]
fn slow_decay_is_capped_at_preview_max() {
    let clock = FakeClock::default();
    let mut session = PreviewSession::new(
        &visual(exponential(3600)),
        &inputs(),
        &burst(),
        clock.clone(),
    )
    .unwrap();
    clock.0.set(Duration::from_secs(PREVIEW_MAX_S - 1));
    assert!(value(&mut session).is_some());
    clock.0.set(Duration::from_secs(PREVIEW_MAX_S));
    assert_eq!(value(&mut session), None);
}

#[test]
fn no_decay_holds_for_preview_hold_and_keeps_simulate_semantics() {
    let clock = FakeClock::default();
    let config = visual(IntensityDecay::None {});
    let expected = simulate(&config, &inputs(), &burst()).unwrap();
    let mut session = PreviewSession::new(&config, &inputs(), &burst(), clock.clone()).unwrap();
    assert_eq!(
        session.snapshot().unwrap(),
        Some(expected.intensity.clone())
    );
    clock.0.set(Duration::from_secs(PREVIEW_HOLD_S - 1));
    assert_eq!(value(&mut session), Some(1.0));
    clock.0.set(Duration::from_secs(PREVIEW_HOLD_S));
    assert_eq!(value(&mut session), None);
    assert_eq!(simulate(&config, &inputs(), &burst()).unwrap(), expected);
}
