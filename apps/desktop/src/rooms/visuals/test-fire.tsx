import type { BeaconsPort, PreviewVisual } from '../../beacons-model.js';

export function TestFire({ port, selected, on_end }: { port: BeaconsPort; selected: PreviewVisual; on_end: () => void }) {
  return <section className="visuals-room-test" aria-label="Simulated local test fire">
    <h3>Test fire · local preview only</h3>
    <p>Nothing reaches the stream. A viewer-facing change requires the shared hold to seal and proclaim.</p>
    <div className="visuals-room-tools">
      <button type="button" onClick={() => port.fire('gift', 50)}>Test fire: 50 gifts</button>
      <button type="button" onClick={() => port.fire('subscribe', 1)}>Test fire: 1 sub</button>
      <button type="button" onClick={port.advance}>Advance simulated clock 60 s</button>
      <button type="button" onClick={on_end}>End test fire</button>
    </div>
    <p><strong>{Math.round(selected.intensity * 100)}% blaze</strong> · {selected.total.toFixed(1)} weighted subs</p>
  </section>;
}
