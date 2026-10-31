//! All credentials and backend failures are simulated; never use the OS store.
use super::keychain::{Backend, Secret, Vault};
use cc_engine::{Failure, Keychain};
use cc_types::ErrorCode;
use std::{
    collections::HashMap,
    io::Write,
    sync::{Arc, Mutex},
};

fn sentinel() -> String {
    ["simulated", "steward", "sentinel", "never-output"].join("-")
}

#[derive(Default)]
struct Memory {
    entries: HashMap<(String, String), String>,
    requests: Mutex<Vec<(String, String)>>,
    fail: bool,
}

impl Backend for Arc<Memory> {
    fn read(&self, service: &str, account: &str) -> keyring::Result<Option<Secret>> {
        self.requests
            .lock()
            .unwrap()
            .push((service.into(), account.into()));
        if self.fail {
            // Exercise an OS error whose raw Display/Debug would leak a secret.
            return Err(keyring::Error::PlatformFailure(Box::new(
                std::io::Error::other(sentinel()),
            )));
        }
        Ok(self
            .entries
            .get(&(service.into(), account.into()))
            .cloned()
            .map(Secret::new))
    }
}

#[test]
fn stored_openai_api_key_loads_from_its_account_and_stays_redacted() {
    // Generated simulated API-key shape; never a live key or network request.
    let value = ["sk", "proj", "simulated", "openai", "key", "never-output"].join("-");
    let mut memory = Memory::default();
    memory
        .entries
        .insert(("castle-control".into(), "openai".into()), value.clone());
    let memory = Arc::new(memory);
    let vault = Vault::new(memory.clone());
    let secret = vault.read_secret("openai").unwrap();
    assert!(format!("{secret:?}") == "[redacted]");
    assert!(format!("{secret}") == "[redacted]");
    assert!(vault.load("openai").unwrap() == value);
    assert_eq!(
        *memory.requests.lock().unwrap(),
        vec![("castle-control".into(), "openai".into()); 2]
    );
}

#[test]
fn providers_request_the_shared_service_and_the_provider_account() {
    let accounts = ["openai", "anthropic", "leonardo"];
    let memory = Arc::new(Memory {
        entries: accounts
            .map(|account| (("castle-control".into(), account.into()), sentinel()))
            .into(),
        ..Default::default()
    });
    let vault = Vault::new(memory.clone());
    for account in accounts {
        let loaded = vault.load(account);
        // Boolean assertions never print the plaintext even on failure.
        assert!(loaded.is_ok());
        assert!(loaded.unwrap() == sentinel());
    }
    assert_eq!(
        *memory.requests.lock().unwrap(),
        accounts.map(|account| ("castle-control".into(), account.into()))
    );
}

#[test]
fn missing_empty_and_locked_entries_are_unavailable_naming_only_the_account() {
    for memory in [
        Memory::default(),
        Memory {
            entries: [(("castle-control".into(), "openai".into()), String::new())].into(),
            ..Default::default()
        },
        Memory {
            fail: true,
            ..Default::default()
        },
    ] {
        let vault = Vault::new(Arc::new(memory));
        let error = vault.read_secret("openai").unwrap_err();
        assert_eq!(error.code, ErrorCode::Unavailable);
        assert!(error.message == "Steward keychain unavailable: openai");
        assert!(error.detail.is_none());
        assert!(error.retry_after_ms.is_none());
        assert!(matches!(vault.load("openai"), Err(Failure::Unavailable)));
    }
}

#[derive(Clone, Default)]
struct Captured(Arc<Mutex<Vec<u8>>>);
impl Write for Captured {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        self.0.lock().unwrap().extend_from_slice(bytes);
        Ok(bytes.len())
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

#[test]
fn sentinel_is_redacted_in_formatting_all_errors_and_trace_output() {
    let captured = Captured::default();
    let writer = captured.clone();
    let subscriber = tracing_subscriber::fmt()
        .with_max_level(tracing::Level::TRACE)
        .without_time()
        .with_ansi(false)
        .with_writer(move || writer.clone())
        .finish();
    let _guard = tracing::subscriber::set_default(subscriber);
    let vault = Vault::new(Arc::new(Memory {
        entries: [(("castle-control".into(), "openai".into()), sentinel())].into(),
        ..Default::default()
    }));
    let secret = vault.read_secret("openai").unwrap();
    assert!(format!("{secret:?}") == "[redacted]");
    assert!(format!("{secret}") == "[redacted]");
    tracing::trace!(?secret, display = %secret, "simulated vault trace");
    for memory in [
        Memory::default(),
        Memory {
            entries: [(("castle-control".into(), "openai".into()), String::new())].into(),
            ..Default::default()
        },
        Memory {
            fail: true,
            ..Default::default()
        },
    ] {
        let vault = Vault::new(Arc::new(memory));
        for account in ["openai", "anthropic", "leonardo", "invalid\naccount"] {
            let error = vault.read_secret(account).unwrap_err();
            let encoded = serde_json::to_string(&error).unwrap();
            assert!(!encoded.contains(&sentinel()));
            assert!(!format!("{error:?}").contains(&sentinel()));
            tracing::trace!(?error, error_json = %encoded, "simulated vault error");
            let failure = vault.load(account).unwrap_err();
            assert!(!format!("{failure:?} {failure}").contains(&sentinel()));
            tracing::trace!(?failure, display = %failure, "simulated engine error");
        }
    }
    let output = String::from_utf8(captured.0.lock().unwrap().clone()).unwrap();
    assert!(
        output.contains("simulated vault trace"),
        "capture must be active"
    );
    assert!(output.contains("simulated vault error"));
    assert!(output.contains("[redacted]"));
    assert!(!output.contains(&sentinel()), "simulated credential leaked");
}
