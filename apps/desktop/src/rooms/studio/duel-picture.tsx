import { SHIELD_PATH } from '@castle-control/duel';
import { Shield, tiltyardWords } from '@castle-control/ui/duel';
import { phaseWord, secondsLeft, verdictLine } from './duel-model.js';
import type { DuelPicture } from './duel-model.js';

/** The on-air duel scene: the question, two shields facing off across a medallion, and the tally. */
const SAMPLE_PREFIX = 'Sample: ';
/** A contestant's name. Core sample data prefixes every title with "Sample: "; that prefix is kept in the text
 * (the label must stay visible) but set as a quiet tag so the name itself reads first. */
export function DuelName({ title }: { title: string }) {
  if (!title.startsWith(SAMPLE_PREFIX) || title.length === SAMPLE_PREFIX.length) return <>{title}</>;
  return <><span className="duel-name__tag">{SAMPLE_PREFIX}</span>{title.slice(SAMPLE_PREFIX.length)}</>;
}

export function DuelPictureView({ picture }: { picture: DuelPicture }) {
  const [left, right] = picture.counts;
  const total = left + right;
  const share = total ? left / total : 0.5;
  const verdict = verdictLine(picture);
  const winner = picture.verdict?.side ?? (picture.phase === 'done' && picture.champion
    ? picture.left?.id === picture.champion.id ? 0 : picture.right?.id === picture.champion.id ? 1 : undefined : undefined);
  return <div className="duel-picture" data-phase={picture.phase}>
    <p className="duel-picture__label">{picture.source === 'draft' ? 'Draft · not on air' : 'The duel'}
      {picture.simulated && ' · SIMULATED'}</p>
    <p className="duel-picture__question">{picture.prompt ?? picture.title}</p>
    <div className="duel-picture__pair">
      {[picture.left, picture.right].map((entrant, side) => <div key={side} className="duel-picture__side" data-side={side}
        data-result={winner === undefined ? undefined : winner === side ? 'won' : 'lost'}>
        {entrant ? <><Shield item={{ id: entrant.id, title: entrant.title, by: entrant.by ?? 'streamer' }} words={tiltyardWords} />
          <b><DuelName title={entrant.title} /></b></> : <><svg className="duel-picture__vacant" viewBox="0 0 100 120" aria-hidden="true">
            <path d={SHIELD_PATH} /></svg><b>No contestant</b></>}
      </div>)}
      <span className="duel-picture__vs" aria-hidden="true">vs</span>
    </div>
    <div className="duel-picture__tally" data-empty={total === 0 || undefined} hidden={picture.phase === 'empty'}>
      <b data-side="0">{left}</b>
      <span className="duel-picture__bar" aria-hidden="true">
        <i data-side="0" style={{ flexGrow: Math.max(share, 0.001) }} />
        <i data-side="1" style={{ flexGrow: Math.max(1 - share, 0.001) }} />
      </span>
      <b data-side="1">{right}</b>
    </div>
    <p className="duel-picture__status">{picture.phase === 'live' ? `${secondsLeft(picture)} s · ` : ''}{phaseWord(picture)}
      {verdict && <> · <strong>{verdict}</strong></>}
      {picture.phase === 'done' && picture.champion && <> · <strong>Champion: {picture.champion.title}</strong></>}</p>
  </div>;
}

/** One short word so the Preview/Program card stays two lines at 1280x720. */
function miniWord(picture: DuelPicture): string {
  if (picture.source === 'draft') return 'Draft';
  switch (picture.phase) {
    case 'ready': return 'Ready';
    case 'live': return 'Voting';
    case 'verdict': return 'Decided';
    case 'called_off': return 'Paused';
    case 'done': return 'Crowned';
    case 'empty': return 'No duel';
  }
}

export function DuelMini({ picture }: { picture: DuelPicture }) {
  return <div className="duel-mini"><b>{picture.title}</b>
    <p>{miniWord(picture)} · {picture.counts[0] + picture.counts[1]} counted</p>
  </div>;
}
