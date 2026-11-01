import type { ReactNode } from 'react';
import { Seal } from './seal.jsx';
import type { TiltyardWords } from './words.js';

export function Centre({ round, of, hint, tie, seal, verdict = false, words }: {
  round: string; of: string; hint: ReactNode; tie?: ReactNode; seal?: ReactNode; verdict?: boolean; words: TiltyardWords;
}) {
  return <div className="ty-center">
    <span className="ty-round" data-role="ty-round">{round}</span>
    <Seal enter={!verdict}>{seal ?? <b data-role="ty-seal-vs">{words.vs}</b>}</Seal>
    <span className="ty-of" data-role="ty-of">{of}</span>
    <span className="ty-hint" data-role="ty-hint">{hint}</span>
    {tie && <span className="ty-tie">{tie}</span>}
  </div>;
}
