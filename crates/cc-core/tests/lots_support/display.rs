use super::*;

#[tokio::test]
async fn display_and_draw_commit_together_and_failed_save_keeps_previous_configuration() {
    let h = Harness::new();
    h.call(
        "lots.draw.upsert",
        json!({"draw":draw(), "display":{"size":"S","colour_token":"or"}}),
    )
    .await;
    let original = std::fs::read(h.directory.path().join("draw-settings.json")).unwrap();
    // A storage failure before rename must publish neither half of the replacement.
    std::fs::create_dir(h.directory.path().join("draw-settings.pending")).unwrap();
    let mut replacement = draw();
    replacement["name"] = json!("SIMULATED unsaved replacement");
    assert_eq!(
        error(
            &h.registry,
            "lots.draw.upsert",
            json!({"draw":replacement,"display":{"size":"L","colour_token":"azure"}})
        )
        .await,
        ErrorCode::Internal
    );
    assert_eq!(
        h.call("lots.draw.list", json!({})).await,
        json!({"draws":[draw()]})
    );
    assert_eq!(
        std::fs::read(h.directory.path().join("draw-settings.json")).unwrap(),
        original
    );
}

#[tokio::test]
async fn display_is_per_draw_and_empty_replacement_resets_only_that_draw() {
    let h = Harness::new();
    h.call(
        "lots.draw.upsert",
        json!({"draw":draw(),"display":{"size":"S"}}),
    )
    .await;
    let mut second = draw();
    second["draw_id"] = json!("second-draw");
    h.call(
        "lots.draw.upsert",
        json!({"draw":second,"display":{"size":"L"}}),
    )
    .await;
    h.call("lots.draw.upsert", json!({"draw":draw(),"display":{}}))
        .await;
    let settings: serde_json::Value = serde_json::from_slice(
        &std::fs::read(h.directory.path().join("draw-settings.json")).unwrap(),
    )
    .unwrap();
    let entries = settings["draws"].as_array().unwrap();
    let saved = |id| {
        entries
            .iter()
            .find(|entry| entry["draw"]["draw_id"] == id)
            .unwrap()
    };
    assert_eq!(saved("simulated-draw")["display"], json!({}));
    assert_eq!(saved("second-draw")["display"], json!({"size":"L"}));
}

#[test]
fn malformed_envelope_does_not_fall_back_to_legacy_configuration() {
    for settings in [
        json!({"draws":[{"draw":draw(),"display":null}]}),
        json!({"draws":[{"draw":draw(),"display":{"size":"XL"}}]}),
        json!({"draws":[{"draw":draw()},{"draw":draw()}]}),
    ] {
        let directory = tempfile::tempdir().unwrap();
        std::fs::write(
            directory.path().join("draws.json"),
            json!([draw()]).to_string(),
        )
        .unwrap();
        std::fs::write(
            directory.path().join("draw-settings.json"),
            settings.to_string(),
        )
        .unwrap();
        let result = LotsModule::open(
            directory.path(),
            Arc::new(cc_core::EventHub::new(32).unwrap()),
            Arc::new(RecordedBeacon(std::sync::atomic::AtomicBool::new(false))),
            Arc::new(Clock(std::sync::Mutex::new(at()))),
            true,
        );
        assert!(result.is_err());
    }
}
