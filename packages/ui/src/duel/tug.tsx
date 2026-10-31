import { memo } from 'react';
import { wouldFlip } from '@castle-control/duel/ballots';
import type { Tally } from '@castle-control/duel/ballots';
import type { TiltyardWords } from './words.js';

export const Tug = memo(function Tug({ tally, a, b, words }: {
  tally: Tally; a: string; b: string; words: TiltyardWords; second: number;
}) {
  const barred = tally.barred[0] + tally.barred[1];
  const percent = Math.round(tally.share * 100);
  return <div className="ty-tug" data-role="ty-tug" aria-label={words.chat.tally_label}>
    <div className="ty-tug-bar" data-role="ty-tug-bar">
      <span className="ty-l" data-role="ty-tug-left" style={{ flexGrow: Math.max(tally.share, 0.001) }}>
        {tally.total ? `${percent}%` : ''}</span>
      <span className="ty-r" data-role="ty-tug-right" style={{ flexGrow: Math.max(1 - tally.share, 0.001) }}>
        {tally.total ? `${100 - percent}%` : ''}</span>
      <i className="ty-mid" />
    </div>
    <div className="ty-tug-legend" data-role="ty-tug-legend">
      <span>{words.chat.counted_for} <b>{a}</b>: <b>{tally.counted[0]}</b></span>
      <span><b>{tally.total}</b> {words.chat.one_per_viewer}</span>
      <span>{words.chat.counted_for} <b>{b}</b>: <b>{tally.counted[1]}</b></span>
    </div>
    <div className="ty-barred-strip" data-role="ty-barred">
      <strong>{words.chat.barred}</strong>
      <span className="ty-hatch" data-role="ty-hatch" style={{ width: `calc(var(--space-1) * ${Math.min(260, 2 + barred * 8)})` }} />
      <span>{words.chat.ballots(barred)}</span>
      <span>{words.chat.held} <b>{tally.held}</b>{words.chat.repeats} <b>{tally.repeat}</b>
        {words.chat.bits} <b>{tally.cheers_as_one}</b></span>
    </div>
    <div className="ty-flipnote" data-role="ty-flipnote">
      {barred > 0 ? wouldFlip(tally) ? words.chat.flip(barred, tally.shadow) : words.chat.excluded : ''}
    </div>
  </div>;
});
