import type { BeaconsPort, PreviewVisual } from '../../beacons-model.js';
import { InkButton } from '@castle-control/ui';
import { beaconsCopy as copy } from '../../beacons-copy.js';

export function TestFire({ port, selected, on_end }: { port: BeaconsPort; selected: PreviewVisual; on_end: () => void }) {
  return <section className="visuals-room-test" aria-label={copy.test_label}>
    <div className="visuals-fire-grid">
      <InkButton size="wrap" variant="offset" ink="or" onClick={() => port.fire('gift', 50)}>{copy.fire_gifts}</InkButton>
      <InkButton size="wrap" onClick={() => port.fire('subscribe', 1)}>{copy.fire_sub}</InkButton>
      <InkButton size="wrap" onClick={port.advance}>{copy.advance}</InkButton>
      <InkButton size="wrap" onClick={on_end}>{copy.end}</InkButton>
    </div>
    <output className="visuals-fire-output"><b>{Math.round(selected.intensity * 100)}% {copy.blaze}</b> · {selected.total.toFixed(1)} weighted subs</output>
    <p className="visuals-note">{copy.fire_notice} {copy.fixture_money}</p>
  </section>;
}
