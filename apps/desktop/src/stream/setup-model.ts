import { parseError } from '@castle-control/contract';
import type { ErrorCode, Visual, VisualId } from '@castle-control/contract';
import { fixtureSourceUrl, fixtureVisuals } from '../beacons-fixture.js';
import { createObsPort } from './obs-core.js';
import type { StreamConnection } from './obs-core.js';

export const streamPresets = Object.freeze({
  '1080p': Object.freeze({ width: 1920, height: 1080 }),
  '720p': Object.freeze({ width: 1280, height: 720 }),
  vertical: Object.freeze({ width: 1080, height: 1920 }),
});
type Preset = keyof typeof streamPresets;
export type StreamRow = Readonly<{
  id: string; name: string; visual_id?: VisualId; href?: string; notice?: string;
  phase: 'idle' | 'unavailable' | 'resolving' | 'ready' | 'adding' | 'added' | 'refused';
}>;
export type StreamState = Readonly<{
  obs: 'unknown' | 'connected' | 'down' | 'simulated'; preset: Preset; scene_name: string;
  scene_error?: string; preset_error?: string; rows: readonly StreamRow[]; busy: boolean; notice: string;
}>;
type SetupOptions = ({ mode: 'fixture' } & Pick<StreamConnection, 'transport'>)
  | ({ mode: 'core' } & Partial<StreamConnection>);

function parsePreset(value: unknown): Preset | undefined {
  return typeof value === 'string' && Object.hasOwn(streamPresets, value) ? value as Preset : undefined;
}
function parseScene(value: unknown): string | undefined {
  if (typeof value !== 'string') return;
  const name = value.trim();
  return name.length > 0 && name.length <= 256 ? name : undefined;
}
const errorCopy: Record<ErrorCode, string> = {
  invalid: 'Not an owned overlay URL.',
  unavailable: 'OBS is not connected or refused the source; check that the scene exists.',
  not_found: 'This visual is no longer available. Refresh the outputs.',
  conflict: 'The source conflicts with an existing source. Check its name in OBS.',
  unauthorized: 'The local core could not authorize this request. Reopen the desktop app.',
  rate_limited: 'Too many requests. Wait before trying again.',
  upstream: 'The source result could not be confirmed. Check OBS before trying again.',
  blocked_by_policy: 'This overlay is blocked by policy.',
  needs_human: 'Review the source in OBS before trying again.',
  internal: 'The source result could not be confirmed. Check OBS before trying again.',
};
function refusal(error: unknown): string {
  try { return errorCopy[parseError(JSON.stringify(error)).code]; }
  catch { return errorCopy.internal; }
}
const lotRow: StreamRow = Object.freeze({ id: 'lot:plate', name: 'Lot plate', phase: 'unavailable',
  notice: 'Available after a sealed draw. Open the Lot Chamber for its on-stream plate.', href: '#/chamber/lottery' });
const rowsFor = (visuals: readonly Visual[]): readonly StreamRow[] => [
  ...visuals.map(visual => Object.freeze({ id: visual.visual_id, visual_id: visual.visual_id, name: visual.name, phase: 'idle' as const })), lotRow,
];

