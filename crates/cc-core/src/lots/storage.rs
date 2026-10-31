use super::convert::{internal, roll};
use cc_lots::Roll;
use cc_store::{DataStore, LedgerEvent, LedgerKind, Store, StoredItem, Timestamp, TwitchUserId};
use cc_types::{CastResult, Display, DrawId, ErrorEnvelope, LotsDraw, LotsWrit};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, fs, io::Write, path::Path};

/// Private storage envelope; the proof itself contains no RPC identifiers.
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct SavedCast {
    pub result: CastResult,
    pub writ: LotsWrit,
}

/// One atomic snapshot keeps draw replacements and presentation in step. The
/// original draws.json is migration input only once this envelope exists.
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Settings {
    draws: Vec<SavedDraw>,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct SavedDraw {
    draw: LotsDraw,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "display_value"
    )]
    display: Option<Display>,
}
fn display_value<'de, D: serde::Deserializer<'de>>(d: D) -> Result<Option<Display>, D::Error> {
    Display::deserialize(d).map(Some)
}
pub(super) type DrawSettings = (BTreeMap<DrawId, LotsDraw>, BTreeMap<DrawId, Display>);

pub(super) fn load_settings(root: &Path) -> Result<DrawSettings, ErrorEnvelope> {
    let bytes = match fs::read(root.join("draw-settings.json")) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok((load_draws(root)?, BTreeMap::new()));
        }
        Err(_) => return Err(internal()),
    };
    let settings: Settings = serde_json::from_slice(&bytes).map_err(|_| internal())?;
    let (mut draws, mut displays) = (BTreeMap::new(), BTreeMap::new());
    for saved in settings.draws {
        let id = saved.draw.draw_id.clone();
        if let Some(display) = saved.display {
            displays.insert(id.clone(), display);
        }
        if draws.insert(id, saved.draw).is_some() {
            return Err(internal());
        }
    }
    Ok((draws, displays))
}

pub(super) fn load_draws(root: &Path) -> Result<BTreeMap<DrawId, LotsDraw>, ErrorEnvelope> {
    let path = root.join("draws.json");
    let values: Vec<LotsDraw> = match fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(|_| internal())?,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Vec::new(),
        Err(_) => return Err(internal()),
    };
    let mut draws = BTreeMap::new();
    for draw in values {
        if draws.insert(draw.draw_id.clone(), draw).is_some() {
            return Err(internal());
        }
    }
    Ok(draws)
}

pub(super) fn save_settings(
    root: &Path,
    draws: &BTreeMap<DrawId, LotsDraw>,
    displays: &BTreeMap<DrawId, Display>,
) -> Result<(), ErrorEnvelope> {
    let settings = Settings {
        draws: draws
            .iter()
            .map(|(id, draw)| SavedDraw {
                draw: draw.clone(),
                display: displays.get(id).cloned(),
            })
            .collect(),
    };
    let bytes = serde_json::to_vec(&settings).map_err(|_| internal())?;
    let temporary = root.join("draw-settings.pending");
    let mut file = fs::File::create(&temporary).map_err(|_| internal())?;
    file.write_all(&bytes).map_err(|_| internal())?;
    file.sync_all().map_err(|_| internal())?;
    drop(file);
    fs::rename(temporary, root.join("draw-settings.json")).map_err(|_| internal())
}

pub(super) fn restored_roll(draw: &LotsDraw, store: &Store) -> Result<Roll, ErrorEnvelope> {
    let mut result = roll(&draw.rules)?;
    let lines = store
        .read_ledger(LedgerKind::Draws)
        .map_err(|_| internal())?;
    let runs: BTreeMap<_, _> = lines
        .iter()
        .filter_map(|line| match &line.event {
            LedgerEvent::DrawSealed {
                draw_run_id,
                draw_id,
                ..
            } => Some((*draw_run_id, draw_id.as_str())),
            _ => None,
        })
        .collect();
    let mut history = Vec::new();
    for line in &lines {
        if let LedgerEvent::Draw {
            draw_run_id,
            winner_user_ids,
        } = &line.event
            && runs.get(draw_run_id).copied() == Some(draw.draw_id.as_str())
        {
            let at = line
                .event_at
                .as_rfc3339()
                .parse::<DateTime<Utc>>()
                .map_err(|_| internal())?;
            history.extend(winner_user_ids.iter().cloned().map(|user| (user, at)));
        }
    }
    result.restore_winner_history(history);
    Ok(result)
}

pub(super) fn saved_casts(store: &Store) -> Result<Vec<SavedCast>, ErrorEnvelope> {
    store
        .items(DataStore::Writs)
        .map_err(|_| internal())?
        .into_iter()
        .map(|item| {
            let saved: SavedCast = serde_json::from_str(&item.content).map_err(|_| internal())?;
            if saved.result.writ_id.as_str() != item.id.to_string() {
                return Err(internal());
            }
            Ok(saved)
        })
        .collect()
}

pub(super) fn save_cast(
    store: &mut Store,
    saved: &SavedCast,
    at: DateTime<Utc>,
    simulated: bool,
) -> Result<(), ErrorEnvelope> {
    let users = saved
        .writ
        .roll
        .entries
        .iter()
        .map(|entry| {
            TwitchUserId::parse(&String::from(entry.handle.clone())).map_err(|_| internal())
        })
        .collect::<Result<Vec<_>, _>>()?;
    store
        .insert(
            DataStore::Writs,
            &StoredItem {
                id: saved
                    .result
                    .writ_id
                    .as_str()
                    .parse()
                    .map_err(|_| internal())?,
                at: Timestamp::parse(&at.to_rfc3339()).map_err(|_| internal())?,
                user_ids: users,
                content: serde_json::to_string(saved).map_err(|_| internal())?,
                simulated,
            },
        )
        .map_err(|_| internal())
}
