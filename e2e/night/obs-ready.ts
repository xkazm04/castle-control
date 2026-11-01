// Isolated OBS lane only. Diagnostics never include connection/authentication data.
import { setTimeout as sleep } from 'node:timers/promises';
import type { ObsSocket } from './obs-ws.ts';

type Peer = Pick<ObsSocket, 'request' | 'close'>;

/** A successful TCP/Identify alone is not readiness: GetVersion must answer too. */
export async function waitForObs<T extends Peer>(connect: (timeoutMs: number) => Promise<T>, timeoutMs = 30_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let attempts = 0;
  while (Date.now() < deadline) {
    let peer: T | undefined;
    try {
      attempts++;
      peer = await connect(Math.max(1, Math.min(3_000, deadline - Date.now())));
      await peer.request('GetVersion', {}, Math.max(1, Math.min(3_000, deadline - Date.now())));
      return peer;
    } catch {
      peer?.close();
      await sleep(Math.max(0, Math.min(250, deadline - Date.now())));
    }
  }
  throw new Error(`Isolated OBS readiness failed after ${attempts} attempts within ${timeoutMs} ms`);
}

function names(response: Record<string, unknown>, key: string, field: string): string[] {
  const items = response[key];
  if (!Array.isArray(items)) throw new Error(`Invalid isolated OBS ${key} response`);
  return items.map((item: unknown) => {
    if (!item || typeof item !== 'object' || !(field in item)) throw new Error(`Invalid isolated OBS ${key} item`);
    const value: unknown = Reflect.get(item, field);
    if (typeof value !== 'string') throw new Error(`Invalid isolated OBS ${field}`);
    return value;
  });
}

/** Project only identity fields, never OBS settings or arbitrary peer data. */
function identities(response: Record<string, unknown>, key: string, name: string, uuid: string) {
  const values = names(response, key, name);
  const items = response[key];
  if (!Array.isArray(items)) throw new Error(`Invalid isolated OBS ${key} response`);
  return values.map((name, index) => {
    const item: unknown = items[index];
    if (!item || typeof item !== 'object') throw new Error(`Invalid isolated OBS ${key} item`);
    const id: unknown = Reflect.get(item, uuid);
    const scene_item_id: unknown = Reflect.get(item, 'sceneItemId');
    if (id !== undefined && typeof id !== 'string') throw new Error(`Invalid isolated OBS ${uuid}`);
    if (scene_item_id !== undefined && (typeof scene_item_id !== 'number' || !Number.isInteger(scene_item_id))) {
      throw new Error('Invalid isolated OBS sceneItemId');
    }
    return { name, ...(typeof id === 'string' ? { uuid: id } : {}),
      ...(typeof scene_item_id === 'number' ? { scene_item_id } : {}) };
  });
}

/** Independent of the core ledger/count: inspect both global inputs and scene items. */
export async function confirmObsCleanup(peer: Peer, scene: string, owned: readonly string[], timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const inputs = identities(await peer.request('GetInputList'), 'inputs', 'inputName', 'inputUuid');
    const scenes = names(await peer.request('GetSceneList'), 'scenes', 'sceneName');
    const scene_exists = scenes.includes(scene);
    const items = scene_exists
      ? identities(await peer.request('GetSceneItemList', { sceneName: scene }), 'sceneItems', 'sourceName', 'sourceUuid') : [];
    const scene_items = items.map(item => item.name);
    const remaining = inputs.filter(input => owned.includes(input.name));
    if (!remaining.length && !owned.some(name => scene_items.includes(name))) return { scene_exists, scene_items };
    if (Date.now() >= deadline) {
      const detail = JSON.stringify({ scene, scene_exists, remaining_inputs: remaining, scene_items: items });
      console.error('[OBS cleanup timeout]', detail);
      throw new Error(`Isolated OBS cleanup failed: rehearsal inputs or scene items remain; ${detail}`);
    }
    await sleep(Math.min(200, deadline - Date.now()));
  }
}
