import type { IntensityCurve, Visual } from '@castle-control/contract';
import type { CoreBeaconsPort } from '../../beacons-core.js';

type CurveState = Readonly<{
  draft: IntensityCurve; confirmed: IntensityCurve;
  phase: 'idle' | 'editing' | 'saving' | 'saved' | 'error'; notice: string;
}>;
const uint32_max = 4294967295;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
function frozen(curve: IntensityCurve): IntensityCurve {
  const copy = structuredClone(curve);
  copy.ranges.forEach(Object.freeze); Object.freeze(copy.ranges); Object.freeze(copy.decay);
  return Object.freeze(copy);
}

/** Local drafts only. Accounting and the authoritative curve remain in core. */
export function createCurveEditor(visual: Visual, port: CoreBeaconsPort) {
  const confirmed = frozen(visual.curve);
  let state: CurveState = Object.freeze({ draft: confirmed, confirmed, phase: 'idle', notice: 'Core-confirmed curve.' });
  let drag: { index: number; pointer_id: number; maximum: number } | undefined;
  const listeners = new Set<() => void>();
  function publish(change: Partial<CurveState>) {
    state = Object.freeze({ ...state, ...change });
    for (const listener of listeners) listener();
  }
  const busy = () => state.phase === 'saving' || port.getSnapshot().busy;
  function move(index: number, total: number, intensity: number) {
    if (busy() || !Number.isFinite(total) || !Number.isFinite(intensity) || !state.draft.ranges[index]) return;
    const previous = state.draft.ranges[index - 1]; const next = state.draft.ranges[index + 1];
    const point = { total: clamp(Math.round(total), previous ? previous.total + 1 : 0, next ? next.total - 1 : uint32_max),
      intensity: clamp(intensity, 0, 1) };
    const ranges = state.draft.ranges.map((value, at) => at === index ? point : value);
    publish({ draft: frozen({ ...state.draft, ranges }), phase: 'editing', notice: 'Draft preview only. Commit to save to core.' });
  }
  function cancel() {
    if (busy()) return;
    drag = undefined;
    publish({ draft: state.confirmed, phase: 'idle', notice: 'Edit cancelled. Showing the last confirmed curve.' });
  }
  async function save() {
    if (busy()) return;
    drag = undefined;
    if (JSON.stringify(state.draft) === JSON.stringify(state.confirmed)) return;
    const curve = state.draft;
    publish({ phase: 'saving', notice: 'Waiting for the core to confirm the curve.' });
    const result = await port.setCurve({ visual_id: visual.visual_id, curve });
    if (result) {
      const curve = frozen(result.curve);
      publish({ draft: curve, confirmed: curve, phase: 'saved', notice: 'Curve saved by the core.' });
    } else {
      const code = port.getSnapshot().error?.code ?? 'unavailable';
      publish({ draft: state.confirmed, phase: 'error',
        notice: `Curve save failed: ${code}. Showing the last confirmed curve. Edit again to retry.` });
    }
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    move, save, cancel,
    setDecay(decay: IntensityCurve['decay']) {
      if (busy() || (decay.kind === 'exponential' && (!Number.isInteger(decay.half_life_s)
        || decay.half_life_s < 1 || decay.half_life_s > uint32_max))) return;
      publish({ draft: frozen({ ...state.draft, decay }), phase: 'editing', notice: 'Draft preview only. Commit to save to core.' });
    },
    begin(index: number, pointer_id: number) {
      if (busy() || drag || !state.draft.ranges[index]) return false;
      drag = { index, pointer_id, maximum: Math.max(1, ...state.confirmed.ranges.map(point => point.total),
        ...state.draft.ranges.map(point => point.total)) };
      return true;
    },
    drag(pointer_id: number, x: number, y: number) {
      if (drag?.pointer_id === pointer_id) move(drag.index, x / 600 * drag.maximum, 1 - y / 140);
    },
    async release(pointer_id: number) {
      if (drag?.pointer_id !== pointer_id) return;
      drag = undefined;
      await save();
    },
    cancelPointer(pointer_id: number) { if (drag?.pointer_id === pointer_id) cancel(); },
  };
}
export type CurveEditor = ReturnType<typeof createCurveEditor>;
