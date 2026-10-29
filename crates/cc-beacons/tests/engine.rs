//! All contributions in this suite are generated, simulated data.
use cc_beacons::{
    intake::{ContributionUnit, InputSelection, Intake, unit},
    intensity::{Clock, IntensityEngine, simulate, validate_curve},
};
use cc_types::*;
use std::{cell::Cell, num::NonZeroU32, rc::Rc, time::Duration};

#[derive(Clone, Default)]
struct FakeClock(Rc<Cell<Duration>>);
impl Clock for FakeClock {
    fn now(&self) -> Duration {
        self.0.get()
    }
}
fn id() -> TwitchUserId {
    TwitchUserId::try_from("123".to_owned()).unwrap()
}
fn contribution(source: ContributionSource, amount: u32) -> Contribution {
    Contribution {
        source,
        broadcaster_id: id(),
        event_id: MessageId::try_from("simulated-event".to_owned()).unwrap(),
        user_id: None,
        amount,
        dedupe_key: "simulated-contribution".to_owned(),
    }
}
fn visual() -> Visual {
    Visual {
        visual_id: VisualId::try_from("simulated-beacon".to_owned()).unwrap(),
        name: "Simulated beacon".to_owned(),
        design_id: None,
        input: None,
        curve: IntensityCurve {
            ranges: vec![
                IntensityRange {
                    total: 0,
                    intensity: Intensity::try_from(0.0).unwrap(),
                },
                IntensityRange {
                    total: 100,
                    intensity: Intensity::try_from(1.0).unwrap(),
                },
            ],
            decay: IntensityDecay::None {},
        },
    }
}
fn selection(source: ContributionSource) -> InputSelection {
    InputSelection::new(vec![(source, 1)]).unwrap()
}
fn value(value: BeaconsIntensity) -> f64 {
    f64::from(value.intensity)
}
#[test]
fn cheer_as_two_events_counts_once_in_either_order() {
    for sources in [
        [ContributionSource::Cheer, ContributionSource::BitsUse],
        [ContributionSource::BitsUse, ContributionSource::Cheer],
    ] {
        let mut engine =
            IntensityEngine::new(visual(), id(), selection(sources[0]), FakeClock::default())
                .unwrap();
        assert_eq!(
            value(engine.contribute(&contribution(sources[0], 25)).unwrap()),
            0.25
        );
        let mut overlap = contribution(sources[1], 25);
        overlap.event_id = MessageId::try_from("different-simulated-event".to_owned()).unwrap();
        assert_eq!(value(engine.contribute(&overlap).unwrap()), 0.25);
    }
}
#[test]
fn dedupe_uses_underlying_identity_and_broadcaster_not_user_or_transport() {
    let mut intake = Intake::default();
    let input = contribution(ContributionSource::Cheer, 7);
    assert!(intake.accept(&input).unwrap().is_some());
    assert!(intake.accept(&input).unwrap().is_none());
    let mut other = input.clone();
    other.dedupe_key = "another-simulated-contribution".to_owned();
    assert!(intake.accept(&other).unwrap().is_some());
    other = input.clone();
    other.broadcaster_id = TwitchUserId::try_from("456".to_owned()).unwrap();
    assert!(intake.accept(&other).unwrap().is_some());
    other.dedupe_key = "  ".to_owned();
    assert!(intake.accept(&other).is_err());
}
#[test]
fn units_preserve_native_amounts_and_reject_incompatible_aggregation() {
    use ContributionSource::*;
    for (source, expected) in [
        (Cheer, ContributionUnit::Bits),
        (BitsUse, ContributionUnit::Bits),
        (Subscribe, ContributionUnit::Count),
        (Gift, ContributionUnit::Count),
        (Resub, ContributionUnit::Count),
        (PowerUp, ContributionUnit::Count),
        (HypeTrain, ContributionUnit::Level),
        (ChannelPoints, ContributionUnit::Points),
        (Charity, ContributionUnit::MinorCurrency),
        (Goal, ContributionUnit::MinorCurrency),
    ] {
        assert_eq!(unit(source), expected);
        let normalized = Intake::default()
            .accept(&contribution(source, 123))
            .unwrap()
            .unwrap();
        assert_eq!(normalized.amount(), 123);
        assert_eq!(normalized.unit(), expected);
    }
    assert!(InputSelection::new(vec![(Cheer, 1), (Gift, 1)]).is_err());
    assert!(InputSelection::new(vec![(Cheer, 1), (BitsUse, 1)]).is_err());
    assert!(InputSelection::new(vec![(Gift, 0)]).is_err());
    assert!(InputSelection::new(vec![]).is_err());
}
#[test]
fn deterministic_decay_interleaves_new_contributions_without_resetting_old_age() {
    let clock = FakeClock::default();
    let mut config = visual();
    config.curve.decay = IntensityDecay::Exponential {
        half_life_s: NonZeroU32::new(10).unwrap(),
    };
    let mut engine = IntensityEngine::new(
        config,
        id(),
        selection(ContributionSource::Gift),
        clock.clone(),
    )
    .unwrap();
    assert_eq!(
        value(
            engine
                .contribute(&contribution(ContributionSource::Gift, 100))
                .unwrap()
        ),
        1.0
    );
    clock.0.set(Duration::from_secs(10));
    assert_eq!(value(engine.snapshot().unwrap()), 0.5);
    assert_eq!(value(engine.snapshot().unwrap()), 0.5);
    let mut next = contribution(ContributionSource::Gift, 50);
    next.dedupe_key = "simulated-second".to_owned();
    assert_eq!(value(engine.contribute(&next).unwrap()), 1.0);
    clock.0.set(Duration::from_secs(30));
    assert_eq!(value(engine.snapshot().unwrap()), 0.25);
    clock.0.set(Duration::from_secs(29));
    assert!(engine.snapshot().is_err());
    clock.0.set(Duration::from_secs(40));
    assert_eq!(value(engine.snapshot().unwrap()), 0.125);
}
#[test]
fn invalid_ranges_are_rejected_without_sorting_or_dropping_points() {
    let mut config = visual();
    config.curve.ranges.clear();
    assert!(validate_curve(&config.curve).is_err());
    config = visual();
    config.curve.ranges[1].total = 0;
    assert!(validate_curve(&config.curve).is_err());
    config = visual();
    config.curve.ranges.reverse();
    assert!(validate_curve(&config.curve).is_err());
    assert!(
        IntensityEngine::new(
            config,
            id(),
            selection(ContributionSource::Gift),
            FakeClock::default()
        )
        .is_err()
    );
}
#[test]
fn gift_bomb_simulation_is_pure_labelled_and_uses_weights() {
    let inputs = InputSelection::new(vec![
        (ContributionSource::Gift, 2),
        (ContributionSource::Subscribe, 1),
    ])
    .unwrap();
    let burst = SimulatedBurst {
        source: ContributionSource::Gift,
        amount: 50,
    };
    let mut engine =
        IntensityEngine::new(visual(), id(), inputs.clone(), FakeClock::default()).unwrap();
    for _ in 0..2 {
        let result = simulate(&visual(), &inputs, &burst).unwrap();
        assert_eq!(result.label, SimulationLabel::Simulated);
        assert_eq!(value(result.intensity), 1.0);
    }
    assert_eq!(value(engine.snapshot().unwrap()), 0.0);
    assert_eq!(
        value(
            engine
                .contribute(&contribution(ContributionSource::Gift, 25))
                .unwrap()
        ),
        0.5
    );
    let ordinary = simulate(&visual(), &selection(ContributionSource::Gift), &burst).unwrap();
    assert_eq!(value(ordinary.intensity), 0.5);
}
#[test]
fn interpolation_clamps_endpoints_and_supports_single_point_and_descending_intensity() {
    let mut config = visual();
    config.curve.ranges[0].total = 10;
    config.curve.ranges[0].intensity = Intensity::try_from(0.8).unwrap();
    config.curve.ranges[1].total = 20;
    config.curve.ranges[1].intensity = Intensity::try_from(0.2).unwrap();
    for (amount, expected) in [(0, 0.8), (15, 0.5), (u32::MAX, 0.2)] {
        let result = simulate(
            &config,
            &selection(ContributionSource::Gift),
            &SimulatedBurst {
                source: ContributionSource::Gift,
                amount,
            },
        )
        .unwrap();
        assert!((value(result.intensity) - expected).abs() < 1e-12);
    }
    config.curve.ranges.pop();
    let result = simulate(
        &config,
        &selection(ContributionSource::Gift),
        &SimulatedBurst {
            source: ContributionSource::Gift,
            amount: 50,
        },
    )
    .unwrap();
    assert_eq!(value(result.intensity), 0.8);
}
#[test]
fn wrong_channel_and_unselected_sources_never_change_totals() {
    let mut engine = IntensityEngine::new(
        visual(),
        id(),
        selection(ContributionSource::Gift),
        FakeClock::default(),
    )
    .unwrap();
    let mut other = contribution(ContributionSource::Gift, 100);
    other.broadcaster_id = TwitchUserId::try_from("456".to_owned()).unwrap();
    assert!(engine.contribute(&other).is_err());
    assert_eq!(
        value(
            engine
                .contribute(&contribution(ContributionSource::Cheer, 100))
                .unwrap()
        ),
        0.0
    );
    assert_eq!(
        value(
            engine
                .contribute(&contribution(ContributionSource::Gift, 50))
                .unwrap()
        ),
        0.5
    );
    assert!(
        simulate(
            &visual(),
            &selection(ContributionSource::Gift),
            &SimulatedBurst {
                source: ContributionSource::Cheer,
                amount: 100
            }
        )
        .is_err()
    );
}

