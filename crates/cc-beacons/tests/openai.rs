//! OpenAI image provider over a RECORDED transport: no network, no real key.
//! Responses are simulated envelopes around committed SIMULATED fixtures.
mod simulated_art;

use base64::Engine as _;
use cc_beacons::art::{
    ArtError, Charge, HttpResponse, KeyStore, OpenAiBackground, OpenAiCall, OpenAiClient,
    OpenAiImageRequest, OpenAiImages, OpenAiModel, OpenAiSize, OpenAiTransport, SecretKey,
};
use serde_json::{Value, json};
use std::sync::{Arc, Mutex};

const SIMULATED_KEY: &str = "simulated-openai-key-for-tests";

#[derive(Clone)]
struct Keys(Option<&'static str>);
impl KeyStore for Keys {
    fn load(&self, label: &str) -> Result<Option<SecretKey>, ArtError> {
        assert_eq!(label, "openai");
        self.0.map(|v| SecretKey::new(v.into())).transpose()
    }
    fn save(&self, _: &str, _: &SecretKey) -> Result<(), ArtError> {
        panic!("no key writes")
    }
    fn delete(&self, _: &str) -> Result<(), ArtError> {
        panic!("no key deletes")
    }
}

/// What the client handed to the transport, minus the credential.
#[derive(Debug, Clone, PartialEq)]
enum Sent {
    Generation(Value),
    Edit(Vec<(&'static str, String)>, usize, &'static str),
}

#[derive(Clone)]
struct Recorded {
    replies: Arc<Mutex<Vec<(u16, String)>>>,
    sent: Arc<Mutex<Vec<Sent>>>,
}
impl Recorded {
    fn new(replies: Vec<(u16, String)>) -> Self {
        Self {
            replies: Arc::new(Mutex::new(replies)),
            sent: Arc::default(),
        }
    }
    fn sent(&self) -> Vec<Sent> {
        self.sent.lock().unwrap().clone()
    }
}
#[async_trait::async_trait]
impl OpenAiTransport for Recorded {
    async fn send(&self, key: &SecretKey, call: OpenAiCall) -> Result<HttpResponse, ArtError> {
        assert_eq!(format!("{key:?}"), "[redacted]");
        self.sent.lock().unwrap().push(match call {
            OpenAiCall::Generation(body) => Sent::Generation(body),
            OpenAiCall::Edit {
                fields,
                image,
                mime,
            } => Sent::Edit(fields, image.len(), mime),
        });
        let (status, body) = self.replies.lock().unwrap().remove(0);
        Ok(HttpResponse { status, body })
    }
}

fn reply(png: &[u8]) -> String {
    json!({
        "created": 1_700_000_000, "background": "transparent", "output_format": "png",
        "data": [{"b64_json": base64::engine::general_purpose::STANDARD.encode(png)}],
        "usage": {"input_tokens": 50, "output_tokens": 1056, "total_tokens": 1106,
            "input_tokens_details": {"text_tokens": 50, "image_tokens": 0}}
    })
    .to_string()
}

fn request(width: u32, height: u32) -> OpenAiImageRequest {
    OpenAiImageRequest {
        prompt: "SIMULATED ornate vote bar housing with an empty dark track".into(),
        model: OpenAiModel::DEFAULT,
        size: OpenAiSize::Exact { width, height },
        background: OpenAiBackground::Transparent,
    }
}

fn client(transport: Recorded, key: Option<&'static str>) -> OpenAiClient<Recorded, Keys> {
    OpenAiClient::new(transport, Keys(key), "openai".into()).unwrap()
}

#[tokio::test]
async fn generation_posts_one_png_and_returns_an_estimated_micro_usd_receipt() {
    let png = simulated_art::generate("simulated-votebar.png");
    let transport = Recorded::new(vec![(200, reply(&png))]);
    let client = client(transport.clone(), Some(SIMULATED_KEY));
    assert!(client.available().unwrap());
    let image = client.generate(&request(768, 256)).await.unwrap();
    assert_eq!(image.png.unwrap(), png);
    assert_eq!(image.cost.model, "gpt-image-2-5-flare");
    assert_eq!(image.cost.charge, Charge::MicroUsd(31_930));
    assert_eq!(image.cost.call_id.len(), 26);
    assert_eq!(
        transport.sent(),
        [Sent::Generation(json!({
            "model":"gpt-image-2.5-flare",
            "prompt":"SIMULATED ornate vote bar housing with an empty dark track",
            "n":1, "size":"768x256", "background":"transparent", "output_format":"png"
        }))]
    );
}

#[tokio::test]
async fn edit_sends_the_reference_as_multipart_fields() {
    let reference = simulated_art::generate("simulated-beacon.png");
    let base = simulated_art::generate("simulated-beacon-base.png");
    let transport = Recorded::new(vec![(200, reply(&base))]);
    let client = client(transport.clone(), Some(SIMULATED_KEY));
    let mut edit = request(576, 768);
    edit.model = OpenAiModel::Sunburst;
    let image = client.edit(&edit, &reference).await.unwrap();
    assert_eq!(image.png.unwrap(), base);
    assert_eq!(image.cost.model, "gpt-image-2-5-sunburst");
    let Sent::Edit(fields, bytes, mime) = &transport.sent()[0] else {
        panic!("expected an edit call")
    };
    assert_eq!((*bytes, *mime), (reference.len(), "image/png"));
    assert_eq!(fields[0], ("model", "gpt-image-2.5-sunburst".into()));
    assert!(fields.contains(&("size", "576x768".into())));
    assert!(client.edit(&edit, b"simulated text").await.is_err());
}

#[tokio::test]
async fn refusals_happen_before_any_paid_call() {
    let transport = Recorded::new(Vec::new());
    let client = client(transport.clone(), None);
    assert!(!client.available().unwrap());
    assert_eq!(
        client.generate(&request(768, 256)).await.unwrap_err(),
        ArtError::Unavailable
    );
    let keyed = self::client(transport.clone(), Some(SIMULATED_KEY));
    // Not a multiple of 16, and wider than 3:1.
    for (w, h) in [(768, 248), (1536, 496)] {
        assert_eq!(
            keyed.generate(&request(w, h)).await.unwrap_err(),
            ArtError::Invalid
        );
    }
    let mut leaky = request(768, 256);
    leaky.prompt = format!("SIMULATED {SIMULATED_KEY}");
    assert_eq!(keyed.generate(&leaky).await.unwrap_err(), ArtError::Invalid);
    assert!(transport.sent().is_empty());
    assert_eq!(
        OpenAiModel::parse("gpt-image-2.5-flare"),
        Err(ArtError::Invalid)
    );
}

#[tokio::test]
async fn upstream_failures_are_closed_and_receipts_survive_a_bad_image() {
    let wrong_size = simulated_art::generate("simulated-frame.png");
    let missing_usage = json!({"data":[{"b64_json":"AAAA"}]}).to_string();
    let transport = Recorded::new(vec![
        (400, String::new()),
        (200, missing_usage),
        (200, reply(&wrong_size)),
        (200, reply(b"simulated not a png")),
    ]);
    let client = client(transport, Some(SIMULATED_KEY));
    let r = request(768, 256);
    assert_eq!(client.generate(&r).await.unwrap_err(), ArtError::Http(400));
    assert_eq!(client.generate(&r).await.unwrap_err(), ArtError::Response);
    for _ in 0..2 {
        let image = client.generate(&r).await.unwrap();
        assert_eq!(image.cost.charge, Charge::MicroUsd(31_930));
        assert_eq!(image.png.unwrap_err(), ArtError::Response);
    }
}
