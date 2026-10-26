//! Offline RPC module. Exporting this module does not register or feed it.
mod convert;
mod lifecycle;
mod storage;

use crate::{EventHub, Module};
use cc_lots::{Intake, PassedMessage, Roll, SealedDraw};
use cc_store::Store;
use cc_types::*;
use cc_verify::{BeaconRound, QuicknetChain};
use chrono::{DateTime, Utc};
use convert::{encode, internal};
use futures::future::BoxFuture;
use serde_json::Value;
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};
use tokio::sync::broadcast;

/// The caller supplies trusted chain metadata and already-recorded rounds.
/// This module provides no HTTP implementation and never fetches a beacon.
pub trait BeaconSource: Send + Sync {
    fn chain(&self) -> Result<QuicknetChain, ErrorEnvelope>;
    fn round(&self, sealed: &LotsSealedRoll) -> Result<BeaconRound, ErrorEnvelope>;
}

pub trait LotsClock: Send + Sync {
    fn now(&self) -> DateTime<Utc>;
}
pub struct SystemLotsClock;
impl LotsClock for SystemLotsClock {
    fn now(&self) -> DateTime<Utc> {
        Utc::now()
    }
}

struct Pending {
    draw_id: DrawId,
    sealed: SealedDraw,
    published: RollSealResult,
    seed: Option<[u8; 32]>,
    chain: Option<QuicknetChain>,
}
struct State {
    store: Store,
    draws: BTreeMap<DrawId, LotsDraw>,
    rolls: BTreeMap<DrawId, Roll>,
    pending: BTreeMap<DrawRunId, Pending>,
}

pub struct LotsModule {
    state: Mutex<State>,
    root: PathBuf,
    events: Arc<EventHub>,
    payloads: broadcast::Sender<LotsEventPayload>,
    beacon: Arc<dyn BeaconSource>,
    clock: Arc<dyn LotsClock>,
    simulated: bool,
}

