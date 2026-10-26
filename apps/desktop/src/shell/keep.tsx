import { chambers, InkButton } from '@castle-control/ui';
import type { ModuleId } from '@castle-control/ui';
import './surfaces.css';

export default function Keep({ on_open, on_enter }: { on_open: (id: ModuleId) => void; on_enter: () => void }) {
  return <section className="shell-keep" aria-label="The keep">
    <header className="shell-surface-title"><p>Your channel is your keep.</p><h1>The keep</h1>
      <p>Four rooms. One Steward. Room illustrations arrive in the next wave.</p></header>
    <div className="shell-room-tiles">{chambers.map(chamber =>
      <button type="button" className="shell-room-tile" data-module={chamber.id} data-room-tile={chamber.id} key={chamber.id}
        onClick={() => on_open(chamber.id)}>
        <span className="shell-tile-key">{chamber.number}</span><strong>{chamber.name}</strong>
        <span>{chamber.description}</span><span>Room preview · sample data</span>
      </button>)}</div>
    <InkButton variant="primary" onClick={on_enter}>Enter the keep <kbd>0</kbd></InkButton>
  </section>;
}
