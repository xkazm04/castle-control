import type { ReactNode } from 'react';
import type { DuelMode } from './types.js';
import type { TiltyardWords } from './words.js';

export const duelModes = ['show', 'chat', 'ladder'] as const;
export function Pennants({ mode, words, on_mode, children, modes = duelModes }: {
  mode: DuelMode; words: TiltyardWords; on_mode: (mode: DuelMode) => void; children: ReactNode;
  modes?: readonly DuelMode[];
}) {
  return <div className="ty-pennants" data-role="ty-pennants" role="group" aria-label={words.mode_label}>
    {modes.map(id => <button className="ty-pennant" data-role="ty-pennant" type="button" key={id}
      data-mode={id} aria-pressed={mode === id} onClick={() => on_mode(id)}>
      <b><i>{words.modes[id].number}</i>{words.modes[id].title}</b><span>{words.modes[id].detail}</span>
    </button>)}
    {children}
  </div>;
}
