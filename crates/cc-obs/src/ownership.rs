//! Private persisted ownership, scoped to the OBS endpoint. No credential fields.
use crate::{BrowserSource, Client, CreatedInput, Error};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs,
    io::Write,
    path::{Path, PathBuf},
};

#[derive(Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Ledger {
    endpoints: BTreeMap<String, Owned>,
}
#[derive(Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Owned {
    scenes: Vec<String>,
    inputs: Vec<Input>,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Input {
    scene_name: String,
    source_name: String,
    input_uuid: String,
    scene_item_id: i64,
}

#[derive(Default)]
pub struct Ownership {
    root: Option<PathBuf>,
    ledger: Ledger,
}
impl Ownership {
    pub fn open(root: &Path) -> Result<Self, Error> {
        fs::create_dir_all(root).map_err(|_| Error::Storage)?;
        let ledger: Ledger = match fs::read(root.join("ownership.json")) {
            Ok(bytes) => serde_json::from_slice(&bytes).map_err(|_| Error::Storage)?,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ledger::default(),
            Err(_) => return Err(Error::Storage),
        };
        for owned in ledger.endpoints.values() {
            let mut uuids = std::collections::BTreeSet::new();
            let mut scenes = std::collections::BTreeSet::new();
            if owned
                .scenes
                .iter()
                .any(|s| s.is_empty() || !scenes.insert(s))
                || owned.inputs.iter().any(|input| {
                    input.input_uuid.is_empty()
                        || input.scene_name.trim().is_empty()
                        || input.source_name.trim().is_empty()
                        || input.scene_item_id < 0
                        || !uuids.insert(&input.input_uuid)
                })
            {
                return Err(Error::Storage);
            }
        }
        Ok(Self {
            root: Some(root.to_owned()),
            ledger,
        })
    }

    pub async fn ensure_scene(
        &mut self,
        client: &mut Client,
        endpoint: &str,
        name: &str,
    ) -> Result<bool, Error> {
        if !(1..=256).contains(&name.chars().count()) {
            return Err(Error::Invalid);
        }
        if client
            .get_scene_list()
            .await?
            .scenes
            .iter()
            .any(|scene| scene.scene_name == name)
        {
            return Ok(false);
        }
        client.create_scene(name).await?;
        let owned = self.ledger.endpoints.entry(endpoint.into()).or_default();
        if !owned.scenes.iter().any(|scene| scene == name) {
            owned.scenes.push(name.into());
        }
        self.save()?;
        Ok(true)
    }

    pub async fn create_source(
        &mut self,
        client: &mut Client,
        endpoint: &str,
        source: &BrowserSource,
    ) -> Result<CreatedInput, Error> {
        let created = client.create_browser_source(source).await?;
        if created.input_uuid.is_empty() || created.scene_item_id < 0 {
            return Err(Error::Protocol);
        }
        self.ledger
            .endpoints
            .entry(endpoint.into())
            .or_default()
            .inputs
            .push(Input {
                scene_name: source.scene_name.clone(),
                source_name: source.source_name.clone(),
                input_uuid: created.input_uuid.clone(),
                scene_item_id: created.scene_item_id,
            });
        self.save()?;
        Ok(created)
    }

    /// Persist each acknowledged removal so a partial failure can safely resume.
    /// Only ItemNotFound (600) proves absence; other rejections retain ownership.
    pub async fn clear(&mut self, client: &mut Client, endpoint: &str) -> Result<u32, Error> {
        let mut removed = 0u32;
        loop {
            let uuid = self
                .ledger
                .endpoints
                .get(endpoint)
                .and_then(|owned| owned.inputs.first())
                .map(|input| input.input_uuid.clone());
            let Some(uuid) = uuid else { break };
            match client.remove_input(&uuid).await {
                Ok(_) => removed = removed.checked_add(1).ok_or(Error::Protocol)?,
                Err(Error::Missing) => {}
                Err(error) => return Err(error),
            }
            self.ledger
                .endpoints
                .get_mut(endpoint)
                .ok_or(Error::Storage)?
                .inputs
                .remove(0);
            self.save()?;
        }
        let scenes = self
            .ledger
            .endpoints
            .get(endpoint)
            .map(|owned| owned.scenes.clone())
            .unwrap_or_default();
        for scene in scenes {
            match client.get_scene_item_list(&scene).await {
                Ok(items) if !items.scene_items.is_empty() => continue,
                Ok(_) => match client.remove_scene(&scene).await {
                    Ok(_) | Err(Error::Missing) => {}
                    Err(error) => return Err(error),
                },
                Err(Error::Missing) => {}
                Err(error) => return Err(error),
            }
            self.ledger
                .endpoints
                .get_mut(endpoint)
                .ok_or(Error::Storage)?
                .scenes
                .retain(|name| name != &scene);
            self.save()?;
        }
        Ok(removed)
    }

    fn save(&self) -> Result<(), Error> {
        let Some(root) = &self.root else {
            return Ok(());
        };
        let bytes = serde_json::to_vec(&self.ledger).map_err(|_| Error::Storage)?;
        let temporary = root.join("ownership.pending");
        let mut file = fs::File::create(&temporary).map_err(|_| Error::Storage)?;
        file.write_all(&bytes).map_err(|_| Error::Storage)?;
        file.sync_all().map_err(|_| Error::Storage)?;
        drop(file);
        fs::rename(temporary, root.join("ownership.json")).map_err(|_| Error::Storage)
    }
}
