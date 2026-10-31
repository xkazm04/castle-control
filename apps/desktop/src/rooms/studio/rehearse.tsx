import type { FormEvent } from 'react';
import type { DesignOutput } from '@castle-control/ui/design';
import { FieldGroup, InkButton, Notice } from '@castle-control/ui';
import { boardGeometry } from './board.js';
import type { StudioBoard } from './board.js';
import { HexTable } from './hex-table.jsx';
import { rehearsalLimits } from './rehearsal.js';
import type { RehearsalField } from './rehearsal.js';
import { rehearseCopy as copy } from './rehearse-copy.js';
import { turnLine } from './rehearse-state.js';
import type { RehearseState, RehearseView } from './rehearse-state.js';
import type { RehearseHandlers } from './use-rehearse.js';
import type { MapSize } from './session.js';
import './rehearse.css';

export type RehearseProps = Readonly<{
  state: RehearseState; view: RehearseView; handlers: RehearseHandlers; board: StudioBoard; size: MapSize;
  look?: DesignOutput['style'];
}>;

/** The loud label. It is rendered unconditionally by every state of the Rehearse view. */
export function SimulatedBand() {
  return <p className="studio-sim-band" role="note" aria-label={copy.band_label} data-simulated="rehearsal">{copy.band}</p>;
}

type Fact = Readonly<{ short: string; held: number; ink?: string; label?: string }>;
export function HeldRibbon({ facts, unclaimed, total, percent }: {
  facts: readonly Fact[]; unclaimed: number; total: number; percent: boolean;
}) {
  const text = (name: string, held: number) => percent ? copy.held_pct(name, held, Math.round(held / total * 100)) : copy.held_text(name, held);
  return <div className="studio-ribbon-block">
    <p className="studio-ribbon-title studio-visually-hidden">{copy.ribbon}</p>
    <ol className="studio-ribbon" aria-label={copy.ribbon_label}>
      {facts.map(fact => <li key={fact.short} data-house={fact.label} data-ink={fact.ink} style={{ flexGrow: fact.held }}>
        <span>{text(fact.short, fact.held)}</span>
      </li>)}
      {unclaimed > 0 && <li data-house="unclaimed" data-unclaimed="true" style={{ flexGrow: unclaimed }}><span>{text(copy.unclaimed, unclaimed)}</span></li>}
    </ol>
  </div>;
}

const fieldProps = (id: RehearsalField, state: RehearseState) => ({
  id: `studio-rehearse-${id}`, value: state.inputs[id], 'aria-invalid': state.error?.field === id,
  'aria-describedby': `studio-rehearse-${id}-hint${state.error?.field === id ? ' studio-rehearse-error' : ''}`,
});

export function RehearseControls({ state, view, handlers }: Pick<RehearseProps, 'state' | 'view' | 'handlers'>) {
  const { run, playing } = state; const finished = run !== null && view.done;
  const { viewers, turns } = rehearsalLimits;
  const submit = (event: FormEvent) => { event.preventDefault(); handlers.start(); };
  return <form className="studio-rehearse-controls" aria-label={copy.controls} onSubmit={submit} noValidate>
    <div className="studio-rehearse-fields">
      <FieldGroup control_id="studio-rehearse-viewers" label={copy.viewers} hint={copy.viewers_hint(viewers.min, viewers.max)}>
        <input type="number" title={copy.viewers_hint(viewers.min, viewers.max)} inputMode="numeric" min={viewers.min} max={viewers.max} step={1} {...fieldProps('viewers', state)}
          onChange={event => handlers.input('viewers', event.currentTarget.value)} />
      </FieldGroup>
      <FieldGroup control_id="studio-rehearse-seed" label={copy.seed} hint={copy.seed_hint}>
        <input type="text" title={copy.seed_hint} maxLength={rehearsalLimits.seed_length} autoComplete="off" spellCheck={false} {...fieldProps('seed', state)}
          onChange={event => handlers.input('seed', event.currentTarget.value)} />
      </FieldGroup>
      <FieldGroup control_id="studio-rehearse-turns" label={copy.turns} hint={copy.viewers_hint(turns.min, turns.max)}>
        <input type="number" title={copy.viewers_hint(turns.min, turns.max)} inputMode="numeric" min={turns.min} max={turns.max} step={1} {...fieldProps('turns', state)}
          onChange={event => handlers.input('turns', event.currentTarget.value)} />
      </FieldGroup>
    </div>
    {state.error && <p id="studio-rehearse-error" className="studio-rehearse-error" role="alert">{state.error.message}</p>}
    <div className="studio-rehearse-actions">
      {finished ? <InkButton variant="primary" size="small" onClick={handlers.again}>{copy.again}</InkButton>
        : playing ? <InkButton variant="primary" size="small" onClick={handlers.pause}>{copy.pause}</InkButton>
          : run ? <InkButton variant="primary" size="small" onClick={handlers.resume}>{copy.resume}</InkButton>
            : <InkButton variant="primary" size="small" onClick={handlers.start}>{copy.play}</InkButton>}
      <InkButton size="small" onClick={handlers.step} disabled={finished}>{copy.step}</InkButton>
      <InkButton size="small" onClick={handlers.reset} disabled={run === null}>{copy.reset}</InkButton>
      {run && <span className="studio-rehearse-progress">{copy.progress(state.turn, view.of)}</span>}
    </div>
  </form>;
}

export function RehearseWork({ state, view, handlers, board, size, look }: RehearseProps) {
  const { run, turn } = state;
  const start = boardGeometry(run?.start ?? board);
  const facts: Fact[] = start.sides.map(side => ({ short: side.short, label: side.label, ink: side.ink,
    held: view.turn ? view.turn.held[side.id] ?? 0 : side.count }));
  const unclaimed = view.turn ? view.turn.unclaimed : start.unclaimed;
  const last = view.turn;
  const line = run && last ? turnLine(run, last) : '';
  const message = !run ? copy.idle_hint : !last ? copy.idle_hint
    : view.done && view.report ? copy.announce_done(line, view.report.verdict) : line;
  return <section className="studio-rehearse" aria-label={copy.work} data-turn={turn} data-playing={state.playing}>
    <SimulatedBand />
    <RehearseControls state={state} view={view} handlers={handlers} />
    <HexTable board={view.shown} selected={state.selected} on_select={handlers.select} size={size}
      {...(look ? { look } : {})} flip={{ ids: view.flipped, phase: view.phase }}
      gloss={copy.board_gloss(turn, view.of)} pennants={false} />
    <div className="studio-rehearse-now">
      <Notice message={message} label={copy.log_label} className="studio-rehearse-line" />
      {last && <p className="studio-rehearse-turn">{copy.this_turn(last.changes.length)} {copy.only_picked}</p>}
    </div>
    <HeldRibbon facts={facts} unclaimed={unclaimed} total={start.tiles.length} percent={view.done} />
  </section>;
}
