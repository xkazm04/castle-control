import { useState } from 'react';
import { fixtureOfferings } from '../../beacons-fixture.js';
import { CardBody, CardHead, HeraldicCard } from '@castle-control/ui';
import { beaconsCopy as copy } from '../../beacons-copy.js';

export function OfferingTimeline({ selected, on_select }: { selected: number; on_select: (index: number) => void }) {
  const offering = fixtureOfferings[selected];
  return <HeraldicCard variant="panel" className="visuals-room-timeline" aria-label="Illustrative offerings timeline">
    <CardHead title={copy.offerings(fixtureOfferings.length)} gloss={copy.timeline_gloss} />
    <CardBody>
    <svg viewBox="0 0 480 100" role="img" aria-label="60 fictional contributions across 48 minutes">
      <path d="M8 82H472" className="visuals-room-timeline-rule" />
      {fixtureOfferings.map((item, index) => <circle key={item.t} data-offering-mark={index}
        className={selected === index ? 'visuals-room-offering-selected' : 'visuals-room-offering'}
        cx={8 + item.t / 2880 * 464} cy={30 + index % 4 * 12}
        r={Math.min(10, 3 + Math.sqrt(item.amount) / 12)}>
        <title>{`${item.login}: ${item.amount} ${item.kind} at ${Math.floor(item.t / 60)} min · illustrative`}</title>
      </circle>)}
    </svg>
    <div className="visuals-room-time-labels"><span>0 min</span><span>48 min · sample end</span></div>
    <label>Inspect an offering
      <input type="range" min="0" max={fixtureOfferings.length - 1} step="1" value={selected}
        aria-label="Inspect offering" aria-valuetext={offering ? `${selected + 1}: ${offering.amount} ${offering.kind} from ${offering.login}` : ''}
        onChange={event => on_select(event.currentTarget.valueAsNumber)} />
    </label>
    <p className="visuals-readout" role="status" aria-live="polite">{offering && <>
      <b>Offering {selected + 1} of 60 · {Math.floor(offering.t / 60)} min {offering.t % 60} s</b><br />
      {offering.login} · {offering.amount} {offering.kind.replace('_', ' ')} · illustrative
    </>}</p>
    <p className="visuals-note">Bits, gifts, subscriptions, points and Hype Train marks are fictional. This timeline does not feed live accounting.</p>
    </CardBody>
  </HeraldicCard>;
}

export function Offerings() {
  const [selected, setSelected] = useState(fixtureOfferings.length - 1);
  return <OfferingTimeline selected={selected} on_select={setSelected} />;
}
