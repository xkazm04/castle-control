import { chambers } from '@castle-control/ui';
import type { ModuleId } from '@castle-control/ui';
import './surfaces.css';

export default function Overview({ selected, on_select, on_open }: {
  selected: ModuleId; on_select: (id: ModuleId) => void; on_open: (id: ModuleId) => void;
}) {
  return <section className="shell-overview" aria-label="Overview">
    <header className="shell-surface-title"><h1>Preview and Proclaim</h1><p>Select a chamber. Enter or double-click opens its room.</p></header>
    <div className="shell-preview" role="img" aria-label="Stream preview placeholder, sample data, not on air">
      <strong>Stream preview</strong><span>16:9 · SAMPLE DATA · NOT ON AIR</span>
      <span>The preview and Program monitor arrive in the next wave.</span>
    </div>
    <nav className="shell-chamber-strip" aria-label="Chamber strip">{chambers.map(chamber =>
      <button type="button" className="shell-room-tile" data-module={chamber.id} data-room-tile={chamber.id} key={chamber.id}
        aria-pressed={selected === chamber.id} onFocus={() => on_select(chamber.id)} onClick={() => on_select(chamber.id)}
        onDoubleClick={() => on_open(chamber.id)}>
        <span className="shell-tile-key">{chamber.number}</span><strong>{chamber.name}</strong><span>Sample layer · not on air</span>
      </button>)}</nav>
  </section>;
}
