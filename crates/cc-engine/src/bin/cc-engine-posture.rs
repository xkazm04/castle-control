//! Native, zero-model sandbox witness. Launched only inside `codex sandbox windows`.
fn main() {
    let Some(target) = std::env::args_os().nth(1) else {
        std::process::exit(2);
    };
    match std::fs::File::options()
        .create_new(true)
        .write(true)
        .open(&target)
    {
        Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => {
            println!("cc-read-only-probe-v1");
        }
        Ok(file) => {
            drop(file);
            let _cleanup = std::fs::remove_file(target);
            std::process::exit(1);
        }
        Err(_) => std::process::exit(2),
    }
}
