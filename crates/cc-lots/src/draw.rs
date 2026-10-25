//! Owned, one-way draw lifecycle. No wire payloads or network transport.
use crate::{Error, GuardedDraw, Result, Roll};
use cc_store::{LedgerEvent, Store, Timestamp, TwitchUserId};
use cc_types::CheckResult;
use cc_verify::{BeaconRound, QuicknetChain, SealedRoll, VerifiedCast, Writ, verify_writ_json};
use chrono::{DateTime, SecondsFormat, Utc};
use ulid::Ulid;

/// Offline inputs to the proof core; the quicknet chain is separately trusted.
pub enum SealSource<'a> {
    Quicknet(&'a QuicknetChain),
    /// Compute the commitment with cc_verify::SealedRoll::commitment before
    /// sealing. The seed is revealed only at cast time.
    StreamerCommit(String),
}

/// Owns the frozen eligibility snapshot and proof. Neither is mutable from
/// outside this module, and this type deliberately cannot be cloned.
///
/// The original Roll cannot be edited after sealing (ownership is transferred):
/// ```compile_fail,E0382
/// use cc_lots::{Roll, GuardedDraw, SealSource, seal_roll};
/// use chrono::{DateTime, Utc};
/// fn edit(mut roll: Roll, draw: &GuardedDraw, at: DateTime<Utc>) {
///     let source = SealSource::StreamerCommit(cc_verify::SealedRoll::commitment(&[0; 32]));
///     let _sealed = seal_roll(roll, draw, at, 1, source).unwrap();
///     roll.clear_entries(); // refused: use of moved roll
/// }
/// ```
/// No entry intake or history editing is exposed on the sealed value:
/// ```compile_fail,E0599
/// use cc_lots::{SealedDraw, PassedMessage};
/// fn add(mut sealed: SealedDraw, message: PassedMessage) {
///     sealed.intake(message);
/// }
/// ```
/// ```compile_fail,E0616
/// use cc_lots::SealedDraw;
/// fn edit(mut sealed: SealedDraw) {
///     sealed.roll.clear_entries(); // snapshot is private
/// }
/// ```
pub struct SealedDraw {
    roll: Roll,
    proof: SealedRoll,
    sealed_at: DateTime<Utc>,
    draw_run_id: Ulid,
    label: &'static str,
}

impl SealedDraw {
    pub fn seal(&self) -> &str {
        self.proof.seal()
    }

    /// Canonical entries and source schedule are published from cc-verify's
    /// snapshot directly; cc-lots does not implement a second seal hash.
    pub fn to_json(&self) -> Result<String> {
        Ok(self.proof.to_json()?)
    }

    pub fn draw_run_id(&self) -> Ulid {
        self.draw_run_id
    }

    pub fn label(&self) -> &str {
        self.label
    }
}

/// Freeze only entries eligible at the seal time. Proof `handle`s are stable
/// numeric Twitch IDs, not display names. cc-verify validates its canonical
/// bounds (including the 25-byte identifier limit); IDs are never truncated.
/// No unfreeze API exists. A failed seal/cast also consumes the attempt.
/// The caller must publish this seal before supplying a round or revealing a seed.
/// Seal auditing needs a cc-store event that can hold the seal/snapshot; its
/// existing Draw event can record only the later cast's winners.
pub fn seal_roll(
    roll: Roll,
    draw: &GuardedDraw,
    at: DateTime<Utc>,
    margin_s: u32,
    source: SealSource<'_>,
) -> Result<SealedDraw> {
    if draw.check().result == CheckResult::Blocked {
        return Err(Error::Invalid("draw policy is blocked"));
    }
    if at.timestamp_subsec_nanos() != 0 {
        return Err(Error::Invalid("seal time must use whole UTC seconds"));
    }
    let entries = roll
        .weight_table(at)
        .rows
        .into_iter()
        .map(|row| {
            Ok(cc_verify::Entry {
                handle: row.user_id.as_str().to_owned(),
                weight: u32::try_from(row.weight)
                    .map_err(|_| Error::Invalid("proof weight exceeds u32"))?,
            })
        })
        .collect::<Result<Vec<_>>>()?;
    let count = u32::from(roll.winner_count());
    let timestamp = at.to_rfc3339_opts(SecondsFormat::Secs, true);
    let (proof, label) = match source {
        SealSource::Quicknet(chain) => (
            SealedRoll::quicknet(entries, count, timestamp, margin_s, chain)?,
            "drand-quicknet",
        ),
        SealSource::StreamerCommit(commitment) => (
            SealedRoll::streamer(entries, count, timestamp, margin_s, commitment)?,
            "streamer-controlled",
        ),
    };
    Ok(SealedDraw {
        roll,
        proof,
        sealed_at: at,
        draw_run_id: Ulid::new(),
        label,
    })
}

