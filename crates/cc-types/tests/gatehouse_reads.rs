use cc_types::{ErrorCode, parse_request};
use serde_json::{Value, json};

fn request(method: &str, params: Value) -> Result<cc_types::RpcRequest, cc_types::ErrorEnvelope> {
    parse_request(&serde_json::to_vec(&json!({"method":method,"params":params})).unwrap())
}

#[test]
fn bounded_reads_refuse_invalid_limits_cursors_and_extra_fields() {
    for method in ["gatehouse.chat.list", "gatehouse.history.list"] {
        for valid in [
            json!({"limit":1}),
            json!({"cursor":"history:100","limit":100}),
        ] {
            let parsed = request(method, valid.clone()).unwrap();
            assert_eq!(serde_json::to_value(parsed).unwrap()["params"], valid);
        }
        for invalid in [
            json!({}),
            json!({"limit":0}),
            json!({"limit":101}),
            json!({"limit":1.5}),
            json!({"limit":1,"cursor":null}),
            json!({"limit":1,"cursor":"history:01"}),
            json!({"limit":1,"cursor":"chat:10000000000000000"}),
            json!({"limit":1,"cursor":"history:1\n"}),
            json!({"limit":1,"unexpected":true}),
        ] {
            assert_eq!(
                request(method, invalid).unwrap_err().code,
                ErrorCode::Invalid
            );
        }
    }
}

#[test]
fn both_provenances_and_bounded_pages_round_trip_and_absence_omits_keys() {
    let fixture: Value =
        serde_json::from_str(include_str!("fixtures/gatehouse_reads.json")).unwrap();
    for method in ["gatehouse.chat.list", "gatehouse.history.list"] {
        let parsed = request(method, json!({"limit":100})).unwrap();
        for provenance in ["live", "simulated"] {
            let mut item = json!({"decision":fixture["decision"],"provenance":provenance});
            if method == "gatehouse.chat.list" {
                item["message"] = fixture["message"].clone();
            } else {
                item["recorded_at"] = json!("2026-10-28T12:00:01Z");
            }
            let page = json!({"items":[item.clone()],"unavailable_count":0});
            assert_eq!(parsed.validate_result(page.clone()).unwrap(), page);
            let bounded = json!({"items":vec![item.clone();100],"unavailable_count":0,"next_cursor":"history:100"});
            assert_eq!(parsed.validate_result(bounded.clone()).unwrap(), bounded);
            for invalid in [
                json!({"items":vec![item.clone();101],"unavailable_count":0}),
                json!({"items":[item.clone()],"unavailable_count":0,"next_cursor":null}),
                json!({"items":[item.clone()],"unavailable_count":0,"extra":true}),
            ] {
                assert!(parsed.validate_result(invalid).is_err());
            }
            item["provenance"] = json!("unknown");
            assert!(
                parsed
                    .validate_result(json!({"items":[item],"unavailable_count":0}))
                    .is_err()
            );
        }
        let empty = json!({"items":[],"unavailable_count":0});
        assert_eq!(parsed.validate_result(empty.clone()).unwrap(), empty);
    }
}
