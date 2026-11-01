use super::*;
use crate::{
    gatehouse::GatehouseModule,
    lots::{LotsClock, LotsModule, recorded::RecordedBeacon},
    overlay::RenderHost,
};

struct Clock(Mutex<chrono::DateTime<chrono::Utc>>);
impl LotsClock for Clock {
    fn now(&self) -> chrono::DateTime<chrono::Utc> {
        *self.0.lock().unwrap()
    }
}

#[tokio::test]
async fn lots_fill_opens_a_real_keyword_draw_and_seals_a_simulated_page_offline() {
    let root = Root::new();
    let events = Arc::new(EventHub::new(4096).unwrap());
    let render = Arc::new(RenderHost::default());
    let clock = Arc::new(Clock(Mutex::new(chrono::Utc::now())));
    // The same recorded public beacon used by offline Lots registration. No HTTP.
    let lots = Arc::new(
        LotsModule::open(
            root.0.join("lots"),
            events.clone(),
            Arc::new(RecordedBeacon),
            clock.clone(),
            false,
        )
        .unwrap()
        .with_render_host(render.clone()),
    );
    let gatehouse = Arc::new(GatehouseModule::open_shadow(root.0.join("gatehouse")).unwrap());
    let beacons = Arc::new(crate::beacons::BeaconsModule::open(root.0.join("beacons")).unwrap());
    let tiltyard = crate::tiltyard::TiltyardModule::open(
        root.0.join("tiltyard"),
        gatehouse.clone(),
        events.clone(),
        None,
    )
    .unwrap();
    let pipeline = Arc::new(ShadowPipeline::new(
        gatehouse,
        lots.clone(),
        beacons.clone(),
        events.clone(),
    ));
    let module = RehearsalModule {
        session: Mutex::new(Session::default()),
        serial: tokio::sync::Mutex::new(()),
        door: Arc::new(Door {
            sender: broadcast::channel(256).0,
            sequence: AtomicU64::new(1),
            session: "simulated-lots".into(),
        }),
        pipeline,
        services: Weak::new(),
        events: events.clone(),
        payloads: broadcast::channel(64).0,
        actions: scenarios::Actions {
            lots: lots.clone(),
            beacons,
            tiltyard,
            configuration: Arc::new(tokio::sync::Mutex::new(())),
        },
    };
    let overlay = cc_obs::Overlay::start_with_routes(0, render.routes())
        .await
        .unwrap();
    call(&module, "rehearsal.start", json!({})).await;
    let mut receiver = module.door.sender.subscribe();
    call(
        &module,
        "rehearsal.scenario.run",
        json!({"scenario":"lots_fill"}),
    )
    .await;
    let messages = collect(&mut receiver, 20).await;
    assert!(messages.iter().all(|m| m.message.text == "SIMULATED !join"));
    assert_eq!(
        messages
            .iter()
            .map(|m| &m.login)
            .collect::<std::collections::BTreeSet<_>>()
            .len(),
        20
    );
    settle(&events, 20).await;
    // Include the last message before Lots' whole-second seal cutoff, without
    // sleeping or changing the real Gatehouse clock.
    *clock.0.lock().unwrap() = chrono::Utc::now() + chrono::Duration::seconds(2);
    let list = lots.handle(&request("lots.draw.list", json!({}))).unwrap();
    let id = list["draws"][0]["draw_id"].as_str().unwrap();
    assert!(id.starts_with("simulated-rehearsal-"));
    let seal = lots
        .handle(&request(
            "lots.roll.seal",
            json!({"draw_id":id,
        "source":"drand_quicknet","margin_s":1}),
        ))
        .unwrap();
    assert_eq!(
        seal["sealed"]["roll"]["entries"].as_array().unwrap().len(),
        20
    );
    let client = reqwest::Client::builder().no_proxy().build().unwrap();
    let html = client
        .get(format!("{}lots/{id}", overlay.url()))
        .send()
        .await
        .unwrap()
        .text()
        .await
        .unwrap();
    assert!(html.contains("Seal announced") && html.contains("SIMULATED"));
    // A second fill gets a fresh accepting pool even while the first is sealed.
    call(
        &module,
        "rehearsal.scenario.run",
        json!({"scenario":"lots_fill"}),
    )
    .await;
    collect(&mut receiver, 1).await;
    let list = lots.handle(&request("lots.draw.list", json!({}))).unwrap();
    assert_eq!(list["draws"].as_array().unwrap().len(), 2);
    module.stop().await.unwrap();
    drop(module);
    drop(lots);
    drop(overlay);
    tokio::task::yield_now().await;
}
