import { createBallotFeed } from '@castle-control/duel';
import type { TiltyardProps } from '@castle-control/ui/duel';
import type { GatehouseConnection } from '../../client.js';
import { createCoreGatehousePort } from '../../gatehouse-core.js';

/** Reuse the desktop's sole event socket and Gatehouse contract call path. */
export function coreBallotFeed(connection: GatehouseConnection, on_available: (available: boolean) => void): NonNullable<TiltyardProps['ballot_feed']> {
  connection.port ??= createCoreGatehousePort(connection.launch, connection.transport);
  const port = connection.port;
  return (_window, on_ballots) => {
    let active = true;
    const feed = createBallotFeed({
      read: async cursor => {
        const result = await port.readChat(cursor);
        if (active) on_available(true);
        return result;
      },
      timers: { set: (ms, fn) => setTimeout(fn, ms), clear: handle => clearTimeout(handle) },
      on_ballots,
      on_error: () => { if (active) on_available(false); },
    });
    const unsubscribe = connection.subscribeEvents(kind => feed.signal(kind));
    feed.open();
    return () => { active = false; unsubscribe(); feed.close(); };
  };
}
