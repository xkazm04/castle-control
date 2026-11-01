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

/** Independent of the core ledger/count: inspect both global inputs and scene items. */
export async function confirmObsCleanup(peer: Peer, scene: string, owned: readonly string[], timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const remaining = names(await peer.request('GetInputList'), 'inputs', 'inputName');
    const scenes = names(await peer.request('GetSceneList'), 'scenes', 'sceneName');
    const scene_exists = scenes.includes(scene);
    const scene_items = scene_exists
      ? names(await peer.request('GetSceneItemList', { sceneName: scene }), 'sceneItems', 'sourceName') : [];
    if (!owned.some(name => remaining.includes(name) || scene_items.includes(name))) return { scene_exists, scene_items };
    if (Date.now() >= deadline) throw new Error('Isolated OBS cleanup failed: rehearsal inputs or scene items remain');
    await sleep(Math.min(200, deadline - Date.now()));
  }
}
