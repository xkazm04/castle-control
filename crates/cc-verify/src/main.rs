use cc_verify::{QuicknetChain, verify_writ_json};
use std::{fs::File, io::Read, process::ExitCode};

const USAGE: &str = "Usage: cc-verify <writ.json> [--chain <trusted-chain.json>]";

/// Distinct from a failed proof so scripts can tell a mistyped command or an
/// unreadable file from a tampered writ.
enum Failure {
    Usage,
    Unreadable(String),
    Unverified(String),
}

fn read_limited(path: &std::ffi::OsStr) -> Result<String, Failure> {
    let unreadable = |error: &dyn std::fmt::Display| Failure::Unreadable(error.to_string());
    let mut text = String::new();
    File::open(path)
        .map_err(|error| unreadable(&error))?
        .take(2_000_001)
        .read_to_string(&mut text)
        .map_err(|error| unreadable(&error))?;
    if text.len() > 2_000_000 {
        return Err(Failure::Unreadable("file too large".into()));
    }
    Ok(text)
}

fn run() -> Result<(), Failure> {
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    if args.len() != 1 && !(args.len() == 3 && args[1] == "--chain") {
        return Err(Failure::Usage);
    }
    let unverified = |error: &dyn std::fmt::Display| Failure::Unverified(error.to_string());
    let chain = if args.len() == 3 {
        Some(
            QuicknetChain::from_json(&read_limited(&args[2])?)
                .map_err(|error| unverified(&error))?,
        )
    } else {
        None
    };
    let cast = verify_writ_json(&read_limited(&args[0])?, chain.as_ref())
        .map_err(|error| unverified(&error))?;
    println!(
        "{}",
        serde_json::to_string(&cast).map_err(|error| unverified(&error))?
    );
    Ok(())
}

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(Failure::Usage) => {
            eprintln!("{USAGE}");
            ExitCode::from(64)
        }
        Err(Failure::Unreadable(error)) => {
            eprintln!("Unreadable input: {error}");
            ExitCode::from(66)
        }
        Err(Failure::Unverified(error)) => {
            eprintln!("Unverified: {error}");
            ExitCode::from(2)
        }
    }
}
