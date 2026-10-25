//! Owner-only local measurement; never run by tests or the build gate.
use cc_engine::{ModelName, measure_floor, simulated_bank};
use cc_types::{DataValue, Settings};

#[tokio::main(flavor = "current_thread")]
async fn main() {
    if let Err(error) = run().await {
        eprintln!("floor measurement: {error}");
        std::process::exit(1);
    }
}
async fn run() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    if args.len() != 3 {
        return Err(
            "usage: measure-floor <loopback-v1-url> <model-id> <new-store-directory>".into(),
        );
    }
    let settings = Settings {
        values: [(
            "engine.live_endpoint".into(),
            DataValue::String(args[0].clone()),
        )]
        .into(),
    };
    let model = ModelName::parse(&args[1])?;
    let mut store = cc_store::Store::open(&args[2])?;
    let report = measure_floor(&settings, &model, &simulated_bank(), &mut store).await?;
    println!(
        "instrument=simulated-floor-v1 n={} correct={} failed={} p95_ms={} longest_silence_ms={} live_admitted={}",
        report.evidence.samples,
        report.evidence.structured_correct,
        report.failed,
        report.evidence.p95_ms,
        report.evidence.longest_silence_ms,
        report.evidence.admits(cc_engine::EngineClass::Live)
    );
    Ok(())
}
