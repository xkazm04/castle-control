//! Shared preview vectors exercise the real compiler and variants, not a second matcher.
use crate::rules;
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Vector {
    pattern: String,
    text: String,
    expected: bool,
}

#[test]
fn shared_pattern_vectors() {
    let vectors: Vec<Vector> = serde_json::from_str(include_str!("pattern_vectors.json")).unwrap();
    assert!(!vectors.is_empty(), "refuse empty parity inventory");
    for row in vectors {
        let regex = rules::compile(&row.pattern).unwrap();
        assert_eq!(
            rules::variants(&row.text)
                .iter()
                .any(|text| regex.is_match(text)),
            row.expected,
            "pattern {:?}, text {:?}",
            row.pattern,
            row.text
        );
    }
}
