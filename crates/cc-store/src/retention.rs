use crate::{DEFAULT_RETENTION_S, Error, MIN_RETENTION_S, PurgePreview, Result, Store, Timestamp};
use rusqlite::{Connection, OptionalExtension};
use std::{
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::{sync::watch, task::JoinHandle};

pub trait Clock: Send + Sync + 'static {
    fn now(&self) -> Timestamp;
}

pub struct SystemClock;
impl Clock for SystemClock {
    fn now(&self) -> Timestamp {
        Timestamp::now()
    }
}

pub(crate) fn retention_s(conn: &Connection) -> Result<u64> {
    let value: Option<i64> = conn
        .query_row(
            "SELECT value FROM settings WHERE key='retention_s'",
            [],
            |row| row.get(0),
        )
        .optional()?;
    match value {
        Some(value) => u64::try_from(value).map_err(|_| Error::Invalid("retention cap")),
        None => Ok(DEFAULT_RETENTION_S),
    }
}

impl Store {
    pub fn retention_s(&self) -> Result<u64> {
        self.ready()?;
        retention_s(&self.conn)
    }

    pub fn set_retention_s(&mut self, requested_s: u64) -> Result<()> {
        self.ready()?;
        if requested_s < MIN_RETENTION_S {
            return Err(Error::RetentionBelowFloor {
                requested_s,
                floor_s: MIN_RETENTION_S,
            });
        }
        let seconds = i64::try_from(requested_s).map_err(|_| Error::Invalid("retention cap"))?;
        if chrono::TimeDelta::try_seconds(seconds).is_none() {
            return Err(Error::Invalid("retention cap"));
        }
        self.conn.execute(
            "INSERT INTO settings (key,value) VALUES ('retention_s',?1)
            ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            [seconds],
        )?;
        Ok(())
    }
}

pub fn run_retention_job(store: &mut Store, clock: &dyn Clock) -> Result<PurgePreview> {
    store.purge_expired(clock.now())
}

/// The caller owns the handle and must observe its Result. Errors stop the task.
/// A true shutdown value or a closed sender ends it; the first tick is one period away.
pub fn spawn_retention_task(
    store: Arc<Mutex<Store>>,
    clock: Arc<dyn Clock>,
    period: Duration,
    mut shutdown: watch::Receiver<bool>,
) -> Result<JoinHandle<Result<()>>> {
    if period.is_zero() {
        return Err(Error::Invalid("zero retention job period"));
    }
    let start = tokio::time::Instant::now()
        .checked_add(period)
        .ok_or(Error::Invalid("retention job period"))?;
    Ok(tokio::spawn(async move {
        let mut interval = tokio::time::interval_at(start, period);
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            if *shutdown.borrow() {
                return Ok(());
            }
            tokio::select! {
                changed = shutdown.changed() => {
                    if changed.is_err() || *shutdown.borrow() { return Ok(()); }
                }
                _ = interval.tick() => {
                    let store = Arc::clone(&store);
                    let clock = Arc::clone(&clock);
                    tokio::task::spawn_blocking(move || {
                        let mut guard = store.lock().map_err(|_| Error::LockPoisoned)?;
                        run_retention_job(&mut guard, clock.as_ref())
                    }).await??;
                }
            }
        }
    }))
}
