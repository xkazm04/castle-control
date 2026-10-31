import type { PreviewVisual } from '../../beacons-model.js';
import { useId, useMemo, useSyncExternalStore } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import type { Visual } from '@castle-control/contract';
import type { CoreBeaconsPort } from '../../beacons-core.js';
import { createCurveEditor } from './curve-editor.js';
import type { CurveEditor } from './curve-editor.js';
import './kindling-curve.css';
import { beaconsCopy as copy } from '../../beacons-copy.js';

/** A read-only figure of the existing model's curve, never another intensity engine. */
export function KindlingCurve({ item }: { item: PreviewVisual }) {
  const ranges = item.visual.curve.ranges;
  const maximum = ranges.at(-1)?.total || 1;
  const x = (total: number) => Math.min(total / maximum, 1) * 600;
  return <figure className="visuals-room-curve">
    <div className="visuals-curve">
      <div className="visuals-curve-area">
        <svg viewBox="0 0 600 140" preserveAspectRatio="none" role="img" aria-label={`${item.visual.name} contribution to intensity curve · simulated`}>
          {ranges.slice(0, -1).map((point, index) => <rect key={point.total} x={x(point.total)} y="0"
            width={x(ranges[index + 1]?.total ?? maximum) - x(point.total)} height="140"
            className="visuals-room-curve-band" opacity={0.2 + point.intensity * 0.6} />)}
          <polyline points={ranges.map(point => `${x(point.total)},${140 - point.intensity * 140}`).join(' ')}
            className="visuals-room-curve-line" />
          <line x1={x(item.total)} x2={x(item.total)} y1="0" y2="140" className="visuals-room-curve-current" />
        </svg>
        <span className="visuals-curve-marker" style={{ left: `${x(item.total) / 6}%` }}><b>{Math.round(item.intensity * 100)}%</b></span>
      </div>
      <div className="visuals-curve-axis" aria-hidden="true">{ranges.map(point =>
        <span key={point.total} style={{ left: `${x(point.total) / 6}%` }}>{point.total}</span>)}</div>
    </div>
    <figcaption>{item.total.toFixed(1)} weighted subs · {Math.round(item.intensity * 100)}% {copy.blaze} · {copy.simulated}</figcaption>
  </figure>;
}

// Local point editing consumes these keys before the shell's navigation keymap.
const point_keys = new Map<string, readonly [number, number]>([['ArrowLeft', [-1, 0]], ['ArrowRight', [1, 0]],
  ['ArrowUp', [0, 0.01]], ['ArrowDown', [0, -0.01]]] as const);

function editKey(event: KeyboardEvent<SVGCircleElement>, editor: CurveEditor, index: number) {
  if (event.ctrlKey || event.metaKey || event.altKey || event.nativeEvent.isComposing) return;
  const step = point_keys.get(event.key);
  if (!step && event.key !== 'Enter' && event.key !== 'Escape') return;
  event.preventDefault(); event.stopPropagation();
  if (event.key === 'Enter') { void editor.save(); return; }
  if (event.key === 'Escape') { editor.cancel(); return; }
  const point = editor.getSnapshot().draft.ranges[index];
  if (!point || !step) return;
  const scale = event.shiftKey ? 10 : 1;
  const intensity = step[1] === 0 ? point.intensity : Math.round((point.intensity + step[1] * scale) * 1e12) / 1e12;
  editor.move(index, point.total + step[0] * scale, intensity);
}
function dragPoint(event: PointerEvent<SVGCircleElement>, editor: CurveEditor) {
  const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
  if (!rect || !rect.width || !rect.height) return;
  // Match the padded viewBox and preserveAspectRatio=none at any rendered size.
  editor.drag(event.pointerId, (event.clientX - rect.left) / rect.width * 624 - 12,
    (event.clientY - rect.top) / rect.height * 164 - 12);
}

