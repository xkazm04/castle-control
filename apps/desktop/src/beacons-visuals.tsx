import type { CSSProperties } from 'react';
import { useId } from 'react';
import { StatusChip, WindowedRows } from '@castle-control/ui';
import type { VisualId } from '@castle-control/contract';
import type { PreviewEvent } from './beacons-fixture.js';
import { fixtureVisuals } from './beacons-fixture.js';
import type { PreviewVisual } from './beacons-model.js';
import { beaconsCopy as copy } from './beacons-copy.js';

/** Fixed illustrative art; only --blaze changes as the local input changes.
 * This is not the design-package renderer or a capture from OBS. */
export function BeaconPreview({ item }: { item: PreviewVisual }) {
  const pattern_id = useId();
  const style: CSSProperties & { '--blaze': number } = { '--blaze': item.intensity };
  return <div className="beacons-preview" data-design={item.visual.design_id} style={style}>
    <svg viewBox="0 0 320 180" role="img" aria-label={`Stylised ${item.visual.name} · simulated`}>
      <defs><pattern id={pattern_id} width="6" height="6" patternUnits="userSpaceOnUse">
        <circle cx="1" cy="1" r="1" fill="currentColor" />
      </pattern></defs>
      <path className="beacons-land" d="M0 151 40 130 92 146 140 121 193 142 247 126 320 145V180H0Z" />
      {item.visual.design_id === 'altar' ? <>
        <path className="beacons-stone" d="M95 150h130v12H95Zm16-45h98l-13 34h-72Zm22 34h54v11h-54Z" />
        <path className="beacons-flame" d="M131 105c-30-27 14-41 13-75 26 21 7 35 21 40 7-17 19-22 19-37 34 31 29 53 9 72Z" />
        <path className="beacons-flame-core" d="M150 105c-16-22 16-28 14-50 25 26 25 39 11 50Z" />
      </> : item.visual.design_id === 'camera-frame' ? <>
        <rect className="beacons-stone" x="59" y="31" width="202" height="122" rx="3" />
        <rect className="beacons-paper" x="68" y="40" width="184" height="104" />
        <circle className="beacons-land" cx="160" cy="77" r="17" />
        <path className="beacons-land" d="M124 130c0-47 72-47 72 0Z" />
        <path className="beacons-frame-glow" d="M62 34H258V150H62Z" />
      </> : <>
        <rect className="beacons-stone" x="30" y="24" width="260" height="137" rx="3" />
        <rect className="beacons-paper" x="39" y="33" width="242" height="119" />
        <path className="beacons-frame-glow" d="M33 27H287V158H33Z" />
        <path className="beacons-flame" d="m52 151 12-35 9 17 14-45 15 63Zm163 0 14-47 10 27 14-14 12 34Z" />
      </>}
      <rect width="320" height="180" fill={`url(#${pattern_id})`} className="beacons-halftone" />
    </svg>
  </div>;
}

export function BeaconCards({ visuals, selected, on_select }: {
  visuals: readonly PreviewVisual[]; selected: VisualId; on_select: (id: VisualId) => void;
}) {
  return <div className="beacons-cards" role="group" aria-label={copy.cards}>
    {visuals.map(item => <button type="button" key={item.visual.visual_id} className="beacons-card"
      aria-pressed={selected === item.visual.visual_id} onClick={() => on_select(item.visual.visual_id)}>
      <span className="beacons-card-heading"><b>{item.visual.name}</b><StatusChip variant="or">Fixture</StatusChip></span>
      <BeaconPreview item={item} />
      <strong className="beacons-stage">{item.intensity >= 0.75 ? 'Blazing' : item.intensity >= 0.3 ? 'Kindled' : 'Embers'}</strong>
      <span className="beacons-value"><b>{Math.round(item.intensity * 100)}%</b> blaze · intensity</span>
      <meter min="0" max="1" value={item.intensity} aria-label={`${item.visual.name} intensity`} />
      <span className="beacons-meta">Subs + gift subs · {item.gift_weight}× gift weight<br />
        {item.visual.curve.decay.kind === 'none' ? 'No decay' : `Halves every ${item.visual.curve.decay.half_life_s / 60} min`}</span>
    </button>)}
  </div>;
}

export function BeaconsFeed({ events, scroll_top = 0 }: { events: readonly PreviewEvent[]; scroll_top?: number }) {
  return <WindowedRows rows={events} scroll_top={scroll_top} label={copy.feed_label} row_key={event => event.id}>
    {event => <div className="beacons-event" data-contribution-row={event.id}>
      <time role="cell" dateTime={event.at}>{event.at.slice(11, 19)}</time>
      <span role="cell">{event.burst.source === 'gift' ? 'Gift sub' : 'Subscription'} ×{event.burst.amount}</span>
      <span role="cell">{fixtureVisuals.find(visual => visual.visual_id === event.visual_id)?.name ?? 'Fixture visual'}</span>
      <span role="cell">Simulated</span>
    </div>}
  </WindowedRows>;
}
