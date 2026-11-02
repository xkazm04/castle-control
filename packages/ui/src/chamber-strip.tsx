import { chambers } from './shell.jsx';
import type { ModuleId } from './primitives.jsx';
import { Kbd } from './kbd.jsx';
import './chamber-strip.css';

export type ChamberLayerState = { line: string; word?: string; on_air: boolean; preview: boolean; draft: boolean; pending_count?: number; needs_you?: boolean };
export type ChamberStripProps = {
  selected: ModuleId; states: Readonly<Record<ModuleId, ChamberLayerState>>;
  on_select: (id: ModuleId) => void; on_open: (id: ModuleId) => void;
  current?: ModuleId | 'keep'; on_keep?: () => void;
};

/** Enter is dispatched by the app's shared keymap, never a second registry. */
export function ChamberStrip({ selected, states, on_select, on_open, current, on_keep }: ChamberStripProps) {
  const tiles = chambers.map(chamber => {
    const state = states[chamber.id];
    const count = state.pending_count ?? 0;
    const proposals = count === 0 ? 'no proposals' : `${count} ${count === 1 ? 'proposal' : 'proposals'}`;
    const state_id = `chamber-strip-${chamber.id}-state`;
    const lamps_id = `chamber-strip-${chamber.id}-lamps`;
    const lamps = [state.on_air ? 'On air' : '', state.preview ? 'Preview' : '', state.draft ? 'Draft pending' : ''].filter(Boolean);
    const lamp_summary = lamps.map((label, index) => index === 0 ? label : label.toLowerCase()).join(', ') || 'No active layers';
    return <button type="button" className="cc-chamber-tile" data-module={chamber.id} data-room-tile={chamber.id}
      key={chamber.id} data-role="room-tab" data-needs-you={state.needs_you || undefined}
      aria-label={`${chamber.name}, ${proposals}`} aria-pressed={selected === chamber.id} onFocus={() => on_select(chamber.id)}
      aria-current={current === chamber.id ? 'page' : undefined}
      aria-describedby={`${lamps_id} ${state_id}`} onClick={() => on_select(chamber.id)} onDoubleClick={() => on_open(chamber.id)}>
      <Kbd>{chamber.number}</Kbd><b className="cc-chamber-tile-title">{chamber.name}</b>
      <span className="cc-chamber-state" id={state_id}>{state.word ?? state.line}</span>
      {state.needs_you && <span className="cc-room-needs">needs you</span>}
      {count > 0 && <span className="cc-room-drafts">{count} draft{count === 1 ? '' : 's'}</span>}
      <span className="cc-layer-lamps">{([
        ['On air', state.on_air], ['Preview', state.preview], ['Draft', state.draft],
      ] as const).map(([label, on]) => <span key={label} data-lit={on} aria-hidden="true">{label}</span>)}
        <span className="cc-chamber-lamp-summary" id={lamps_id}>{lamp_summary}</span>
      </span>
    </button>;
  });
  if (on_keep) tiles.unshift(<button type="button" className="cc-chamber-tile cc-keep-tile" key="keep"
    data-room-tile="keep" aria-current={current === 'keep' ? 'page' : undefined} data-role="room-tab" onClick={on_keep}>
    <Kbd>0</Kbd><b className="cc-chamber-tile-title">The Keep</b>
    <span className="cc-chamber-state">home · all four rooms</span>
  </button>);
  return <nav className="cc-chamber-strip" data-role="room-bar" aria-label="Chamber strip">{tiles}</nav>;
}
