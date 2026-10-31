//! Native built-ins: data and existing atlas bytes, never art-writable imports.
use crate::overlay::package::{VerifiedPackage, invalid};
use cc_types::{DesignId, DesignPackage, ErrorEnvelope};
use serde_json::json;
use std::collections::BTreeMap;

struct Preset {
    id: &'static str,
    asset: &'static str,
    bytes: &'static [u8],
    width: u32,
    height: u32,
    object: bool,
}

macro_rules! preset {
    ($style:literal, $kind:literal, $file:literal, $height:literal, $object:literal) => {
        Preset {
            id: concat!("preset-", $style, "-", $kind),
            asset: concat!("preset-", $style, "-", $file, ".webp"),
            bytes: include_bytes!(concat!(
                "../../../../apps/desktop/public/art/preset-",
                $style,
                "-",
                $file,
                ".webp"
            )),
            width: 640,
            height: $height,
            object: $object,
        }
    };
}

const PRESETS: &[Preset] = &[
    preset!("heraldic", "altar", "altar", 857, true),
    preset!("heraldic", "frame", "frame2", 357, false),
    preset!("pixel", "altar", "altar", 640, true),
    preset!("pixel", "frame", "frame2", 357, false),
    preset!("synthwave", "altar", "altar", 640, true),
    preset!("synthwave", "frame", "frame2", 357, false),
    preset!("watercolor", "altar", "altar", 640, true),
    preset!("watercolor", "frame", "frame2", 357, false),
    preset!("anime", "altar", "altar", 640, true),
    preset!("anime", "frame", "frame2", 357, false),
    preset!("glass", "altar", "altar", 640, true),
    preset!("glass", "frame", "frame2", 357, false),
];

pub(crate) fn embedded(id: &DesignId) -> Result<Option<VerifiedPackage>, ErrorEnvelope> {
    let Some(preset) = PRESETS.iter().find(|preset| preset.id == id.as_str()) else {
        return Ok(None);
    };
    let mut bindings = vec![json!({"property":"opacity", "output_range":{
        "at_zero":if preset.object { 0.35 } else { 0.25 }, "at_one":1.0
    }})];
    if preset.object {
        bindings.push(json!({"property":"scale", "output_range":{"at_zero":0.9,"at_one":1.05}}));
    }
    let package: DesignPackage = serde_json::from_value(json!({
        "design_id":preset.id, "content_hash":"0".repeat(64),
        "layers":[{"kind":"image", "asset":preset.asset,
            "properties":{"x":0.0,"y":0.0,"width":preset.width,"height":preset.height,
                "scale":1.0,"opacity":1.0}, "bindings":bindings}]
    }))
    .map_err(|_| invalid())?;
    VerifiedPackage::from_embedded(
        package,
        BTreeMap::from([(preset.asset.to_owned(), preset.bytes)]),
    )
    .map(Some)
}

#[cfg(test)]
mod tests {
    use super::*;
    use cc_beacons::art::{
        ArtError, HttpRequest, HttpResponse, HttpTransport, KeyStore, SecretKey,
    };
    use std::sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    };

    struct PresentKey;
    impl KeyStore for PresentKey {
        fn load(&self, _: &str) -> Result<Option<SecretKey>, ArtError> {
            Ok(Some(SecretKey::new("simulated-preset-test".into())?))
        }
        fn save(&self, _: &str, _: &SecretKey) -> Result<(), ArtError> {
            panic!("no key writes")
        }
        fn delete(&self, _: &str) -> Result<(), ArtError> {
            panic!("no key deletes")
        }
    }

    struct Recording(Arc<AtomicUsize>);
    #[async_trait::async_trait]
    impl HttpTransport for Recording {
        async fn send(&self, _: &SecretKey, _: HttpRequest) -> Result<HttpResponse, ArtError> {
            self.0.fetch_add(1, Ordering::SeqCst);
            Err(ArtError::Transport)
        }
    }

    #[test]
    fn beacons_presets_catalog_contains_exactly_twelve_unique_data_only_images() {
        let ids: std::collections::BTreeSet<_> = PRESETS.iter().map(|p| p.id).collect();
        assert_eq!(ids.len(), 12);
        for preset in PRESETS {
            let verified = embedded(&preset.id.to_owned().try_into().unwrap())
                .unwrap()
                .unwrap();
            assert_eq!(verified.assets.len(), 1);
            assert!(verified.package.privileges.is_none());
            assert_eq!(verified.package.layers.len(), 1);
        }
    }

    #[tokio::test]
    async fn beacons_presets_are_not_art_writable_and_make_zero_transport_calls() {
        use crate::{Module, NativeConfig, NativeServices, beacons::BeaconsModule};
        use cc_beacons::art::LeonardoClient;
        let directory = tempfile::tempdir().unwrap();
        let service = NativeServices::new(
            NativeConfig {
                twitch: Default::default(),
                obs: cc_obs::Config {
                    port: 0,
                    password_label: "simulated-unused".into(),
                },
                overlay_port: 0,
            },
            cc_store::Store::open(directory.path().join("native")).unwrap(),
            Arc::new(|_| panic!("no live login")),
        )
        .await
        .unwrap();
        let calls = Arc::new(AtomicUsize::new(0));
        let provider =
            LeonardoClient::new(Recording(calls.clone()), PresentKey, "simulated".into()).unwrap();
        struct RefuseDownload;
        #[async_trait::async_trait]
        impl super::super::ArtDownload for RefuseDownload {
            async fn fetch(&self, _: &str) -> Result<Vec<u8>, ErrorEnvelope> {
                panic!("no download")
            }
        }
        let module = BeaconsModule::open(directory.path().join("beacons"))
            .unwrap()
            .with_native(Some(Arc::downgrade(&service)))
            .unwrap()
            .with_art_provider(
                Arc::new(provider),
                Arc::new(RefuseDownload),
                service.art_catalog.clone(),
            );
        let design_id = "preset-glass-frame".to_owned().try_into().unwrap();
        service.ensure_beacons_preset(Some(&design_id)).unwrap();
        let request = cc_types::parse_request(
            &serde_json::to_vec(&json!({
                "method":"beacons.art.generate", "params":{
                    "design_id":design_id,"prompt":"Simulated preset rejection",
                    "model_id":"b24e16ff-06e3-43eb-8d33-4416c2d75876",
                    "width":512,"height":512,"quantity":1,"remove_background":false
                }
            }))
            .unwrap(),
        )
        .unwrap();
        assert_eq!(
            module.call(&request).await.unwrap_err().code,
            cc_types::ErrorCode::NotFound
        );
        assert_eq!(calls.load(Ordering::SeqCst), 0);
    }
}