/** Session-local setup; no source is created until the page's human hold calls add. */
export function createStreamSetup(options: SetupOptions) {
  const simulated = options.mode === 'fixture';
  const port = options.mode === 'core' && options.launch ? createObsPort(options.launch, options.transport) : undefined;
  let state: StreamState = Object.freeze({ obs: simulated ? 'simulated' : 'unknown', preset: '1080p', scene_name: 'Scene',
    rows: Object.freeze(simulated ? rowsFor(fixtureVisuals) : [lotRow]), busy: false,
    notice: simulated ? 'Simulated setup · no OBS source will be created.' : 'Refresh to check OBS and load your visuals.' });
  const listeners = new Set<() => void>();
  function publish(change: Partial<StreamState>, clear: ('scene_error' | 'preset_error')[] = []) {
    const previous = { ...state };
    for (const key of clear) delete previous[key];
    state = Object.freeze({ ...previous, ...change });
    for (const listener of listeners) listener();
  }
  function update(row: StreamRow, phase: StreamRow['phase'], notice?: string) {
    publish({ rows: Object.freeze(state.rows.map(item => {
      if (item.id !== row.id) return item;
      const next = { ...item, phase };
      delete next.notice;
      return Object.freeze({ ...next, ...(notice ? { notice } : {}) });
    })) });
  }
  const find = (id: string) => state.rows.find(row => row.id === id && row.visual_id);
  const canAdd = (id: string) => Boolean(find(id) && !state.busy && !state.scene_error && !state.preset_error
    && (state.obs === 'connected' || state.obs === 'simulated') && find(id)?.phase !== 'added');
  async function source(row: StreamRow) {
    if (!row.visual_id) throw new Error('Not a visual');
    if (simulated) return fixtureSourceUrl(row.visual_id);
    if (!port) throw new Error('Core unavailable');
    return (await port.source(row.visual_id)).url;
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    canAdd,
    setScene(value: unknown) {
      if (state.busy) return false;
      const scene_name = parseScene(value);
      if (!scene_name) { publish({ scene_error: 'Enter an existing OBS scene name, from 1 to 256 characters.' }); return false; }
      publish({ scene_name }, ['scene_error']); return true;
    },
    setPreset(value: unknown) {
      if (state.busy) return false;
      const preset = parsePreset(value);
      if (!preset) { publish({ preset_error: 'Choose 1080p, 720p or vertical.' }); return false; }
      publish({ preset }, ['preset_error']); return true;
    },
    async refresh() {
      if (simulated || state.busy) return;
      if (!port) { publish({ obs: 'unknown', notice: 'Local core unavailable. Reopen the desktop app.' }); return; }
      publish({ busy: true, obs: 'unknown', notice: 'Checking OBS and loading outputs…' });
      await Promise.all([
        port.status().then(({ connected }) => publish({ obs: connected ? 'connected' : 'down' }),
          () => publish({ obs: 'unknown' })),
        port.visuals().then(({ visuals }) => publish({ rows: Object.freeze(rowsFor(visuals)), notice:
          visuals.length ? 'Choose the scene and source size, then hold to add an output.' : 'No visuals configured. Open Beacons to create one.' }),
        error => publish({ rows: Object.freeze([lotRow]), notice: refusal(error) })),
      ]);
      publish({ busy: false });
    },
    async add(id: string) {
      const row = find(id);
      if (!row || !canAdd(id)) return;
      const { scene_name, preset } = state;
      const size = streamPresets[preset];
      publish({ busy: true });
      update(row, 'resolving');
      try {
        const url = await source(row);
        update(row, 'adding');
        if (!simulated) {
          if (!port) throw new Error('Core unavailable');
          await port.add({ scene_name, source_name: `Castle Control · ${row.name}`, url, ...size });
        }
        update(row, 'added', simulated ? 'Simulated · no OBS source was created'
          : `Added to OBS · ${scene_name} · ${size.width} × ${size.height}. Inspect the source in OBS.`);
      } catch (error: unknown) { update(row, 'refused', refusal(error)); }
      finally { publish({ busy: false }); }
    },
    async copy(id: string, write: (url: string) => Promise<void> = url => navigator.clipboard.writeText(url)) {
      const row = find(id);
      if (!row || state.busy) return;
      publish({ busy: true });
      update(row, 'resolving');
      try {
        const url = await source(row);
        try {
          await write(url);
          update(row, 'ready', simulated ? 'Simulated example URL copied · not a live source.' : 'Browser-source URL copied. Set its size in OBS.');
        } catch { update(row, 'refused', 'Clipboard unavailable. Allow clipboard access and try again.'); }
      } catch (error: unknown) { update(row, 'refused', refusal(error)); }
      finally { publish({ busy: false }); }
    },
  };
}
export type StreamSetupModel = ReturnType<typeof createStreamSetup>;
