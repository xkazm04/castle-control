#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod host;
mod launch;
mod options;

use host::CoreHost;
use launch::{BUILT_ORIGIN, Launch, same_origin};
use options::Options;
use tauri::{Manager, RunEvent, Url, WebviewUrl, WebviewWindowBuilder, WindowEvent};

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let options = Options::parse(std::env::args().skip(1))?;
    let app = tauri::Builder::default()
        .setup(move |app| {
            let fixture = tauri::is_dev() && app.config().build.dev_url.is_some();
            let origin = if fixture {
                app.config()
                    .build
                    .dev_url
                    .clone()
                    .ok_or("missing development URL")?
            } else {
                Url::parse(BUILT_ORIGIN)?
            };
            let script = if fixture {
                if options.native.is_some() || options.login || options.steward_live {
                    return Err(
                        "launch options require the built frontend; Vite runs fixtures only".into(),
                    );
                }
                Launch::fixture().script(&origin)?
            } else {
                let data_dir = app.path().app_data_dir()?.join("store");
                let host = tauri::async_runtime::block_on(CoreHost::start(options, &data_dir))?;
                let script = host.launch()?.script(&origin)?;
                app.manage(host);
                script
            };
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title(if fixture {
                    "Castle Control — SIMULATED"
                } else {
                    "Castle Control"
                })
                .inner_size(1440.0, 900.0)
                .min_inner_size(1280.0, 800.0)
                .use_https_scheme(false)
                .initialization_script(script)
                .on_navigation(move |url| same_origin(url, &origin))
                .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
                .build()?;
            Ok(())
        })
        .build(tauri::generate_context!())?;
    app.run(|app, event| {
        if matches!(
            event,
            RunEvent::Exit
                | RunEvent::WindowEvent {
                    event: WindowEvent::Destroyed,
                    ..
                }
        ) && let Some(host) = app.try_state::<CoreHost>()
        {
            host.shutdown();
        }
    });
    Ok(())
}

fn main() {
    if run().is_err() {
        // Tauri errors may carry script/URL context; never print those errors.
        eprintln!(
            "Castle Control could not start. Check the public launch options and desktop setup."
        );
        std::process::exit(1);
    }
}
