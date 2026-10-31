use cc_types::*;
use serde_json::{Value, json};

fn fixtures() -> Value {
    serde_json::from_str(include_str!("fixtures/display_images.json")).unwrap()
}
fn request(method: &Value, params: &Value) -> Result<RpcRequest, ErrorEnvelope> {
    parse_request(&serde_json::to_vec(&json!({"method": method, "params": params})).unwrap())
}

#[test]
fn old_payloads_and_every_shared_display_value_round_trip() {
    let f = fixtures();
    for payload in f["payloads"].as_array().unwrap() {
        let method = &payload["method"];
        let params = &payload["params"];
        let parsed = request(method, params).unwrap();
        assert_eq!(serde_json::to_value(parsed).unwrap(), *payload);
        for display in f["valid_displays"].as_array().unwrap() {
            let mut params = params.clone();
            params["display"] = display.clone();
            let parsed = request(method, &params).unwrap();
            assert_eq!(serde_json::to_value(parsed).unwrap()["params"], params);
        }
    }
    assert!(DisplayTimingMs::try_from(1).is_ok());
    assert!(DisplayTimingMs::try_from(60_000).is_ok());
    for value in [0, 60_001, u32::MAX] {
        assert!(DisplayTimingMs::try_from(value).is_err());
    }
}

#[test]
fn shared_bounds_unknowns_and_present_null_are_refused_in_all_four_rooms() {
    let f = fixtures();
    for payload in f["payloads"].as_array().unwrap() {
        for display in f["invalid_displays"].as_array().unwrap() {
            let mut params = payload["params"].clone();
            params["display"] = display.clone();
            assert!(
                request(&payload["method"], &params).is_err(),
                "accepted {params}"
            );
        }
        let mut params = payload["params"].clone();
        params["extra"] = json!(true);
        assert!(request(&payload["method"], &params).is_err());
    }
}

#[test]
fn steward_proposals_reuse_the_same_additive_display_contract() {
    let f = fixtures();
    for payload in f["payloads"].as_array().unwrap().iter().take(3) {
        for display in f["valid_displays"].as_array().unwrap() {
            let mut after = payload["params"].clone();
            after["display"] = display.clone();
            let proposal =
                json!({"method":payload["method"],"diff":{"before":after,"after":after}});
            assert!(serde_json::from_value::<WritProposal>(proposal).is_ok());
        }
        for display in f["invalid_displays"].as_array().unwrap() {
            let mut after = payload["params"].clone();
            after["display"] = display.clone();
            assert!(
                serde_json::from_value::<WritProposal>(json!({
                    "method":payload["method"],"diff":{"after":after}
                }))
                .is_err()
            );
        }
    }
}

#[test]
fn sniffed_content_and_local_references_have_strict_upload_doors() {
    let f = fixtures();
    for content in f["valid_images"].as_array().unwrap() {
        let params = json!({"content":content});
        let parsed = request(&json!("lots.image.upload"), &params).unwrap();
        assert_eq!(serde_json::to_value(parsed).unwrap()["params"], params);
    }
    for content in f["invalid_images"].as_array().unwrap() {
        assert!(request(&json!("lots.image.upload"), &json!({"content":content})).is_err());
    }
    for params in [
        json!({}),
        json!({"content":"ffd8ff","mime_type":"image/png"}),
    ] {
        assert!(request(&json!("lots.image.upload"), &params).is_err());
    }
    for image in [
        json!("a".repeat(64)),
        Value::Null,
        json!("../image.png"),
        json!("https://example.invalid/image.png"),
        json!(7),
        json!("a".repeat(63)),
        json!("A".repeat(64)),
        json!(format!("{}\n", "a".repeat(64))),
    ] {
        let valid = image == json!("a".repeat(64));
        let mut params = f["payloads"][0]["params"].clone();
        params["draw"]["image"] = image.clone();
        assert_eq!(request(&json!("lots.draw.upsert"), &params).is_ok(), valid);
        assert_eq!(
            serde_json::from_value::<ImageUploadResult>(json!({"image":image})).is_ok(),
            valid
        );
    }
}

#[test]
fn byte_cap_matches_hex_cap_and_direct_try_from_cannot_bypass_sniffing() {
    let mut bytes = vec![0; LOCAL_IMAGE_MAX_BYTES];
    bytes[..3].copy_from_slice(&[0xff, 0xd8, 0xff]);
    let content = LocalImageContent::try_from(bytes.clone()).unwrap();
    assert_eq!(content.as_bytes(), bytes);
    let hex = String::from(content);
    assert_eq!(hex.len(), 4_194_304);
    assert!(LocalImageContent::try_from(hex.clone()).is_ok());
    assert!(LocalImageContent::try_from(format!("{hex}00")).is_err());
    bytes.push(0);
    assert!(LocalImageContent::try_from(bytes).is_err());
    assert!(LocalImageContent::try_from(b"simulated text".to_vec()).is_err());
}
