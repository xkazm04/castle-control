import { chambers } from './shell.jsx';
import type { ModuleId } from './primitives.jsx';
import './chamber-strip.css';

export type ChamberLayerState = { line: string; on_air: boolean; preview: boolean; draft: boolean };
export type ChamberStripProps = {
  selected: ModuleId; states: Readonly<Record<ModuleId, ChamberLayerState>>;
  on_select: (id: ModuleId) => void; on_open: (id: ModuleId) => void;
};

/** Enter is dispatched by the app's shared keymap, never a second registry. */
export function ChamberStrip({ selected, states, on_select, on_open }: ChamberStripProps) {
  return <nav className="cc-chamber-strip" aria-label="Chamber strip">{chambers.map(chamber => {
    const state = states[chamber.id];
    return <button type="button" className="cc-chamber-tile" data-module={chamber.id} data-room-tile={chamber.id}
      key={chamber.id} aria-pressed={selected === chamber.id} onFocus={() => on_select(chamber.id)}
      onClick={() => on_select(chamber.id)} onDoubleClick={() => on_open(chamber.id)}>
      <span className="cc-chamber-tile-title"><b>{chamber.name}</b><kbd>{chamber.number}</kbd></span>
      <span className="cc-chamber-state">{state.line}</span>
      <span className="cc-layer-lamps">{([
        ['On air', state.on_air], ['Preview', state.preview], ['Draft', state.draft],
      ] as const).map(([label, on]) => <span key={label} data-lit={on}>{label}</span>)}</span>
    </button>;
  })}</nav>;
}
