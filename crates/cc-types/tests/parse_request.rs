use cc_types::{Empty, ErrorCode, ErrorEnvelope, RpcRequest, parse_request};
use schemars::schema_for;
use serde_json::json;

fn assert_invalid(bytes: &[u8]) {
    assert_eq!(
        parse_request(bytes).unwrap_err(),
        ErrorEnvelope::new(ErrorCode::Invalid, "invalid RPC request")
    );
}

#[test]
fn params_require_an_object_for_every_method() {
    for method in RpcRequest::NAMES {
        for params in [json!([]), json!(null), json!("x"), json!(0), json!(false)] {
            let request = json!({"method": method, "params": params});
            assert_invalid(&serde_json::to_vec(&request).unwrap());
        }
    }
}

#[test]
fn positional_struct_params_are_rejected() {
    assert_invalid(br#"{"method":"gatehouse.delay.set","params":[2]}"#);
}

#[test]
fn valid_empty_and_struct_objects_still_parse() {
    assert_eq!(
        parse_request(br#"{"method":"status.get","params":{}}"#).unwrap(),
        RpcRequest::StatusGet(Empty {})
    );
    let request = json!({"method":"gatehouse.delay.set","params":{"delay_s":2}});
    let parsed = parse_request(&serde_json::to_vec(&request).unwrap()).unwrap();
    assert_eq!(serde_json::to_value(parsed).unwrap(), request);
}

#[test]
fn missing_empty_params_remain_invalid_as_required_by_the_schema() {
    assert_invalid(br#"{"method":"status.get"}"#);
    let schema = serde_json::to_value(schema_for!(RpcRequest)).unwrap();
    let status = schema["oneOf"]
        .as_array()
        .unwrap()
        .iter()
        .find(|variant| variant["properties"]["method"]["const"] == "status.get")
        .unwrap();
    assert!(
        status["required"]
            .as_array()
            .unwrap()
            .contains(&json!("params"))
    );
}

#[test]
fn unknown_methods_fields_and_duplicate_fields_remain_invalid() {
    for bytes in [
        br#"{"method":"unknown.method","params":{}}"#.as_slice(),
        br#"{"method":"status.get","params":{"extra":true}}"#,
        br#"{"method":"status.get","params":{},"extra":true}"#,
        br#"{"method":"status.get","method":"status.get","params":{}}"#,
        br#"{"method":"status.get","params":{},"params":{}}"#,
        br#"{"method":"gatehouse.delay.set","params":{"delay_s":2,"delay_s":4}}"#,
    ] {
        assert_invalid(bytes);
    }
}
