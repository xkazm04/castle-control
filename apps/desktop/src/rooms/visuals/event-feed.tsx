import { WindowedRows, rowHeight } from '@castle-control/ui';
import type { PreviewEvent } from '../../beacons-fixture.js';
import { source_labels } from './contribution-input.js';
import './event-feed.css';

/** UI history of synthetic inputs only. It is not a contribution ledger. */
export function ContributionFeed({ events, origin, scroll_top = 0 }: {
  events: readonly PreviewEvent[]; origin: 'Local preview' | 'Core simulation'; scroll_top?: number;
}) {
  return <section className="visuals-event-feed" aria-label="Contribution feed">
    <h3>Contribution feed · simulated</h3>
    <p>{events.length} simulated event{events.length === 1 ? '' : 's'} · {origin}. These inputs are not live accounting.</p>
    <WindowedRows rows={events} label="Simulated Beacons contribution events" row_key={event => event.id}
      row_height={rowHeight * 3} scroll_top={scroll_top}
      empty_state="No simulated contributions yet. Run a test fire to add one.">
      {event => <div className="visuals-event-row" role="cell" data-contribution-row={event.id}>
        <strong>{event.burst.amount} {source_labels[event.burst.source]}</strong>
        <span className="visuals-event-detail" title={event.visual_id}>{event.visual_id}</span>
        <span className="visuals-event-detail"><time dateTime={event.at} title={event.at}>{event.at.slice(11, 19)} UTC</time>
          {' · '}{event.label} · {origin}</span>
      </div>}
    </WindowedRows>
  </section>;
}
