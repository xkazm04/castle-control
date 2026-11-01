//! OBS 33 prunes source_remove scene items while rendering their scene. An
//! off-air scene may never render: explicitly detach UUID-matched placements.
use super::Input;
use crate::{Client, Error, SceneItem};
use std::time::Duration;
use tokio::time::{Instant, sleep};

async fn items(client: &mut Client, scene: &str) -> Result<Vec<SceneItem>, Error> {
    match client.get_scene_item_list(scene).await {
        Ok(items) => Ok(items.scene_items),
        Err(Error::Missing) => Ok(Vec::new()),
        Err(error) => Err(error),
    }
}
async fn present(client: &mut Client, uuid: &str) -> Result<bool, Error> {
    Ok(client
        .get_input_list()
        .await?
        .inputs
        .iter()
        .any(|input| input.input_uuid == uuid))
}

pub(super) async fn remove(client: &mut Client, input: &Input) -> Result<bool, Error> {
    let mut existed = present(client, &input.input_uuid).await?;
    for item in items(client, &input.scene_name).await? {
        // A source name or scene item ID can have been reused by the owner.
        // Neither grants authority to delete a different input UUID.
        if item.source_uuid != input.input_uuid {
            continue;
        }
        existed = true;
        match client
            .remove_scene_item(&input.scene_name, item.scene_item_id)
            .await
        {
            Ok(_) | Err(Error::Missing) => {}
            Err(error) => return Err(error),
        }
    }
    // Removing the last placement can itself release the input on OBS 33.
    match client.remove_input(&input.input_uuid).await {
        Ok(_) | Err(Error::Missing) => {}
        Err(error) => return Err(error),
    }
    let deadline = Instant::now() + Duration::from_secs(3);
    loop {
        let global = present(client, &input.input_uuid).await?;
        let placed = items(client, &input.scene_name)
            .await?
            .iter()
            .any(|item| item.source_uuid == input.input_uuid);
        if !global && !placed {
            return Ok(existed);
        }
        if Instant::now() >= deadline {
            // Keep the ledger record: a status-100 acknowledgement is not proof
            // of absence, and a later clear must still have cleanup authority.
            return Err(Error::Timeout);
        }
        sleep(Duration::from_millis(50)).await;
    }
}

pub(super) async fn remove_scene(client: &mut Client, scene: &str) -> Result<bool, Error> {
    match client.get_scene_item_list(scene).await {
        Ok(items) if !items.scene_items.is_empty() => return Ok(false),
        Ok(_) => match client.remove_scene(scene).await {
            Ok(_) | Err(Error::Missing) => {}
            Err(error) => return Err(error),
        },
        Err(Error::Missing) => {}
        Err(error) => return Err(error),
    }
    // Frontend scene-list invalidation can follow the removal acknowledgement.
    let deadline = Instant::now() + Duration::from_secs(3);
    loop {
        if !client
            .get_scene_list()
            .await?
            .scenes
            .iter()
            .any(|item| item.scene_name == scene)
        {
            return Ok(true);
        }
        if Instant::now() >= deadline {
            return Err(Error::Timeout);
        }
        sleep(Duration::from_millis(50)).await;
    }
}