#[test]
fn decay_uses_fractional_time_and_preserves_totals_above_the_last_range() {
    let clock = FakeClock::default();
    let mut config = visual();
    config.curve.decay = IntensityDecay::Exponential {
        half_life_s: NonZeroU32::new(1).unwrap(),
    };
    let mut engine = IntensityEngine::new(
        config,
        id(),
        selection(ContributionSource::Gift),
        clock.clone(),
    )
    .unwrap();
    assert_eq!(
        value(
            engine
                .contribute(&contribution(ContributionSource::Gift, 200))
                .unwrap()
        ),
        1.0
    );
    clock.0.set(Duration::from_secs(1));
    assert_eq!(value(engine.snapshot().unwrap()), 1.0);
    clock.0.set(Duration::from_millis(1500));
    assert!((value(engine.snapshot().unwrap()) - 0.5_f64.sqrt()).abs() < 1e-12);
    clock.0.set(Duration::MAX);
    assert_eq!(value(engine.snapshot().unwrap()), 0.0);
}

#[test]
fn no_decay_retains_totals_and_duplicate_arrival_does_not_add_or_reset() {
    let clock = FakeClock::default();
    let mut engine = IntensityEngine::new(
        visual(),
        id(),
        selection(ContributionSource::Gift),
        clock.clone(),
    )
    .unwrap();
    let input = contribution(ContributionSource::Gift, 50);
    assert_eq!(value(engine.contribute(&input).unwrap()), 0.5);
    clock.0.set(Duration::MAX);
    assert_eq!(value(engine.contribute(&input).unwrap()), 0.5);
    let mut invalid = input.clone();
    invalid.dedupe_key.clear();
    assert!(engine.contribute(&invalid).is_err());
    assert_eq!(value(engine.snapshot().unwrap()), 0.5);
}
