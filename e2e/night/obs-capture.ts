// Isolated OBS lane only. This is test presentation, never a core/on-air command.
import { setTimeout as sleep } from 'node:timers/promises';
import type { ObsSocket } from './obs-ws.ts';

type Peer = Pick<ObsSocket, 'request'>;

function sceneName(response: Record<string, unknown>): string {
  const name = response.currentProgramSceneName;
  if (typeof name !== 'string' || !name) throw new Error('Invalid isolated OBS program scene response');
  return name;
}

async function waitForProgram(peer: Peer, scene: string, sources: readonly string[], timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  const budget = () => Math.max(1, Math.min(3_000, deadline - Date.now()));
  for (;;) {
    const current = sceneName(await peer.request('GetCurrentProgramScene', {}, budget()));
    const active = await Promise.all(sources.map(async sourceName => {
      const state = await peer.request('GetSourceActive', { sourceName }, budget());
      if (typeof state.videoActive !== 'boolean' || typeof state.videoShowing !== 'boolean') {
        throw new Error('Invalid isolated OBS source activity response');
      }
      return state.videoActive && state.videoShowing;
    }));
    if (current === scene && active.every(Boolean)) return;
    if (Date.now() >= deadline) throw new Error('Isolated OBS capture scene did not become active');
    await sleep(Math.max(0, Math.min(100, deadline - Date.now())));
  }
}

/** Keep CEF continuously visible while it loads/paints, then restore before cleanup.
 * GetSourceScreenshot alone only increments showing for a single render call:
 * https://github.com/obsproject/obs-websocket/blob/5.7.6/src/requesthandler/RequestHandler_Sources.cpp
 */
export async function withProgramScene(peer: Peer, scene: string, sources: readonly string[], capture: () => Promise<void>, timeoutMs = 15_000) {
  const previous = sceneName(await peer.request('GetCurrentProgramScene'));
  try {
    await peer.request('SetCurrentProgramScene', { sceneName: scene });
    await waitForProgram(peer, scene, sources, timeoutMs);
    await capture();
  } finally {
    await peer.request('SetCurrentProgramScene', { sceneName: previous });
    await waitForProgram(peer, previous, [], timeoutMs);
  }
}
