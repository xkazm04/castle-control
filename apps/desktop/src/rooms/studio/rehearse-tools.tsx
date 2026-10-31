import { InkButton } from '@castle-control/ui';
import type { StudioBoard } from './board.js';
import { rehearseCopy as copy } from './rehearse-copy.js';
import type { RehearseState } from './rehearse-state.js';
import type { RehearseHandlers } from './use-rehearse.js';

/** The brush row: one button per house, one for unclaimed ground, and the way out. */
export function PaintPalette({ board, brush, edited, handlers }: {
  board: StudioBoard; brush: string; edited: number; handlers: RehearseHandlers;
}) {
  const choices = [...board.sides.map(side => ({ id: side.id, label: side.label, short: side.short, ink: side.ink })),
    { id: '', label: copy.unclaimed, short: copy.paint_clear, ink: undefined }];
  return <div className="studio-palette" role="group" aria-label={copy.paint_with}>
    <span className="studio-palette-label" aria-hidden="true">{copy.paint_with}</span>
    {choices.map(choice => <InkButton key={choice.id || 'unclaimed'} size="small" aria-pressed={brush === choice.id}
      aria-label={copy.paint_house(choice.label)} onClick={() => handlers.brush(choice.id)}>
      <span className="studio-swatch" data-ink={choice.ink} data-unclaimed={choice.ink === undefined} aria-hidden="true" />
      {choice.short}
    </InkButton>)}
    <InkButton size="small" onClick={handlers.restore_start} disabled={edited === 0}>{copy.restore}</InkButton>
    <InkButton size="small" onClick={() => handlers.brush(null)}>{copy.paint_done}</InkButton>
  </div>;
}

/** What if: change the board or the crowd, then rehearse again. Every button here only reads or redraws the simulation. */
export function RehearseTools({ state, handlers, board, can_compare }: {
  state: RehearseState; handlers: RehearseHandlers; board: StudioBoard; can_compare: boolean;
}) {
  const edited = Object.keys(state.edits?.by ?? {}).length;
  const first = board.sides[0]?.id;
  return <div className="studio-rehearse-tools" role="group" aria-label={copy.tools_label}>
    <div className="studio-tools-row">
      <span className="studio-tools-title">{copy.tools}</span>
      {can_compare && <InkButton size="small" onClick={handlers.compare}>{copy.compare_sizes}</InkButton>}
      <InkButton size="small" onClick={handlers.compare_crowds}>{copy.compare_crowds}</InkButton>
      <InkButton size="small" aria-pressed={state.brush !== null} disabled={first === undefined}
        onClick={() => handlers.brush(state.brush === null ? first ?? null : null)}>{copy.redraw}</InkButton>
      {edited > 0 && <span className="studio-tools-edited">{copy.edited_note(edited)}</span>}
    </div>
    {state.brush !== null && <PaintPalette board={board} brush={state.brush} edited={edited} handlers={handlers} />}
  </div>;
}
