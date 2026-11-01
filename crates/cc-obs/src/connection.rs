//! Reconnect state contains only an endpoint, a keychain label and a zeroized secret.
use crate::{Client, Config, Error, PasswordReader, PasswordStore};
use std::{fmt, net::IpAddr, sync::Arc};
use zeroize::Zeroizing;

struct MemoryPassword(Zeroizing<String>);
impl PasswordReader for MemoryPassword {
    fn read(&self, _label: &str) -> Result<Zeroizing<String>, Error> {
        Ok(self.0.clone())
    }
}

pub struct Connection {
    config: Config,
    host: String,
    password: Option<MemoryPassword>,
    store: Arc<dyn PasswordStore>,
    client: Option<Client>,
}
impl fmt::Debug for Connection {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Connection")
            .field("password", &"[REDACTED]")
            .field("connected", &self.client.is_some())
            .finish_non_exhaustive()
    }
}
impl Connection {
    pub fn new(config: Config, store: Arc<dyn PasswordStore>) -> Self {
        Self {
            config,
            host: "127.0.0.1".into(),
            password: None,
            store,
            client: None,
        }
    }

    /// Replace working state only after authentication, GetVersion and optional
    /// keychain storage succeed. Failed attempts never alter the previous target.
    pub async fn configure(
        &mut self,
        host: &str,
        port: u16,
        password: Zeroizing<String>,
        remember: bool,
    ) -> Result<(), Error> {
        let password = MemoryPassword(password);
        endpoint(host, port)?;
        let config = Config {
            port,
            password_label: self.config.password_label.clone(),
        };
        let mut client = Client::connect_at_with_reader(host, &config, &password).await?;
        client.get_version().await?;
        if remember {
            self.store.write(&config.password_label, &password.0)?;
        }
        self.host = host.to_ascii_lowercase();
        self.config = config;
        self.password = Some(password);
        self.client = Some(client);
        Ok(())
    }

    pub fn endpoint(&self) -> Result<String, Error> {
        endpoint(&self.host, self.config.port)
    }
    pub async fn client(&mut self) -> Result<&mut Client, Error> {
        if self.client.is_none() {
            let reader: &dyn PasswordReader = match &self.password {
                Some(password) => password,
                None => self.store.as_ref(),
            };
            self.client =
                Some(Client::connect_at_with_reader(&self.host, &self.config, reader).await?);
        }
        self.client.as_mut().ok_or(Error::Transport)
    }
    pub fn disconnect(&mut self) {
        self.client = None;
    }
}

pub(crate) fn endpoint(host: &str, port: u16) -> Result<String, Error> {
    if port == 0 {
        return Err(Error::Invalid);
    }
    let literal = host
        .strip_prefix('[')
        .and_then(|h| h.strip_suffix(']'))
        .unwrap_or(host);
    if let Ok(ip) = literal.parse::<IpAddr>() {
        let private = match ip {
            IpAddr::V4(ip) => ip.is_loopback() || ip.is_private() || ip.is_link_local(),
            IpAddr::V6(ip) => {
                ip.is_loopback()
                    || ip.is_unique_local()
                    || ip.is_unicast_link_local()
                    || ip
                        .to_ipv4_mapped()
                        .is_some_and(|v4| v4.is_loopback() || v4.is_private())
            }
        };
        if !private {
            return Err(Error::Invalid);
        }
        return Ok(match ip {
            IpAddr::V4(ip) => format!("ws://{ip}:{port}"),
            IpAddr::V6(ip) => format!("ws://[{ip}]:{port}"),
        });
    }
    // A DNS hostname has no authority syntax, path, userinfo, query or fragment.
    // Reject numeric pseudo-addresses rather than relying on resolver shorthand.
    let numeric = host.split('.').all(|label| {
        label.bytes().all(|b| b.is_ascii_digit())
            || label
                .strip_prefix("0x")
                .or_else(|| label.strip_prefix("0X"))
                .is_some_and(|hex| !hex.is_empty() && hex.bytes().all(|b| b.is_ascii_hexdigit()))
    });
    if host.len() > 253
        || numeric
        || !host.bytes().any(|b| b.is_ascii_alphabetic())
        || !host.split('.').all(|label| {
            !label.is_empty()
                && label.len() <= 63
                && !label.starts_with('-')
                && !label.ends_with('-')
                && label
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'-')
        })
    {
        return Err(Error::Invalid);
    }
    Ok(format!("ws://{}:{port}", host.to_ascii_lowercase()))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn endpoint_accepts_local_addresses_and_plain_hostnames_only() {
        for host in [
            "127.0.0.1",
            "10.0.1.2",
            "172.16.2.3",
            "192.168.1.2",
            "::1",
            "[::1]",
            "fd00::1",
            "fe80::1",
            "obs-studio",
            "obs.local",
        ] {
            assert!(endpoint(host, 4455).is_ok(), "{host}");
        }
        for host in [
            "",
            "0.0.0.0",
            "8.8.8.8",
            "224.0.0.1",
            "2001:4860::1",
            "::",
            "ws://localhost",
            "localhost/path",
            "localhost:4455",
            "user@localhost",
            "localhost?x",
            "localhost#x",
            " localhost",
            "localhost ",
            "127.1",
            "2130706433",
            "0x7f000001",
            "-obs",
            "obs..local",
        ] {
            assert_eq!(endpoint(host, 4455), Err(Error::Invalid), "{host}");
        }
        assert_eq!(endpoint("localhost", 0), Err(Error::Invalid));
        assert!(endpoint("localhost", 65535).is_ok());
    }
}
