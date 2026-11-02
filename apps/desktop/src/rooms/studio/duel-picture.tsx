import { Shield, tiltyardWords } from '@castle-control/ui/duel';
import { phaseWord, secondsLeft, verdictLine } from './duel-model.js';
import type { DuelPicture } from './duel-model.js';

/** The existing stage's contestants and verdict, presented without operator controls. */
export function DuelPictureView({ picture }: { picture: DuelPicture }) {
  return <div className="duel-picture">
    <p className="duel-picture__label">{picture.source === 'draft' ? 'Draft · not on air' : 'The duel'}
      {picture.simulated && ' · SIMULATED'}</p>
    <div className="duel-picture__pair">
      {[picture.left, picture.right].map((entrant, side) => <div key={side} data-side={side}>
        {entrant ? <><Shield item={{ id: entrant.id, title: entrant.title, by: entrant.by ?? 'streamer' }} words={tiltyardWords} />
          <b>{entrant.title}</b></> : <b>No contestant</b>}
      </div>)}
    </div>
    <p>{picture.phase === 'live' ? `${secondsLeft(picture)} s · ` : ''}{phaseWord(picture)}</p>
    <p>{verdictLine(picture) ?? `${picture.counts[0]} : ${picture.counts[1]}`}</p>
  </div>;
}

export function DuelMini({ picture }: { picture: DuelPicture }) {
  return <div className="duel-mini"><b>{picture.title}</b>
    <p>{phaseWord(picture)} · {picture.counts[0] + picture.counts[1]} counted</p>
  </div>;
}
