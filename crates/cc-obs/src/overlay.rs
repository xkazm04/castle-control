use crate::Error;
use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode, header},
    middleware::{self, Next},
    response::{Html, IntoResponse, Response},
    routing::get,
};
use tokio::{net::TcpListener, sync::watch, task::JoinHandle};

/// Separate read-only origin. No RPC, credentials, scripts or remote resources.
pub struct Overlay {
    port: u16,
    stop: watch::Sender<bool>,
    task: JoinHandle<std::io::Result<()>>,
}
impl Overlay {
    pub async fn start(port: u16) -> Result<Self, Error> {
        let listener = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, port))
            .await
            .map_err(|_| Error::Transport)?;
        let port = listener.local_addr().map_err(|_| Error::Transport)?.port();
        let (stop, mut stopped) = watch::channel(false);
        let app = Router::new()
            .route(
                "/",
                get(|| async {
                    Html(concat!(
                        "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">",
                        "<title>Castle Control spike</title>",
                        "<style>html, body { background: transparent; margin: 0; }",
                        ".spike-plate { display: inline-block; margin: 16px; padding: 16px 24px; ",
                        "border-radius: 12px; color: #fff; background: rgba(0, 0, 0, 0.6); ",
                        "text-shadow: 0 1px 3px #000; ",
                        "font: 20px/1.4 system-ui, 'Segoe UI', sans-serif; }",
                        ".spike-plate h1 { margin: 0; font-size: 32px; }",
                        ".spike-plate p { margin: 8px 0 0; }</style>",
                        "</head><body><main class=\"spike-plate\"><h1>Castle Control</h1>",
                        "<p>WP 0.7 OBS connection test. Static test page.</p></main></body></html>"
                    ))
                }),
            )
            .layer(middleware::from_fn(move |request, next| {
                secure(request, next, port)
            }));
        let task = tokio::spawn(async move {
            axum::serve(listener, app)
                .with_graceful_shutdown(async move {
                    let _ = stopped.changed().await;
                })
                .await
        });
        Ok(Self { port, stop, task })
    }
    pub fn url(&self) -> String {
        format!("http://localhost:{}/", self.port)
    }
}
impl Drop for Overlay {
    fn drop(&mut self) {
        self.stop.send_replace(true);
        self.task.abort();
    }
}
async fn secure(request: Request<Body>, next: Next, port: u16) -> Response {
    let expected = format!("localhost:{port}");
    if request
        .headers()
        .get(header::HOST)
        .and_then(|v| v.to_str().ok())
        != Some(expected.as_str())
    {
        return StatusCode::FORBIDDEN.into_response();
    }
    let mut response = next.run(request).await;
    // OBS injects a nonce-less <style> with source-configurable CSS. Allow only
    // inline styling; scripts and every remote resource remain forbidden.
    response.headers_mut().insert(
        header::CONTENT_SECURITY_POLICY,
        concat!(
            "default-src 'none'; script-src 'none'; connect-src 'none'; img-src 'none'; ",
            "style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
        )
        .parse()
        .expect("static CSP"),
    );
    response.headers_mut().insert(
        header::X_CONTENT_TYPE_OPTIONS,
        "nosniff".parse().expect("static header"),
    );
    response.headers_mut().insert(
        header::CACHE_CONTROL,
        "no-store".parse().expect("static header"),
    );
    response
}
