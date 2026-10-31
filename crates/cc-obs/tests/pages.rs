//! Shared simulated page grammar, consumed unchanged by the renderer tests.
use cc_obs::pages::{self, OverlayPage};
use serde::Deserialize;

#[derive(Deserialize)]
struct Case {
    target: String,
    kind: Option<String>,
    canonical: Option<String>,
}

#[test]
fn vote_bar_accepts_only_current_room_and_presentation_keys() {
    assert!(pages::parse("/gatehouse/current", None).is_some());
    assert!(pages::parse("/gatehouse/current", Some("scale=bad&anchor=tr")).is_some());
    for target in [
        "/gatehouse/unknown",
        "/gatehouse/current/extra",
        "/gatehouse/123",
    ] {
        assert!(pages::parse(target, None).is_none());
    }
    assert!(pages::parse("/gatehouse/current", Some("text=private")).is_none());
}

#[test]
fn shared_paths_pin_identity_and_presentation_query_semantics() {
    let cases: Vec<Case> =
        serde_json::from_str(include_str!("fixtures/overlay-paths.json")).unwrap();
    assert!(!cases.is_empty());
    for case in cases {
        let (path, query) = case
            .target
            .split_once('?')
            .map_or((case.target.as_str(), None), |(path, query)| {
                (path, Some(query))
            });
        let page = pages::parse(path, query);
        let kind = page.map(|page| match page {
            OverlayPage::Spike => "spike",
            OverlayPage::VoteBar => "vote_bar",
            OverlayPage::Beacons { .. } => "beacons",
            OverlayPage::Lots { .. } => "lots",
        });
        assert_eq!(kind, case.kind.as_deref(), "{}", case.target);
        assert_eq!(
            page.map(|p| p.path_and_query()),
            case.canonical,
            "{}",
            case.target
        );
        if let Some(page) = page {
            let canonical = page.path_and_query();
            let (path, query) = canonical
                .split_once('?')
                .map_or((canonical.as_str(), None), |(path, query)| {
                    (path, Some(query))
                });
            assert_eq!(pages::parse(path, query), Some(page));
        }
    }
}
