import { useMemo, useState } from 'react';
import { SAMPLE } from '@castle-control/duel';
import { simulateChatPages } from '@castle-control/duel/ballots';
import { Tiltyard, tiltyardWords } from '@castle-control/ui/duel';
import type { GatehouseConnection } from '../../client.js';
import { studioCopy as copy } from '../../studio-copy.js';
import { coreBallotFeed } from './tiltyard-feed.js';

/** SAMPLE contestants in both modes; only fixtures generate simulated ballots. */
export default function TiltyardView({ connection }: { connection?: GatehouseConnection }) {
  const [available, setAvailable] = useState(true);
  const feed = useMemo(() => connection ? coreBallotFeed(connection, setAvailable) : undefined, [connection]);
  return <>
    {connection && <p className="studio-tiltyard-sample">{copy.tiltyard_live}</p>}
    {!available && <p role="status">{copy.tiltyard_unavailable}</p>}
    <Tiltyard lists={SAMPLE} {...(feed ? { ballot_feed: feed } : { ballots: simulateChatPages })}
      words={tiltyardWords} label="The Tiltyard, duel stage" />
  </>;
}
