use super::internal;
use cc_store::{ConfigurationItem, DataStore, Store};
use cc_types::{ErrorCode, ErrorEnvelope, Timestamp, Writ, WritId};
use chrono::{DateTime, Utc};
use ulid::Ulid;

pub(super) fn find(store: &Store, id: &WritId) -> Result<Writ, ErrorEnvelope> {
    let mut latest = None;
    for item in store
        .configuration_items(DataStore::Writs)
        .map_err(|_| internal())?
    {
        let writ: Writ = serde_json::from_str(&item.content).map_err(|_| internal())?;
        if &writ.writ_id == id {
            latest = Some(writ);
        }
    }
    latest.ok_or_else(|| ErrorEnvelope::new(ErrorCode::NotFound, "Steward writ not found"))
}

pub(super) fn append(store: &mut Store, writ: &Writ, simulated: bool) -> Result<(), ErrorEnvelope> {
    let items = store
        .configuration_items(DataStore::Writs)
        .map_err(|_| internal())?;
    // Store reads in ID order. Maintain a strict order even for transitions in
    // the same millisecond or after a wall-clock rollback, including restarts.
    let candidate = u128::from(Ulid::new());
    let next = items.last().map_or(Ok(candidate), |last| {
        u128::from(last.id)
            .checked_add(1)
            .map(|n| n.max(candidate))
            .ok_or_else(internal)
    })?;
    let item = ConfigurationItem::new(
        Ulid::from(next),
        cc_store::Timestamp::now(),
        serde_json::to_string(writ).map_err(|_| internal())?,
        simulated,
    );
    store
        .insert_configuration(DataStore::Writs, &item)
        .map_err(|_| internal())
}

pub(super) fn advance(writ: &mut Writ) -> Result<(), ErrorEnvelope> {
    let previous = DateTime::parse_from_rfc3339(&String::from(writ.updated_at.clone()))
        .map_err(|_| internal())?
        .with_timezone(&Utc);
    let next = previous
        .checked_add_signed(chrono::TimeDelta::milliseconds(1))
        .ok_or_else(internal)?;
    writ.updated_at = Timestamp::try_from(
        Utc::now()
            .max(next)
            .to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
    )
    .map_err(|_| internal())?;
    Ok(())
}
