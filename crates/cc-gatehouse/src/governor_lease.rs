//! Shared lifecycle only; no executor, persistence or wire format.
use super::{RoomLease, RoomSetting};
use cc_types::{LeaseId, Timestamp};
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};

/// Copies of a registration see human yield and confirmed end immediately.
#[derive(Clone)]
pub(crate) struct LeaseRegistration {
    pub lease_id: LeaseId,
    pub setting: RoomSetting,
    pub expires_at: Timestamp,
    yielded: Arc<AtomicBool>,
    ended: Arc<AtomicBool>,
}

impl LeaseRegistration {
    pub fn new(setting: RoomSetting, expires_at: Timestamp) -> Self {
        Self {
            lease_id: LeaseId::mint(),
            setting,
            expires_at,
            yielded: Arc::default(),
            ended: Arc::default(),
        }
    }

    pub fn yielded(&self) -> bool {
        self.yielded.load(Ordering::SeqCst)
    }
    pub fn ended(&self) -> bool {
        self.ended.load(Ordering::SeqCst)
    }
    pub fn yield_to_human(&self) {
        self.yielded.store(true, Ordering::SeqCst);
    }
    pub fn end(&self) {
        self.ended.store(true, Ordering::SeqCst);
    }

    pub fn snapshot(&self) -> RoomLease {
        RoomLease {
            lease_id: self.lease_id.clone(),
            setting: self.setting,
            expires_at: self.expires_at.clone(),
            yielded: self.yielded(),
        }
    }
}