/// Read-only proof and winners, returned only after validation and durable audit.
/// It cannot be cloned or used to cast the same sealed draw a second time.
pub struct CastResult {
    writ: Writ,
    verified: VerifiedCast,
    winners: Vec<TwitchUserId>,
    roll: Roll,
    draw_run_id: Ulid,
}

impl CastResult {
    pub fn writ(&self) -> &Writ {
        &self.writ
    }

    /// Only this verified output should drive the draw animation.
    pub fn verified(&self) -> &VerifiedCast {
        &self.verified
    }

    pub fn winners(&self) -> &[TwitchUserId] {
        &self.winners
    }

    pub fn draw_run_id(&self) -> Ulid {
        self.draw_run_id
    }

    /// A new, empty pool with winner cooldown history preserved. It has no
    /// connection to the previous seal or writ and must be sealed anew.
    pub fn into_next_roll(mut self) -> Roll {
        self.roll.clear_entries();
        self.roll
    }
}

/// Consume one attempt using an already-fetched round; never performs HTTP.
/// A cap mismatch fails the draw, without a retry or an alternate winner set.
pub fn cast_quicknet(
    sealed: SealedDraw,
    chain: &QuicknetChain,
    round: &BeaconRound,
    at: DateTime<Utc>,
    store: &mut Store,
    recorded_at: Timestamp,
) -> Result<CastResult> {
    let writ = sealed.proof.finish_quicknet(chain, round)?;
    finish(sealed, writ, Some(chain), at, store, recorded_at)
}

/// Reveal the committed seed. The verified result retains cc-verify's
/// `streamer-controlled` label; this path is never described as a public beacon.
/// Reusing an attempt, including after an error, is refused by the compiler:
/// ```compile_fail,E0382
/// use cc_lots::{SealedDraw, cast_streamer};
/// use cc_store::{Store, Timestamp};
/// use chrono::{DateTime, Utc};
/// fn repeat(sealed: SealedDraw, store: &mut Store, at: DateTime<Utc>, recorded: Timestamp) {
///     let _first = cast_streamer(sealed, [0; 32], at, store, recorded.clone());
///     let _retry = cast_streamer(sealed, [0; 32], at, store, recorded);
/// }
/// ```
pub fn cast_streamer(
    sealed: SealedDraw,
    seed: [u8; 32],
    at: DateTime<Utc>,
    store: &mut Store,
    recorded_at: Timestamp,
) -> Result<CastResult> {
    let writ = sealed.proof.finish_streamer(seed)?;
    finish(sealed, writ, None, at, store, recorded_at)
}

fn finish(
    mut sealed: SealedDraw,
    writ: Writ,
    chain: Option<&QuicknetChain>,
    at: DateTime<Utc>,
    store: &mut Store,
    recorded_at: Timestamp,
) -> Result<CastResult> {
    if at < sealed.sealed_at {
        return Err(Error::Invalid("cast predates seal"));
    }
    let verified = verify_writ_json(&writ.to_json()?, chain)?;
    let winners = verified
        .winners()
        .iter()
        .map(|id| TwitchUserId::parse(id))
        .collect::<cc_store::Result<Vec<_>>>()?;
    sealed.roll.validate_winners(&winners, at)?;
    // No result escapes if validation or append fails. All state is owned by
    // this single attempt, so failure also cannot leave an editable sealed roll.
    sealed.roll.record_winners(&winners, at)?;
    store.append_ledger(
        Timestamp::parse(&at.to_rfc3339())?,
        recorded_at,
        LedgerEvent::Draw {
            draw_run_id: sealed.draw_run_id,
            winner_user_ids: winners.clone(),
        },
    )?;
    Ok(CastResult {
        writ,
        verified,
        winners,
        roll: sealed.roll,
        draw_run_id: sealed.draw_run_id,
    })
}
