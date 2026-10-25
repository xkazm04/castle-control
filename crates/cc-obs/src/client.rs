use crate::protocol::{Frame, Hello, Response, authentication};
use crate::{BrowserSource, Error, Version};
use futures::{SinkExt, StreamExt};
use serde_json::{Value, json};
use std::time::Duration;
use tokio::net::TcpStream;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream, tungstenite::Message};
use zeroize::Zeroizing;

#[derive(Debug, Clone)]
pub struct Config {
    pub port: u16,
    /// Account label within the castlecontrol-obs keychain service.
    pub password_label: String,
}
pub trait PasswordReader: Send + Sync {
    fn read(&self, label: &str) -> Result<Zeroizing<String>, Error>;
}
struct Keychain;
impl PasswordReader for Keychain {
    fn read(&self, label: &str) -> Result<Zeroizing<String>, Error> {
        keyring::Entry::new("castlecontrol-obs", label)
            .map_err(|_| Error::Keychain)?
            .get_password()
            .map(Zeroizing::new)
            .map_err(|_| Error::Keychain)
    }
}
type Socket = WebSocketStream<MaybeTlsStream<TcpStream>>;
pub struct Client {
    socket: Socket,
    sequence: u64,
}
const BUDGET: Duration = Duration::from_secs(5);

impl Client {
    pub async fn connect(config: &Config) -> Result<Self, Error> {
        Self::connect_with_reader(config, &Keychain).await
    }
    /// Injectable keychain door for simulated protocol tests; no secret is retained.
    pub async fn connect_with_reader(
        config: &Config,
        reader: &dyn PasswordReader,
    ) -> Result<Self, Error> {
        if config.port == 0 || config.password_label.trim().is_empty() {
            return Err(Error::Invalid);
        }
        tokio::time::timeout(BUDGET, async {
            let (socket, _) =
                tokio_tungstenite::connect_async(format!("ws://127.0.0.1:{}", config.port))
                    .await
                    .map_err(|_| Error::Transport)?;
            let mut client = Self {
                socket,
                sequence: 0,
            };
            let hello = client.receive().await?;
            if hello.op != 0 {
                return Err(Error::Protocol);
            }
            let hello: Hello = serde_json::from_value(hello.d).map_err(|_| Error::Protocol)?;
            if hello.rpc_version < 1 {
                return Err(Error::Protocol);
            }
            let mut identify = json!({"op": 1, "d": {"rpcVersion": 1, "eventSubscriptions": 0}});
            if let Some(challenge) = hello.authentication {
                let password = reader.read(&config.password_label)?;
                identify["d"]["authentication"] = json!(&*authentication(&password, &challenge));
            }
            client.send(identify).await?;
            let identified = client.receive().await?;
            if identified.op != 2
                || identified
                    .d
                    .get("negotiatedRpcVersion")
                    .and_then(Value::as_u64)
                    != Some(1)
            {
                return Err(Error::Protocol);
            }
            Ok(client)
        })
        .await
        .map_err(|_| Error::Timeout)?
    }
    pub async fn get_version(&mut self) -> Result<Version, Error> {
        let value = self.request("GetVersion", json!({})).await?;
        let version: Version = serde_json::from_value(value).map_err(|_| Error::Protocol)?;
        if version.rpc_version != 1 {
            return Err(Error::Protocol);
        }
        Ok(version)
    }
    pub async fn create_browser_source(&mut self, source: &BrowserSource) -> Result<(), Error> {
        self.request("CreateInput", source.request()?).await?;
        Ok(())
    }
    async fn request(&mut self, kind: &str, data: Value) -> Result<Value, Error> {
        // Exclusive &mut access serializes requests; both ID and type must correlate.
        self.sequence = self.sequence.checked_add(1).ok_or(Error::Protocol)?;
        let id = format!("cc-{}", self.sequence);
        tokio::time::timeout(BUDGET, async {
            self.send(
                json!({"op": 6, "d": {"requestType": kind, "requestId": id, "requestData": data}}),
            )
            .await?;
            loop {
                let frame = self.receive().await?;
                if frame.op == 5 {
                    continue;
                }
                if frame.op != 7 {
                    return Err(Error::Protocol);
                }
                let response: Response =
                    serde_json::from_value(frame.d).map_err(|_| Error::Protocol)?;
                if response.request_id != id {
                    continue;
                }
                if response.request_type != kind {
                    return Err(Error::Protocol);
                }
                if !response.request_status.result || response.request_status.code != 100 {
                    return Err(Error::Rejected);
                }
                return Ok(response.response_data);
            }
        })
        .await
        .map_err(|_| Error::Timeout)?
    }
    async fn send(&mut self, frame: Value) -> Result<(), Error> {
        let text = serde_json::to_string(&frame).map_err(|_| Error::Protocol)?;
        self.socket
            .send(Message::Text(text.into()))
            .await
            .map_err(|_| Error::Transport)
    }
    async fn receive(&mut self) -> Result<Frame, Error> {
        loop {
            match self.socket.next().await {
                Some(Ok(Message::Text(text))) => {
                    return serde_json::from_str(&text).map_err(|_| Error::Protocol);
                }
                Some(Ok(Message::Ping(_))) => {
                    self.socket.flush().await.map_err(|_| Error::Transport)?
                }
                Some(Ok(Message::Pong(_))) => {}
                _ => return Err(Error::Transport),
            }
        }
    }
}
