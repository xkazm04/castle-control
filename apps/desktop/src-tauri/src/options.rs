/// Public launch settings only. Credentials have no argument or file door here.
#[derive(Default)]
pub struct Options {
    pub native: Option<NativeOptions>,
    pub login: bool,
    /// Opt into the native Steward using persisted engine settings, without
    /// keychain access. Offline launches retain the unconfigured Steward.
    pub steward_live: bool,
}

pub struct NativeOptions {
    pub client_id: String,
    pub test_channel: String,
    pub obs_port: u16,
    pub obs_password_label: String,
}

impl Options {
    pub fn parse(args: impl IntoIterator<Item = String>) -> Result<Self, &'static str> {
        let mut args = args.into_iter();
        let mut values = std::collections::BTreeMap::new();
        let mut login = false;
        let mut steward_live = false;
        while let Some(key) = args.next() {
            if key == "--login" && !login {
                login = true;
                continue;
            }
            if key == "--steward-live" && !steward_live {
                steward_live = true;
                continue;
            }
            if ![
                "--client-id",
                "--test-channel",
                "--obs-port",
                "--obs-password-label",
            ]
            .contains(&key.as_str())
            {
                return Err("unknown or repeated desktop option");
            }
            let value = args.next().ok_or("desktop option requires a value")?;
            if value.starts_with("--") || values.insert(key, value).is_some() {
                return Err("invalid or repeated desktop option");
            }
        }
        if values.is_empty() && !login {
            return Ok(Self {
                steward_live,
                ..Self::default()
            });
        }
        let client_id = values
            .remove("--client-id")
            .filter(|v| {
                (1..=128).contains(&v.len()) && v.bytes().all(|b| b.is_ascii_alphanumeric())
            })
            .ok_or("a public --client-id is required with native options")?;
        let test_channel = values
            .remove("--test-channel")
            .filter(|v| {
                (1..=25).contains(&v.len())
                    && v.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_')
            })
            .ok_or("a valid owned --test-channel login is required")?
            .to_ascii_lowercase();
        let obs_port = values
            .remove("--obs-port")
            .unwrap_or_else(|| "4455".into())
            .parse::<u16>()
            .ok()
            .filter(|p| *p != 0)
            .ok_or("invalid OBS port")?;
        let obs_password_label = values
            .remove("--obs-password-label")
            .unwrap_or_else(|| "streamer".into());
        if obs_password_label.trim().is_empty() || obs_password_label.len() > 128 {
            return Err("invalid OBS keychain label");
        }
        Ok(Self {
            native: Some(NativeOptions {
                client_id,
                test_channel,
                obs_port,
                obs_password_label,
            }),
            login,
            steward_live,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::Options;

    fn parse(args: &[&str]) -> Result<Options, &'static str> {
        Options::parse(args.iter().map(|s| (*s).into()))
    }

    #[test]
    fn public_options_are_paired_and_strict_with_fixed_diagnostics() {
        assert!(parse(&[]).unwrap().native.is_none());
        let options = parse(&[
            "--client-id",
            "simulatedPublicId",
            "--test-channel",
            "SIMULATED_OWNER",
            "--login",
        ])
        .unwrap();
        assert!(options.login);
        let native = options.native.unwrap();
        assert_eq!(native.test_channel, "simulated_owner");
        assert_eq!(native.obs_port, 4455);
        for invalid in [
            vec!["--client-id", "simulated"],
            vec!["--test-channel", "simulated_owner"],
            vec!["--login"],
            vec!["--login", "--login"],
            vec!["--endpoint", "https://example.invalid"],
            vec!["--token", "simulated-value-never-echoed"],
            vec!["--client-id", "simulated", "--client-id", "duplicate"],
            vec![
                "--client-id",
                "simulated",
                "--test-channel",
                "https://example.invalid",
            ],
        ] {
            assert!(parse(&invalid).is_err());
        }
        let error = parse(&["--token", "simulated-value-never-echoed"])
            .err()
            .unwrap();
        assert!(!error.contains("simulated-value"));
    }

    #[test]
    fn steward_opt_in_is_public_off_by_default_and_refuses_duplicates() {
        assert!(!parse(&[]).unwrap().steward_live);
        let options = parse(&["--steward-live"]).unwrap();
        assert!(options.steward_live);
        assert!(options.native.is_none());
        assert!(!options.login);
        assert!(parse(&["--steward-live", "--steward-live"]).is_err());
        assert!(parse(&["--steward-live", "--unknown"]).is_err());
        assert!(parse(&["--steward-live", "true"]).is_err());
        let native = parse(&[
            "--client-id",
            "simulatedPublicId",
            "--steward-live",
            "--test-channel",
            "simulated_owner",
            "--login",
        ])
        .unwrap();
        assert!(native.steward_live && native.login && native.native.is_some());
    }
}
