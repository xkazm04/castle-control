import { useMemo, useSyncExternalStore } from 'react';
import { FieldGroup } from '@castle-control/ui';
import type { IntensityCurve } from '@castle-control/contract';
import type { BeaconsPort, PreviewVisual } from '../../beacons-model.js';
import { beaconsCopy as copy } from '../../beacons-copy.js';
import { createCurveEditor } from './curve-editor.js';
import { CurveControls, KindlingCurve } from './kindling-curve.jsx';

export function createFixtureCurveEditor(port: BeaconsPort) {
  const visual_id = port.getSnapshot().selected;
  const selected = () => {
    const state = port.getSnapshot();
    const item = state.visuals.find(item => item.visual.visual_id === visual_id);
    if (!item) throw new Error('Missing generated visual');
    return item.visual;
  };
  const preview = (curve: IntensityCurve) => {
    if (port.getSnapshot().selected === visual_id) port.curve(curve);
  };
  return createCurveEditor(selected(), {
    getSnapshot: () => ({ busy: false }),
    setCurve: async ({ curve }) => { preview(curve); return selected(); },
  }, preview);
}

export function FixtureCurve({ item, port }: { item: PreviewVisual; port: BeaconsPort }) {
  const editor = useMemo(() => createFixtureCurveEditor(port), [port]);
  const state = useSyncExternalStore(editor.subscribe, editor.getSnapshot, editor.getSnapshot);
  return <>
    <KindlingCurve item={item} />
    <CurveControls editor={editor} state={state} busy={false} local />
    <FieldGroup label={copy.gift_weight} control_id="beacons-gift-weight" variant="select">
      <select id="beacons-gift-weight" value={item.gift_weight} onChange={event => port.weight(Number(event.currentTarget.value))}>
        {[1, 2, 3, 4, 5, 6].map(weight => <option key={weight} value={weight}>{weight}×</option>)}
      </select>
    </FieldGroup>
  </>;
}
