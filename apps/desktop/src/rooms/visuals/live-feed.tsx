import { WindowedRows, rowHeight } from '@castle-control/ui';
import type { CoreBeaconsSnapshot } from '../../beacons-core.js';
import { source_labels } from './contribution-input.js';
import './event-feed.css';

/** Read-only recent contributions, in core-returned order, separate from test fires. */
export function LiveContributionFeed({ read, on_refresh, scroll_top = 0 }: {
  read: CoreBeaconsSnapshot['contributions']; on_refresh: () => void; scroll_top?: number;
}) {
  return <section className="visuals-event-feed" aria-label="Live contribution feed" aria-busy={read.phase === 'loading'}>
    <h3>Contribution feed · live from core</h3>
    <button type="button" disabled={read.phase === 'loading'} onClick={on_refresh}>Refresh live contributions</button>
    {read.phase === 'ready' ? <>
      <p>{read.items.length} recent contribution{read.items.length === 1 ? '' : 's'} · newest first. Refresh for current data.</p>
      <WindowedRows rows={read.items} label="Live Beacons contribution events" row_key={event => event.event_id}
        row_height={rowHeight * 3} scroll_top={scroll_top} empty_state="No live contributions in the core read.">
        {event => <div className="visuals-event-row" role="cell" data-live-contribution-row={event.event_id}>
          <strong>{event.amount} {source_labels[event.source]}</strong>
          {event.user_id !== undefined && <span className="visuals-event-detail">user ID {event.user_id}</span>}
        </div>}
      </WindowedRows>
    </> : <p role="status" aria-live="polite">{read.phase === 'error'
      ? 'Live contribution feed unavailable. Refresh to try again; no simulated rows were substituted.'
      : read.phase === 'loading' ? 'Loading live contributions from the core.'
        : 'Live contributions have not been loaded. Refresh to read from core.'}</p>}
  </section>;
}
