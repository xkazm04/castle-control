import { CardBody, CardHead, HeraldicCard, RuledFeed, RuledRow, WindowedRows, rowHeight } from '@castle-control/ui';
import { beaconsCopy as copy } from '../../beacons-copy.js';
import type { PreviewEvent } from '../../beacons-fixture.js';
import { source_labels } from './contribution-input.js';
import './event-feed.css';

/** UI history of synthetic inputs only. It is not a contribution ledger. */
export function ContributionFeed({ events, origin, scroll_top = 0 }: {
  events: readonly PreviewEvent[]; origin: 'Local preview' | 'Core simulation'; scroll_top?: number;
}) {
  return <HeraldicCard variant="panel" className="visuals-event-feed" aria-label={copy.feed}>
    <CardHead title={copy.feed} gloss={copy.simulated} />
    <CardBody>
      <p>{copy.feed_notice(events.length, origin)}</p>
      <RuledFeed><WindowedRows rows={events} label={copy.simulated_events} row_key={event => event.id}
        row_height={rowHeight * 1.5} scroll_top={scroll_top} empty_state={copy.no_events}>
        {event => <div className="visuals-event-row" role="presentation" data-contribution-row={event.id}>
          <RuledRow layout="amount" mark={<b>{event.burst.amount}</b>}
          trailing={<time dateTime={event.at} title={event.at}>{event.at.slice(11, 19)} UTC</time>}
          detail={<span title={event.visual_id}>{event.visual_id} · {event.label} · {origin}</span>}>
          {source_labels[event.burst.source]}
          </RuledRow>
        </div>}
      </WindowedRows></RuledFeed>
    </CardBody>
  </HeraldicCard>;
}
