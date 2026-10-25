#[tokio::main]
async fn main() {
    let result = match cc_core::spike::Options::parse(std::env::args().skip(1)) {
        Ok(options) => cc_core::run_spike(options).await,
        Err(error) => Err(error),
    };
    if let Err(error) = result {
        eprintln!("{}: {error}", cc_core::spike::report("spike", false));
        std::process::exit(1);
    }
}
