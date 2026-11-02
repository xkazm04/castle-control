import type { PreviewVisual } from '../../beacons-model.js';
import { useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react';
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

/** The draggable point surface. One editor can drive it from the bench and from the night replay. */
/** The x-axis reach of the curve figure: the drag domain, or the furthest confirmed or draft point. */
export function curveMaximum(state: ReturnType<CurveEditor['getSnapshot']>, domain = 0): number {
  return Math.max(1, domain, ...state.confirmed.ranges.map(point => point.total), ...state.draft.ranges.map(point => point.total));
}

export function CurvePoints({ editor, state, disabled, described_by = 'visuals-curve-help',
  label = 'Editable contribution to intensity curve', underlay, domain = 0 }: {
  editor: CurveEditor; state: ReturnType<CurveEditor['getSnapshot']>; disabled: boolean; described_by?: string;
  label?: string; underlay?: (x: (total: number) => number, maximum: number) => ReactNode; domain?: number;
}) {
  const { draft } = state;
  const maximum = curveMaximum(state, domain);
  const x = (total: number) => total / maximum * 600;
  return <svg viewBox="-12 -12 624 164" preserveAspectRatio="none" role="group" aria-label={label}>
      {underlay?.(x, maximum)}
      <polyline points={draft.ranges.map(point => `${x(point.total)},${140 - point.intensity * 140}`).join(' ')}
        className="visuals-room-curve-line" />
      {draft.ranges.map((point, index) => <circle key={index} cx={x(point.total)} cy={140 - point.intensity * 140} r="8"
        role="button" tabIndex={disabled ? -1 : 0} aria-disabled={disabled} aria-describedby={described_by}
        aria-label={`Control point ${index + 1}: ${point.total} contribution units, ${Math.round(point.intensity * 10000) / 100}% intensity`}
        onKeyDown={event => editKey(event, editor, index)}
        onPointerDown={event => {
          if (event.button !== 0 || !editor.begin(index, event.pointerId, domain)) return;
          event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={event => dragPoint(event, editor)}
        onPointerUp={event => {
          dragPoint(event, editor); void editor.release(event.pointerId);
          if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={event => editor.cancelPointer(event.pointerId)}
        onLostPointerCapture={event => editor.cancelPointer(event.pointerId)} />)}
    </svg>;
}

export function CurveControls({ editor, state, busy, local = false }: {
  editor: CurveEditor; state: ReturnType<CurveEditor['getSnapshot']>; busy: boolean; local?: boolean;
}) {
  const decay_id = useId();
  // Typed text is kept per input so a field can be cleared and retyped; it yields to any other change of the value.
  const [typed, setTyped] = useState<Readonly<Record<string, { text: string; source: number }>>>({});
  const numberField = (name: string, value: number, show: (value: number) => string, commit: (text: string) => void) => ({
    value: typed[name]?.source === value ? typed[name].text : show(value),
    onChange: (event: { currentTarget: { value: string } }) => {
      const text = event.currentTarget.value;
      setTyped(before => ({ ...before, [name]: { text, source: value } }));
      if (text.trim()) commit(text);
    },
  });
  const { draft } = state;
  const disabled = busy || state.phase === 'saving';
  return <form className="visuals-core-form visuals-curve-editor" aria-label="Kindling curve editor"
    onSubmit={event => { event.preventDefault(); void editor.save(); }}>
    <h4>Edit control points</h4>
    <p id="visuals-curve-help">{local ? 'SIMULATED local preview.' : 'Draft preview only.'} Drag a point and release to save. Tab to a point, then use arrows:
      left/right moves 1 contribution unit; up/down moves 1% intensity. Hold Shift for 10 units or 10%.
      Enter saves; Escape cancels. Totals stay in order.{!local && " Saved curves drive this visual's OBS browser source."}</p>
    {/* Hook-free leaf, inlined so the bench keeps its exact native tree. */}
    {CurvePoints({ editor, state, disabled })}
    <p role={state.phase === 'error' ? 'alert' : 'status'} aria-live={state.phase === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true">{local ? copy.local_curve_notice : state.notice}</p>
    {draft.ranges.map((point, index) => <fieldset key={index} disabled={disabled}>
      <legend>Control point {index + 1}</legend>
      <label>Contribution total<input name={`total-${index}`} type="number" min={draft.ranges[index - 1] ? (draft.ranges[index - 1]?.total ?? 0) + 1 : 0}
        max={draft.ranges[index + 1] ? (draft.ranges[index + 1]?.total ?? 0) - 1 : 4294967295} step="1" required
        {...numberField(`total-${index}`, point.total, String, text => editor.move(index, Number(text), point.intensity))} /></label>
      <label>Intensity (%)<input name={`intensity-${index}`} type="number" min="0" max="100" step="any" required
        {...numberField(`intensity-${index}`, point.intensity, value => String(Math.round(value * 1e8) / 1e6),
          text => editor.move(index, point.total, Number(text) / 100))} /></label>
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
  // Refresh Beacons reloads visuals as new objects. Keep the editor, and any unsaved draft in it, while the
  // same visual's confirmed curve is unchanged; only a real change of that curve starts a fresh editor.
  const held = useRef<{ editor: CurveEditor; visual_id: string; port: CoreBeaconsPort } | undefined>(undefined);
  const editor = useMemo(() => {
    const kept = held.current;
    if (kept && kept.visual_id === visual.visual_id && kept.port === port
      && JSON.stringify(kept.editor.getSnapshot().confirmed) === JSON.stringify(visual.curve)) return kept.editor;
    const fresh = createCurveEditor(visual, port);
    held.current = { editor: fresh, visual_id: visual.visual_id, port };
    return fresh;
  }, [visual, port]);
  const state = useSyncExternalStore(editor.subscribe, editor.getSnapshot, editor.getSnapshot);
  return <CurveControls editor={editor} state={state} busy={busy} />;
}
