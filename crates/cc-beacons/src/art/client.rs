use super::{
    ArtError, BackgroundResult, Generation, GenerationState, HttpMethod, HttpRequest,
    HttpTransport, ImageAsset, ImageProvider, ImageRequest, KeyStore, KeychainStore, Provenance,
    ReqwestTransport, wire,
};
use async_trait::async_trait;
use serde_json::{Value, json};
use ulid::Ulid;
use zeroize::Zeroizing;

pub struct LeonardoClient<T = ReqwestTransport, S = KeychainStore> {
    transport: T,
    keys: S,
    key_label: String,
}

impl LeonardoClient {
    /// Does not read the keychain or send requests until explicitly used.
    pub fn from_keychain(key_label: String) -> Result<Self, ArtError> {
        Self::new(ReqwestTransport::new()?, KeychainStore, key_label)
    }
}

impl<T, S> LeonardoClient<T, S> {
    pub fn new(transport: T, keys: S, key_label: String) -> Result<Self, ArtError> {
        if key_label.trim().is_empty() {
            return Err(ArtError::Invalid);
        }
        Ok(Self {
            transport,
            keys,
            key_label,
        })
    }
}

impl<T: HttpTransport, S: KeyStore> LeonardoClient<T, S> {
    async fn execute(&self, request: HttpRequest) -> Result<Zeroizing<String>, ArtError> {
        // Reload for each use: deleting the key immediately disables subsequent calls.
        let key = self
            .keys
            .load(&self.key_label)?
            .ok_or(ArtError::Unavailable)?;
        if key.appears_in(&request.path)
            || request
                .body
                .as_ref()
                .is_some_and(|body| key.appears_in(&body.to_string()))
        {
            return Err(ArtError::Invalid);
        }
        let response = self.transport.send(&key, request).await?;
        let body = Zeroizing::new(response.body);
        if !(200..300).contains(&response.status) {
            return Err(ArtError::Http(response.status));
        }
        if body.len() > 2 * 1024 * 1024 || key.appears_in(&body) {
            return Err(ArtError::Response);
        }
        Ok(body)
    }

    async fn generate(
        &self,
        request: &ImageRequest,
        quantity: u8,
        anchor: Option<&str>,
    ) -> Result<Generation, ArtError> {
        wire::validate_request(request, quantity)?;
        let mut body = json!({
            "public": false, "prompt": request.prompt, "modelId": request.model_id,
            "width": request.width, "height": request.height, "num_images": quantity,
        });
        if let Some(image_id) = anchor {
            if !wire::valid_id(image_id) {
                return Err(ArtError::Invalid);
            }
            body["init_generation_image_id"] = json!(image_id);
            body["init_strength"] = json!(0.5);
        }
        let response = self.post("v1/generations", body).await?;
        wire::generation(&response, &request.model_id, Ulid::new().to_string())
    }

    async fn post(&self, path: &str, body: Value) -> Result<Zeroizing<String>, ArtError> {
        self.execute(HttpRequest {
            method: HttpMethod::Post,
            path: path.into(),
            body: Some(body),
        })
        .await
    }

    fn generated_id(image: &ImageAsset) -> Result<&str, ArtError> {
        if !image.generated || image.provenance != Provenance::LeonardoGenerated {
            return Err(ArtError::Invalid);
        }
        image
            .image_id
            .as_deref()
            .filter(|id| wire::valid_id(id))
            .ok_or(ArtError::Invalid)
    }
}

#[async_trait]
impl<T: HttpTransport, S: KeyStore> ImageProvider for LeonardoClient<T, S> {
    fn available(&self) -> Result<bool, ArtError> {
        Ok(self.keys.load(&self.key_label)?.is_some())
    }
    async fn generate_anchor(&self, request: &ImageRequest) -> Result<Generation, ArtError> {
        self.generate(request, 1, None).await
    }
    async fn generate_matching_set(
        &self,
        request: &ImageRequest,
        anchor: &ImageAsset,
        quantity: u8,
    ) -> Result<Generation, ArtError> {
        self.generate(request, quantity, Some(Self::generated_id(anchor)?))
            .await
    }
    async fn generation_state(&self, generation_id: &str) -> Result<GenerationState, ArtError> {
        if !wire::valid_id(generation_id) {
            return Err(ArtError::Invalid);
        }
        let response = self
            .execute(HttpRequest {
                method: HttpMethod::Get,
                path: format!("v1/generations/{generation_id}"),
                body: None,
            })
            .await?;
        wire::state(&response, generation_id)
    }
    async fn remove_background(&self, image: &ImageAsset) -> Result<BackgroundResult, ArtError> {
        let image_id = Self::generated_id(image)?;
        let response = self
            .post(
                "v2/generationssync",
                json!({
                    "model": "remove-bg", "public": false,
                    "parameters": { "format": "png", "guidances": {
                        "image_reference": [{ "image": { "id": image_id, "type": "GENERATED" } }]
                    } }
                }),
            )
            .await?;
        wire::background(&response, Ulid::new().to_string())
    }
}
