use async_trait::async_trait;
use cc_beacons::art::{
    ArtError, HttpRequest, HttpResponse, HttpTransport, ImageAsset, ImageRequest, KeyStore,
    Provenance, SecretKey,
};
use serde_json::Value;
use std::{
    collections::VecDeque,
    io::Write,
    sync::{Arc, Mutex},
};

pub const SENTINEL: &str = "simulated-leonardo-sentinel-only";

#[derive(Clone, Default)]
pub struct MemoryStore(Arc<Mutex<Option<SecretKey>>>);
impl MemoryStore {
    pub fn present() -> Self {
        Self(Arc::new(Mutex::new(Some(
            SecretKey::new(SENTINEL.into()).unwrap(),
        ))))
    }
}
impl KeyStore for MemoryStore {
    fn load(&self, _: &str) -> Result<Option<SecretKey>, ArtError> {
        Ok(self.0.lock().unwrap().clone())
    }
    fn save(&self, _: &str, key: &SecretKey) -> Result<(), ArtError> {
        *self.0.lock().unwrap() = Some(key.clone());
        Ok(())
    }
    fn delete(&self, _: &str) -> Result<(), ArtError> {
        *self.0.lock().unwrap() = None;
        Ok(())
    }
}

#[derive(Clone, Default)]
pub struct Recording {
    steps: Arc<Mutex<VecDeque<Value>>>,
    requests: Arc<Mutex<Vec<HttpRequest>>>,
}
impl Recording {
    pub fn empty() -> Self {
        Self::default()
    }
    pub fn flow() -> Self {
        Self::from_json(include_str!("../fixtures/leonardo/flow.json"))
    }
    // These fixture variants are used by cc-core's tests, a separate test crate.
    #[allow(dead_code)]
    pub fn generation_output(status: &str) -> Self {
        let mut steps: Vec<Value> =
            serde_json::from_str(include_str!("../fixtures/leonardo/flow.json")).unwrap();
        let mut poll = steps[2].clone();
        poll["response"]["generations_by_pk"]["status"] = serde_json::json!(status);
        poll["response"]["generations_by_pk"]["generated_images"] = serde_json::json!([]);
        steps.truncate(1);
        steps.push(poll);
        Self::from_json(&serde_json::to_string(&steps).unwrap())
    }
    /// The recorded anchor/set flow, then one sync removal per set image.
    #[allow(dead_code)]
    pub fn background_flow(credits: bool, fail_at: Option<usize>, withheld: bool) -> Self {
        let mut steps: Vec<Value> =
            serde_json::from_str(include_str!("../fixtures/leonardo/flow.json")).unwrap();
        let removal = steps.pop().unwrap();
        let images = steps[4]["response"]["generations_by_pk"]["generated_images"]
            .as_array()
            .unwrap()
            .clone();
        for (index, image) in images.iter().enumerate() {
            let mut step = removal.clone();
            step["request"]["body"]["parameters"]["guidances"]["image_reference"][0]["image"]["id"] =
                image["id"].clone();
            if credits {
                step["response"]["cost"] = serde_json::json!({"amount":"1.2500", "unit":"CREDITS"});
            }
            if withheld {
                step["response"]["results"] = serde_json::json!([]);
            }
            if fail_at == Some(index) {
                step["status"] = serde_json::json!(429);
                step["response"] = serde_json::json!({"error":SENTINEL});
            }
            steps.push(step);
            if fail_at == Some(index) {
                break;
            }
        }
        Self::from_json(&serde_json::to_string(&steps).unwrap())
    }
    pub fn error_fixture() -> Self {
        Self::from_json(include_str!("../fixtures/leonardo/http-error.json"))
    }
    fn from_json(json: &str) -> Self {
        Self {
            steps: Arc::new(Mutex::new(serde_json::from_str(json).unwrap())),
            ..Self::default()
        }
    }
    pub fn response(status: u16, body: Value) -> Self {
        Self::from_json(&serde_json::json!([{ "status": status, "response": body }]).to_string())
    }
    pub fn sent(&self) -> Vec<HttpRequest> {
        self.requests.lock().unwrap().clone()
    }
    pub fn assert_finished(&self) {
        assert!(self.steps.lock().unwrap().is_empty());
    }
}
#[async_trait]
impl HttpTransport for Recording {
    async fn send(&self, key: &SecretKey, request: HttpRequest) -> Result<HttpResponse, ArtError> {
        tracing::trace!(?key, "simulated transport request");
        self.requests.lock().unwrap().push(request.clone());
        let step = self
            .steps
            .lock()
            .unwrap()
            .pop_front()
            .expect("unexpected request; no network fallback");
        if let Some(expected) = step.get("request") {
            assert_eq!(expected["path"].as_str().unwrap(), request.path);
            assert_eq!(
                expected["method"].as_str().unwrap(),
                format!("{:?}", request.method)
            );
            assert_eq!(expected.get("body"), request.body.as_ref());
        }
        Ok(HttpResponse {
            status: step["status"].as_u64().unwrap().try_into().unwrap(),
            body: step["response"].to_string(),
        })
    }
}

pub fn image_request() -> ImageRequest {
    ImageRequest {
        prompt: "Simulated gold beacon on a flat background".into(),
        model_id: "b24e16ff-06e3-43eb-8d33-4416c2d75876".into(),
        width: 512,
        height: 512,
    }
}
pub fn anchor() -> ImageAsset {
    ImageAsset {
        image_id: Some("00000000-0000-4000-8000-000000000002".into()),
        url: "https://cdn.example.invalid/simulated-anchor.png".into(),
        generated: true,
        provenance: Provenance::LeonardoGenerated,
    }
}

#[derive(Clone, Default)]
pub struct TraceBuffer(Arc<Mutex<Vec<u8>>>);
impl TraceBuffer {
    pub fn text(&self) -> String {
        String::from_utf8(self.0.lock().unwrap().clone()).unwrap()
    }
}
impl Write for TraceBuffer {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        self.0.lock().unwrap().extend_from_slice(bytes);
        Ok(bytes.len())
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}
impl<'a> tracing_subscriber::fmt::MakeWriter<'a> for TraceBuffer {
    type Writer = Self;
    fn make_writer(&'a self) -> Self::Writer {
        self.clone()
    }
}
