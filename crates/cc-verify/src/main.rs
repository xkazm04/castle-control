use cc_verify::{QuicknetChain, verify_writ_json};
use std::{fs::File, io::Read, process::ExitCode};

fn read_limited(path: &std::ffi::OsStr) -> Result<String, Box<dyn std::error::Error>> {
    let mut text = String::new();
    File::open(path)?
        .take(2_000_001)
        .read_to_string(&mut text)?;
    if text.len() > 2_000_000 {
        return Err("file too large".into());
    }
    Ok(text)
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    if args.len() != 1 && !(args.len() == 3 && args[1] == "--chain") {
        return Err("Usage: cc-verify <writ.json> [--chain <trusted-chain.json>]".into());
    }
    let chain = if args.len() == 3 {
        Some(QuicknetChain::from_json(&read_limited(&args[2])?)?)
    } else {
        None
    };
    let cast = verify_writ_json(&read_limited(&args[0])?, chain.as_ref())?;
    println!("{}", serde_json::to_string(&cast)?);
    Ok(())
}

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("Unverified: {error}");
            ExitCode::from(2)
        }
    }
}
