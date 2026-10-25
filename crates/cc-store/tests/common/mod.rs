#![allow(dead_code)]

use cc_store::{
    DataStore, DecisionAction, EngineClass, EngineProvider, LedgerEvent, ModelName, Store,
    StoredItem, Timestamp, TwitchUserId,
};
use chrono::{TimeZone, Utc};
use std::path::Path;
use ulid::Ulid;

pub fn at(second: u64) -> Timestamp {
    let start = Utc.with_ymd_and_hms(2026, 10, 25, 0, 0, 0).unwrap();
    Timestamp::parse(&(start + chrono::Duration::seconds(second as i64)).to_rfc3339()).unwrap()
}

pub fn user(n: u64) -> TwitchUserId {
    TwitchUserId::parse(&n.to_string()).unwrap()
}

pub fn decision(n: u128) -> LedgerEvent {
    LedgerEvent::Decision {
        decision_id: Ulid::from(n),
        user_id: Some(user(1)),
        action: DecisionAction::WouldAct,
    }
}

pub fn item(id: u64, second: u64, user_ids: Vec<TwitchUserId>) -> StoredItem {
    StoredItem {
        id: Ulid::from(u128::from(id)),
        at: at(second),
        user_ids,
        content: format!("simulated content {id}"),
        simulated: true,
    }
}

pub fn populated(path: &Path) -> Store {
    let mut store = Store::open(path).unwrap();
    store.map_user(user(1), "simulated_login").unwrap();
    store.map_user(user(2), "simulated_other").unwrap();
    for kind in DataStore::ALL {
        store.insert(kind, &item(1, 0, vec![user(1)])).unwrap();
        store.insert(kind, &item(2, 0, vec![user(2)])).unwrap();
        store
            .insert(kind, &item(3, 0, vec![user(1), user(2)]))
            .unwrap();
    }
    store.append_ledger(at(1), at(2), decision(1)).unwrap();
    store
        .append_ledger(
            at(1),
            at(2),
            LedgerEvent::Draw {
                draw_run_id: Ulid::from(2u128),
                winner_user_ids: vec![user(1)],
            },
        )
        .unwrap();
    store
        .append_ledger(
            at(1),
            at(2),
            LedgerEvent::Engine {
                call_id: Ulid::from(3u128),
                cost_microusd: 5,
                class: EngineClass::Batch,
                provider: EngineProvider::LocalEndpoint,
                model_selected: ModelName::parse("simulated-model").unwrap(),
                model_served: None,
            },
        )
        .unwrap();
    store
}
