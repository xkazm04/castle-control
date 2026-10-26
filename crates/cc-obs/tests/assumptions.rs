//! FIXTURE tests: all OBS data and credentials are simulated, never owner data.
mod simulated;
use cc_obs::{Client, Error, PasswordReader};
use serde_json::json;
use simulated::*;
use tokio::net::TcpListener;
use tokio_tungstenite::accept_async;
use zeroize::Zeroizing;

struct NoKeychain;
impl PasswordReader for NoKeychain {
    fn read(&self, _: &str) -> Result<Zeroizing<String>, Error> {
        panic!("simulated no-auth Hello must not read the keychain")
    }
}

#[tokio::test]
async fn simulated_handshake_rpc_versions() {
    for (hello_op, offered, identified_op, negotiated, accepted) in [
        (0, 1, 2, 1, true),
        (0, 5, 2, 1, true),
        (1, 1, 2, 1, false),
        (0, 0, 2, 1, false),
        (0, 1, 1, 1, false),
        (0, 1, 2, 2, false),
    ] {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let config = cc_obs::Config {
            port: listener.local_addr().unwrap().port(),
            password_label: "simulated-unused".into(),
        };
        let task = tokio::spawn(async move {
            let mut socket = accept_async(listener.accept().await.unwrap().0)
                .await
                .unwrap();
            send(
                &mut socket,
                json!({"op":hello_op,"d":{"rpcVersion":offered}}),
            )
            .await;
            if hello_op == 0 && offered >= 1 {
                let identify = frame(&mut socket).await;
                assert_eq!(
                    identify,
                    json!({"op":1,"d":{"rpcVersion":1,"eventSubscriptions":0}})
                );
                send(
                    &mut socket,
                    json!({"op":identified_op,"d":{"negotiatedRpcVersion":negotiated}}),
                )
                .await;
            }
        });
        let result = Client::connect_with_reader(&config, &NoKeychain).await;
        assert_eq!(result.is_ok(), accepted);
        if !accepted {
            assert!(matches!(result, Err(Error::Protocol)));
        }
        task.await.unwrap();
    }
}

#[tokio::test]
async fn simulated_auth_vector() {
    let (config, task) = peer().await;
    // peer checks the independent SHA256/base64 vector and exact account label.
    let _client = Client::connect_with_reader(&config, &SimulatedKeychain)
        .await
        .unwrap();
    let _socket = task.await.unwrap();
}

#[tokio::test]
async fn simulated_scene_is_caller_supplied() {
    let (config, peer) = peer().await;
    let mut client = Client::connect_with_reader(&config, &SimulatedKeychain)
        .await
        .unwrap();
    let task = tokio::spawn(async move {
        let mut socket = peer.await.unwrap();
        for scene in ["Scene", "simulated-alternative-scene"] {
            let request = frame(&mut socket).await;
            assert_eq!(request["d"]["requestData"]["sceneName"], scene);
            send(&mut socket, response(&request, json!({"sceneItemId":1}))).await;
        }
    });
    for scene in ["Scene", "simulated-alternative-scene"] {
        let mut source = source();
        source.scene_name = scene.into();
        client.create_browser_source(&source).await.unwrap();
    }
    task.await.unwrap();
}

#[tokio::test]
async fn simulated_status_codes() {
    let (config, peer) = peer().await;
    let mut client = Client::connect_with_reader(&config, &SimulatedKeychain)
        .await
        .unwrap();
    let statuses = [(true, 100), (false, 100), (false, 600), (true, 500)];
    let task = tokio::spawn(async move {
        let mut socket = peer.await.unwrap();
        for (result, code) in statuses {
            let request = frame(&mut socket).await;
            let mut reply = response(&request, json!({}));
            reply["d"]["requestStatus"] = json!({"result":result,"code":code});
            send(&mut socket, reply).await;
        }
    });
    for (result, code) in statuses {
        assert_eq!(
            client.create_browser_source(&source()).await,
            if result && code == 100 {
                Ok(())
            } else {
                Err(Error::Rejected)
            }
        );
    }
    task.await.unwrap();
}

#[tokio::test]
async fn simulated_reconnect_is_explicit() {
    let (config, peer) = peer().await;
    let mut client = Client::connect_with_reader(&config, &SimulatedKeychain)
        .await
        .unwrap();
    let mut socket = peer.await.unwrap();
    socket.close(None).await.unwrap();
    assert!(matches!(client.get_version().await, Err(Error::Transport)));
    // No retry/replay occurs: a new connection and handshake are the caller's job.
    let (config, peer) = simulated::peer().await;
    let _fresh = Client::connect_with_reader(&config, &SimulatedKeychain)
        .await
        .unwrap();
    let _socket = peer.await.unwrap();
}
