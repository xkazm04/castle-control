//! Room-only output and existing typed RPC contract.
use cc_gatehouse::governor::{RoomModeIntent, RoomSetting};
use cc_types::{LeaseId, RoomMode};

#[test]
fn output_is_exhaustively_room_modes_and_never_a_person_action() {
    fn room_only(intent: RoomModeIntent) -> RoomMode {
        match intent {
            RoomModeIntent::Apply {
                setting,
                expires_at: _,
                lease_id: _,
            } => match setting {
                RoomSetting::Slow { interval_s: _ } => RoomMode::Slow,
                RoomSetting::FollowerOnly { minimum_age_s: _ } => RoomMode::FollowerOnly,
                RoomSetting::EmoteOnly => RoomMode::EmoteOnly,
                RoomSetting::UniqueChat => RoomMode::UniqueChat,
            },
            RoomModeIntent::End { mode, .. } => mode,
        }
    }
    for setting in [
        RoomSetting::Slow { interval_s: 10 },
        RoomSetting::FollowerOnly { minimum_age_s: 0 },
        RoomSetting::EmoteOnly,
        RoomSetting::UniqueChat,
    ] {
        let mode = room_only(RoomModeIntent::Apply {
            lease_id: LeaseId::mint(),
            setting,
            expires_at: "2026-10-25T12:01:00Z".to_owned().try_into().unwrap(),
        });
        assert_eq!(
            room_only(RoomModeIntent::End {
                mode,
                lease_id: LeaseId::mint()
            }),
            mode
        );
    }
    let source = include_str!("../src/governor.rs");
    assert!(!source.contains("cc_twitch"));
    assert!(
        include_str!("../../cc-types/src/methods.rs").contains(
            "LeaseEnd => (\"gatehouse.lease.end\", LeaseEndParams, Decision, \"WP 1.3\")",
        )
    );
}