export function CurveControls({ editor, state, busy, local = false }: {
  editor: CurveEditor; state: ReturnType<CurveEditor['getSnapshot']>; busy: boolean; local?: boolean;
}) {
  const decay_id = useId();
  const { draft } = state;
  const disabled = busy || state.phase === 'saving';
  const maximum = Math.max(1, ...state.confirmed.ranges.map(point => point.total), ...draft.ranges.map(point => point.total));
  const x = (total: number) => total / maximum * 600;
  return <form className="visuals-core-form visuals-curve-editor" aria-label="Kindling curve editor"
    onSubmit={event => { event.preventDefault(); void editor.save(); }}>
    <h4>Edit control points</h4>
    <p id="visuals-curve-help">{local ? 'SIMULATED local preview.' : 'Draft preview only.'} Drag a point and release to save. Tab to a point, then use arrows:
      left/right moves 1 contribution unit; up/down moves 1% intensity. Hold Shift for 10 units or 10%.
      Enter saves; Escape cancels. Totals stay in order.{!local && " Saved curves drive this visual's OBS browser source."}</p>
    <svg viewBox="-12 -12 624 164" preserveAspectRatio="none" role="group" aria-label="Editable contribution to intensity curve">
      <polyline points={draft.ranges.map(point => `${x(point.total)},${140 - point.intensity * 140}`).join(' ')}
        className="visuals-room-curve-line" />
      {draft.ranges.map((point, index) => <circle key={index} cx={x(point.total)} cy={140 - point.intensity * 140} r="8"
        role="button" tabIndex={disabled ? -1 : 0} aria-disabled={disabled} aria-describedby="visuals-curve-help"
        aria-label={`Control point ${index + 1}: ${point.total} contribution units, ${Math.round(point.intensity * 10000) / 100}% intensity`}
        onKeyDown={event => editKey(event, editor, index)}
        onPointerDown={event => {
          if (event.button !== 0 || !editor.begin(index, event.pointerId)) return;
          event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={event => dragPoint(event, editor)}
        onPointerUp={event => {
          dragPoint(event, editor); void editor.release(event.pointerId);
          if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={event => editor.cancelPointer(event.pointerId)}
        onLostPointerCapture={event => editor.cancelPointer(event.pointerId)} />)}
    </svg>
    <p role={state.phase === 'error' ? 'alert' : 'status'} aria-live={state.phase === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true">{local ? copy.local_curve_notice : state.notice}</p>
    {draft.ranges.map((point, index) => <fieldset key={index} disabled={disabled}>
      <legend>Control point {index + 1}</legend>
      <label>Contribution total<input name={`total-${index}`} type="number" min={draft.ranges[index - 1] ? (draft.ranges[index - 1]?.total ?? 0) + 1 : 0}
        max={draft.ranges[index + 1] ? (draft.ranges[index + 1]?.total ?? 0) - 1 : 4294967295} step="1" required value={point.total}
        onChange={event => editor.move(index, event.currentTarget.valueAsNumber, point.intensity)} /></label>
      <label>Intensity (%)<input name={`intensity-${index}`} type="number" min="0" max="100" step="any" required
        value={point.intensity * 100}
        onChange={event => editor.move(index, point.total, event.currentTarget.valueAsNumber / 100)} /></label>
    </fieldset>)}
    <div className="visuals-core-field"><label htmlFor={decay_id}>Decay</label>
    <select id={decay_id} name="decay" value={draft.decay.kind} disabled={disabled}
      onChange={event => editor.setDecay(event.currentTarget.value === 'exponential'
        ? { kind: 'exponential', half_life_s: 300 } : { kind: 'none' })}>
      <option value="none">No decay</option><option value="exponential">Exponential</option>
    </select></div>
    {draft.decay.kind === 'exponential' && <label>Half-life (seconds)<input name="half_life_s" type="number" min="1"
      max="4294967295" step="1" required disabled={disabled} value={draft.decay.half_life_s}
      onChange={event => editor.setDecay({ kind: 'exponential', half_life_s: event.currentTarget.valueAsNumber })} /></label>}
    <button type="submit" disabled={disabled}>{local ? copy.save_local_curve : 'Save curve to core'}</button>
    <button type="button" disabled={disabled} onClick={() => editor.cancel()}>Cancel curve edits</button>
  </form>;
}

export function EditableKindlingCurve({ visual, port, busy }: { visual: Visual; port: CoreBeaconsPort; busy: boolean }) {
  const editor = useMemo(() => createCurveEditor(visual, port), [visual, port]);
  const state = useSyncExternalStore(editor.subscribe, editor.getSnapshot, editor.getSnapshot);
  return <CurveControls editor={editor} state={state} busy={busy} />;
}
