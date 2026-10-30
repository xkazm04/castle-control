import { CardBody, CardHead, HeraldicCard, RuledFeed, RuledRow, WindowedRows, rowHeight } from '@castle-control/ui';
import { beaconsCopy as copy } from '../../beacons-copy.js';
import type { CoreBeaconsSnapshot } from '../../beacons-core.js';
import { source_labels } from './contribution-input.js';
import './event-feed.css';

/** Read-only recent contributions, in core-returned order, separate from test fires. */
export function LiveContributionFeed({ read, on_refresh, scroll_top = 0 }: {
  read: CoreBeaconsSnapshot['contributions']; on_refresh: () => void; scroll_top?: number;
}) {
  return <HeraldicCard variant="panel" className="visuals-event-feed" aria-label="Live contribution feed" aria-busy={read.phase === 'loading'}>
    <CardHead title={copy.live_heading} />
    <CardBody>
    <button type="button" disabled={read.phase === 'loading'} onClick={on_refresh}>Refresh live contributions</button>
    {read.phase === 'ready' ? <>
      <p>{read.items.length} recent contribution{read.items.length === 1 ? '' : 's'} · newest first. Refresh for current data.</p>
      <RuledFeed><WindowedRows rows={read.items} label="Live Beacons contribution events" row_key={event => event.event_id}
        row_height={rowHeight * 1.5} scroll_top={scroll_top} empty_state="No live contributions in the core read.">
        {event => <div className="visuals-event-row" role="presentation" data-live-contribution-row={event.event_id}>
          <RuledRow layout="amount" mark={<b>{event.amount}</b>}
          {...(event.user_id !== undefined ? { detail: <span>user ID {event.user_id}</span> } : {})}>
          {source_labels[event.source]}
          </RuledRow>
        </div>}
      </WindowedRows></RuledFeed>
    </> : <p role="status" aria-live="polite">{read.phase === 'error'
      ? 'Live contribution feed unavailable. Refresh to try again; no simulated rows were substituted.'
      : read.phase === 'loading' ? 'Loading live contributions from the core.'
        : 'Live contributions have not been loaded. Refresh to read from core.'}</p>}
    </CardBody>
  </HeraldicCard>;
}
