//! Same atomic configuration pattern as Lots; cc-store owns the writer lock.
use super::internal;
use cc_beacons::intensity::validate_curve;
use cc_types::{ErrorEnvelope, Visual, VisualId};
use std::{collections::BTreeMap, fs, io::Write, path::Path};

pub(super) fn load(root: &Path) -> Result<BTreeMap<VisualId, Visual>, ErrorEnvelope> {
    let values: Vec<Visual> = match fs::read(root.join("visuals.json")) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(|_| internal())?,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Vec::new(),
        Err(_) => return Err(internal()),
    };
    let mut visuals = BTreeMap::new();
    for visual in values {
        validate_curve(&visual.curve).map_err(|_| internal())?;
        if visuals.insert(visual.visual_id.clone(), visual).is_some() {
            return Err(internal());
        }
    }
    Ok(visuals)
}

pub(super) fn save(root: &Path, visuals: &BTreeMap<VisualId, Visual>) -> Result<(), ErrorEnvelope> {
    let bytes =
        serde_json::to_vec(&visuals.values().collect::<Vec<_>>()).map_err(|_| internal())?;
    let temporary = root.join("visuals.pending");
    let mut file = fs::File::create(&temporary).map_err(|_| internal())?;
    file.write_all(&bytes).map_err(|_| internal())?;
    file.sync_all().map_err(|_| internal())?;
    drop(file);
    fs::rename(temporary, root.join("visuals.json")).map_err(|_| internal())
}
