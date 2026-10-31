import type { CoreBeaconsPort, CoreBeaconsSnapshot } from '../../beacons-core.js';

/** Desktop read projection only. The core's authoritative load still clears its
 * rows; keep the last confirmed configuration visible while refresh is pending
 * or failed. The room labels that state and pauses configuration controls. */
export function createBeaconsView(port: CoreBeaconsPort): CoreBeaconsPort {
  let current = port.getSnapshot();
  let confirmed = current.visuals;
  let selected = current.selected;
  let view: CoreBeaconsSnapshot = current;
  return { ...port, getSnapshot() {
    const next = port.getSnapshot();
    if (next === current) return view;
    current = next;
    if (next.phase === 'ready') { confirmed = next.visuals; selected = next.selected; }
    view = (next.phase === 'loading' || next.phase === 'error') && confirmed.length > 0
      ? { ...next, visuals: confirmed, ...(selected ? { selected } : {}) } : next;
    return view;
  } };
}
