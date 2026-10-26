//! Room-only output and deferred RPC registration contract.
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
    assert!({
        let typed = include_str!("../../cc-types/src/methods.rs").contains(
            "LeaseEnd => (\"gatehouse.lease.end\", LeaseEndParams, Decision, \"WP 1.3\")",
        );
        let mut directories =
            vec![std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../cc-core/src")];
        let mut source_files = 0;
        let mut unregistered = true;
        while let Some(directory) = directories.pop() {
            for entry in std::fs::read_dir(directory).expect("read cc-core source directory") {
                let entry = entry.expect("read cc-core source entry");
                let kind = entry.file_type().expect("read cc-core source file type");
                let path = entry.path();
                if kind.is_dir() {
                    directories.push(path);
                } else if kind.is_file() && path.extension().is_some_and(|value| value == "rs") {
                    source_files += 1;
                    let source = std::fs::read_to_string(path).expect("read cc-core Rust source");
                    unregistered &= !source.contains("gatehouse.lease.end");
                }
            }
        }
        typed && source_files > 0 && unregistered
    });
}