impl LotsModule {
    pub const METHODS: &'static [&'static str] = &[
        "lots.draw.list",
        "lots.draw.upsert",
        "lots.draw.check",
        "lots.roll.lookup",
        "lots.roll.seal",
        "lots.cast",
        "lots.writ.get",
    ];

    /// The root is caller-owned. Configuration lives beside the cc-store directory;
    /// viewer-bearing writs and all draw audits remain inside cc-store's inventory.
    pub fn open(
        root: impl AsRef<Path>,
        events: Arc<EventHub>,
        beacon: Arc<dyn BeaconSource>,
        clock: Arc<dyn LotsClock>,
        simulated: bool,
    ) -> Result<Self, ErrorEnvelope> {
        let root = root.as_ref().to_owned();
        let store = Store::open(root.join("store")).map_err(|_| internal())?;
        let draws = storage::load_draws(&root)?;
        let rolls = draws
            .iter()
            .map(|(id, draw)| Ok((id.clone(), storage::restored_roll(draw, &store)?)))
            .collect::<Result<_, ErrorEnvelope>>()?;
        Ok(Self {
            state: Mutex::new(State {
                store,
                draws,
                rolls,
                pending: BTreeMap::new(),
            }),
            root,
            events,
            beacon,
            clock,
            simulated,
            payloads: broadcast::channel(256).0,
        })
    }

    /// Internal typed payload sink, separate from invalidation-only /events.
    /// Subscribers detect lag through broadcast::error::RecvError::Lagged.
    pub fn subscribe(&self) -> broadcast::Receiver<LotsEventPayload> {
        self.payloads.subscribe()
    }

    /// The future trusted intake adapter supplies verified Twitch identity, never
    /// a name claimed in chat. The store requires associations for erasable writs.
    pub fn map_user(&self, user: cc_store::TwitchUserId, login: &str) -> Result<(), ErrorEnvelope> {
        self.state
            .lock()
            .map_err(|_| internal())?
            .store
            .map_user(user, login)
            .map_err(|_| internal())
    }

    /// Only the domain's verdict-checked capability is accepted. No RPC admits entries.
    /// No production adapter feeds this API before the live spike.
    /// ```compile_fail,E0308
    /// use cc_core::lots::LotsModule;
    /// use cc_lots::MessageFacts;
    /// use cc_types::DrawId;
    /// fn unmoderated(module: &LotsModule, draw: &DrawId, facts: MessageFacts) {
    ///     module.intake(draw, facts); // requires PassedMessage, never raw chat
    /// }
    /// ```
    pub fn intake(&self, draw_id: &DrawId, passed: PassedMessage) -> Result<Intake, ErrorEnvelope> {
        let mut state = self.state.lock().map_err(|_| internal())?;
        let unavailable = unavailable_roll(&state, draw_id);
        let roll = state.rolls.get_mut(draw_id).ok_or(unavailable)?;
        let result = roll.intake(passed);
        if result == Intake::Added {
            let weight_table = convert::table(roll.weight_table(self.now()))?;
            self.emit(LotsEventPayload::Roll(LotsRollPayload {
                draw_id: draw_id.clone(),
                weight_table,
            }))?;
        }
        Ok(result)
    }

    fn now(&self) -> DateTime<Utc> {
        self.clock.now()
    }
    fn emit(&self, payload: LotsEventPayload) -> Result<(), ErrorEnvelope> {
        let kind = match &payload {
            LotsEventPayload::Roll(_) => EventKind::Roll,
            LotsEventPayload::Sealed(_) => EventKind::Sealed,
            LotsEventPayload::Cast(_) => EventKind::Cast,
        };
        self.events.publish(kind)?;
        // No subscribers is normal: this internal sink is optional, never a ledger.
        let _no_subscribers = self.payloads.send(payload);
        Ok(())
    }

    fn handle(&self, request: &RpcRequest) -> Result<Value, ErrorEnvelope> {
        let mut state = self.state.lock().map_err(|_| internal())?;
        match request {
            RpcRequest::DrawList(_) => encode(DrawListResult {
                draws: state.draws.values().cloned().collect(),
            }),
            RpcRequest::DrawCheck(params) => encode(convert::check(&params.policy)),
            RpcRequest::DrawUpsert(params) => {
                let draw = &params.draw;
                if state
                    .pending
                    .values()
                    .any(|run| run.draw_id == draw.draw_id)
                {
                    return Err(ErrorEnvelope::new(ErrorCode::Conflict, "draw is sealed"));
                }
                // Reconfiguration resets entries, but can never reset winner cooldowns.
                let roll = storage::restored_roll(draw, &state.store)?;
                let mut draws = state.draws.clone();
                draws.insert(draw.draw_id.clone(), draw.clone());
                storage::save_draws(&self.root, &draws)?;
                state.draws = draws;
                let weight_table = convert::table(roll.weight_table(self.now()))?;
                state.rolls.insert(draw.draw_id.clone(), roll);
                self.emit(LotsEventPayload::Roll(LotsRollPayload {
                    draw_id: draw.draw_id.clone(),
                    weight_table,
                }))?;
                encode(draw)
            }
            RpcRequest::RollLookup(params) => {
                let roll = state
                    .rolls
                    .get(&params.draw_id)
                    .ok_or_else(|| unavailable_roll(&state, &params.draw_id))?;
                let user = cc_store::TwitchUserId::parse(&String::from(params.user_id.clone()))
                    .map_err(|_| internal())?;
                encode(RollLookupResult {
                    draw_id: params.draw_id.clone(),
                    entry: roll
                        .lookup(&user, self.now())
                        .map(convert::entry)
                        .transpose()?,
                })
            }
            RpcRequest::RollSeal(params) => self.seal(&mut state, params),
            RpcRequest::Cast(params) => self.cast(&mut state, params),
            RpcRequest::WritGet(params) => {
                let saved = storage::saved_casts(&state.store)?
                    .into_iter()
                    .find(|saved| saved.result.writ_id == params.writ_id)
                    .ok_or_else(not_found)?;
                encode(saved.writ)
            }
            _ => Err(ErrorEnvelope::new(
                ErrorCode::Unavailable,
                "method is outside lots module",
            )),
        }
    }
}

impl Module for LotsModule {
    fn methods(&self) -> &'static [&'static str] {
        Self::METHODS
    }
    fn call<'a>(&'a self, request: &'a RpcRequest) -> BoxFuture<'a, Result<Value, ErrorEnvelope>> {
        Box::pin(async move { self.handle(request) })
    }
}
fn not_found() -> ErrorEnvelope {
    ErrorEnvelope::new(ErrorCode::NotFound, "draw resource not found")
}
fn unavailable_roll(state: &State, id: &DrawId) -> ErrorEnvelope {
    if state.draws.contains_key(id) {
        ErrorEnvelope::new(
            ErrorCode::Conflict,
            "roll is sealed or its attempt was consumed",
        )
    } else {
        not_found()
    }
}
