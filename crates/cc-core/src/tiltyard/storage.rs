//! Atomic, aggregate-only session persistence; cc-store supplies the writer lock.
use super::{Saved, internal, validate};
use cc_types::ErrorEnvelope;
use std::{fs, io::Write, path::Path};

pub(super) fn load(root: &Path) -> Result<Saved, ErrorEnvelope> {
    let saved: Saved = match fs::read(root.join("session.json")) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(|_| internal())?,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Saved::default(),
        Err(_) => return Err(internal()),
    };
    if let Some(session) = &saved.session {
        validate::session(session)?;
        let needs_closed = session.verdict.is_some() || session.champion.is_some();
        if needs_closed != saved.last_closed.is_some()
            || session
                .verdict
                .as_ref()
                .is_some_and(|v| saved.last_closed.as_ref() != Some(v))
        {
            return Err(internal());
        }
        if saved.spans.iter().any(|span| span.end < span.start)
            || saved.spans.windows(2).any(|p| p[0].end > p[1].start)
        {
            return Err(internal());
        }
        if let Some(closed) = &saved.last_closed {
            let mut completed = session.clone();
            completed.phase = cc_types::TiltyardSessionPhase::Verdict;
            completed.verdict = Some(closed.clone());
            completed.match_key = Some(closed.match_key.clone());
            completed.elapsed_ms = closed.elapsed_ms;
            completed.remaining_ms = 1;
            completed.window_ends_at = None;
            completed.champion = None;
            validate::session(&completed)?;
        }
    } else if saved.simulated || !saved.spans.is_empty() || saved.last_closed.is_some() {
        return Err(internal());
    }
    Ok(saved)
}
pub(super) fn save(root: &Path, saved: &Saved) -> Result<(), ErrorEnvelope> {
    let bytes = serde_json::to_vec(saved).map_err(|_| internal())?;
    let temporary = root.join("session.pending");
    let mut file = fs::File::create(&temporary).map_err(|_| internal())?;
    file.write_all(&bytes).map_err(|_| internal())?;
    file.sync_all().map_err(|_| internal())?;
    drop(file);
    fs::rename(temporary, root.join("session.json")).map_err(|_| internal())
}

// Missing is allowed; an explicitly present null is never a session or verdict.
pub(super) fn present<'de, D, T>(d: D) -> Result<Option<T>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: serde::Deserialize<'de>,
{
    T::deserialize(d).map(Some)
}
