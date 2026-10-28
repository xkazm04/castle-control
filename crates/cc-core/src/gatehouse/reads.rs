//! Read handlers paginate the existing Store under the service mutex. The Store
//! currently materializes its reads; response/scan bounds do not bound disk I/O.
use super::{
    internal,
    read_store::{ReadMessages, ReadStore},
};
use cc_store::{LedgerEvent, Store};
use cc_types::{
    ErrorCode, ErrorEnvelope, GatehouseChatItem, GatehouseChatResult, GatehouseHistoryItem,
    GatehouseHistoryResult, GatehouseReadCursor, GatehouseReadParams,
};
use std::ops::Range;

fn window(
    params: GatehouseReadParams,
    kind: &str,
    length: usize,
) -> Result<(Range<usize>, Option<GatehouseReadCursor>), ErrorEnvelope> {
    let invalid = || ErrorEnvelope::new(ErrorCode::Invalid, "invalid or stale Gatehouse cursor");
    let start = if let Some(cursor) = params.cursor {
        let raw = String::from(cursor);
        let (scope, offset) = raw.split_once(':').ok_or_else(invalid)?;
        if scope != kind {
            return Err(invalid());
        }
        offset.parse::<usize>().map_err(|_| invalid())?
    } else {
        0
    };
    if start > length {
        return Err(invalid());
    }
    let end = start
        .saturating_add(u32::from(params.limit) as usize)
        .min(length);
    let next = (end < length)
        .then(|| format!("{kind}:{end}").try_into().map_err(|_| internal()))
        .transpose()?;
    Ok((start..end, next))
}

pub(super) fn history(
    store: &Store,
    params: GatehouseReadParams,
) -> Result<GatehouseHistoryResult, ErrorEnvelope> {
    let read = ReadStore::load(store)?;
    let (range, next_cursor) = window(params, "history", read.ledger.len())?;
    let mut items = Vec::new();
    let mut unavailable_count = 0;
    for line in &read.ledger[range] {
        let LedgerEvent::Decision { decision_id, .. } = &line.event else {
            return Err(internal());
        };
        let Some(audit) = read.audit.get(&decision_id.to_string()) else {
            unavailable_count += 1;
            continue;
        };
        items.push(GatehouseHistoryItem {
            decision: audit.decision(),
            recorded_at: line
                .recorded_at
                .as_rfc3339()
                .try_into()
                .map_err(|_| internal())?,
            provenance: audit.provenance(),
        });
    }
    Ok(GatehouseHistoryResult {
        items,
        next_cursor,
        unavailable_count,
    })
}

pub(super) fn chat(
    store: &Store,
    params: GatehouseReadParams,
) -> Result<GatehouseChatResult, ErrorEnvelope> {
    let read = ReadStore::load(store)?;
    let (range, next_cursor) = window(params, "chat", read.ledger.len())?;
    let messages = ReadMessages::load(store)?;
    let mut items = Vec::new();
    let mut unavailable_count = 0;
    for line in &read.ledger[range] {
        let LedgerEvent::Decision {
            decision_id,
            user_id,
            ..
        } = &line.event
        else {
            return Err(internal());
        };
        let Some(audit) = read.audit.get(&decision_id.to_string()) else {
            // Ledger-only configuration is not a missing chat line.
            unavailable_count += u32::from(user_id.is_some());
            continue;
        };
        if !audit.is_chat_intake() {
            continue;
        }
        let Some(message) = messages.get(audit) else {
            unavailable_count += 1;
            continue;
        };
        items.push(GatehouseChatItem {
            message,
            decision: audit.decision(),
            provenance: audit.provenance(),
        });
    }
    Ok(GatehouseChatResult {
        items,
        next_cursor,
        unavailable_count,
    })
}
