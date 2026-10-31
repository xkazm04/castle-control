import { InkButton } from '@castle-control/ui';
import type { StudioBoard } from './board.js';
import { rehearseCopy as copy } from './rehearse-copy.js';
import type { RehearseState } from './rehearse-state.js';
import type { RehearseHandlers } from './use-rehearse.js';

/** The brush buttons: one per house, one for unclaimed ground, and the way back to the sample. */
export function PaintPalette({ board, brush, edited, handlers }: {
  board: StudioBoard; brush: string; edited: number; handlers: RehearseHandlers;
}) {
  const choices = [...board.sides.map(side => ({ id: side.id, label: side.label, short: side.short, ink: side.ink })),
    { id: '', label: copy.unclaimed, short: copy.paint_clear, ink: undefined }];
  return <div className="studio-palette" role="group" aria-label={copy.paint_with}>
    {choices.map(choice => <InkButton key={choice.id || 'unclaimed'} size="small" aria-pressed={brush === choice.id}
      aria-label={copy.paint_house(choice.label)} onClick={() => handlers.brush(choice.id)}>
      <span className="studio-swatch" data-ink={choice.ink} data-unclaimed={choice.ink === undefined} aria-hidden="true" />
      {choice.short}
    </InkButton>)}
    <InkButton size="small" aria-label={copy.restore_label(edited)} onClick={handlers.restore_start} disabled={edited === 0}>{copy.restore(edited)}</InkButton>
  </div>;
}

/** What if: one row. Redraw start is a toggle that keeps its place; while it is on, the brushes stand where the
 * comparisons were, so painting never costs the board a line. Every button only reads or redraws the simulation. */
export function RehearseTools({ state, handlers, board, can_compare }: {
  state: RehearseState; handlers: RehearseHandlers; board: StudioBoard; can_compare: boolean;
}) {
  const edited = Object.keys(state.edits?.by ?? {}).length;
  const painting = state.brush !== null;
  const first = board.sides[0]?.id;
  return <div className="studio-rehearse-tools" role="group" aria-label={copy.tools_label}>
    <span className="studio-tools-title">{copy.tools}</span>
    <InkButton size="small" aria-pressed={painting} disabled={first === undefined}
      onClick={() => handlers.brush(painting ? null : first ?? null)}>{copy.redraw}</InkButton>
    {state.brush !== null ? <PaintPalette board={board} brush={state.brush} edited={edited} handlers={handlers} /> : <>
      {can_compare && <InkButton size="small" onClick={handlers.compare}>{copy.compare_sizes}</InkButton>}
      <InkButton size="small" onClick={handlers.compare_crowds}>{copy.compare_crowds}</InkButton>
    </>}
    {edited > 0 && !painting && <span className="studio-tools-edited">{copy.edited_note(edited)}</span>}
  </div>;
}
