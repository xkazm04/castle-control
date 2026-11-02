import { useId, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { FlowChamber, FlowEntry, FlowLine, FlowOption } from './flow.js';
import type { DockStore, FlowSession } from './store.js';
import { SealButton } from '../seal-button.jsx';

export function Sim({ children = 'Simulated' }: { children?: string }) {
  return <span className="cc-sim">{children}</span>;
}

export function Lines({ lines }: { lines: readonly FlowLine[] }) {
  return <dl className="cc-steward-lines">{lines.map(line => <div key={line.label}><dt>{line.label}</dt><dd>{line.value}</dd></div>)}</dl>;
}

function moveFocus(event: KeyboardEvent<HTMLElement>) {
  const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
  if (!step) return;
  const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
  const index = buttons.indexOf(event.target as HTMLButtonElement);
  if (index < 0) return;
  event.preventDefault();
  buttons[(index + step + buttons.length) % buttons.length]?.focus();
}

function Options({ options, value, label, kind, on_pick }: {
  options: readonly FlowOption[]; value: string | undefined; label: string; kind: 'choice' | 'preset'; on_pick: (id: string) => void;
}) {
  return <div className={kind === 'preset' ? 'cc-steward-presets' : 'cc-steward-options'} role="group" aria-label={label}
    data-count={options.length} onKeyDown={moveFocus}>
    {options.map(option => <button key={option.id} type="button" className="cc-steward-option" data-autofocus={value === option.id || undefined}
      aria-pressed={value === option.id} onClick={() => on_pick(option.id)}>
      <span className="cc-steward-option__head"><b>{option.label}</b>
        {option.tag && <span className="cc-steward-option__tag">{option.tag}</span>}
        {option.simulated && <Sim />}</span>
      {option.consequence && <span className="cc-steward-option__line">{option.consequence}</span>}
    </button>)}
  </div>;
}

function FieldCard({ entry, error, on_submit }: { entry: FlowEntry<unknown>; error: string | undefined; on_submit: (raw: string) => void }) {
  const step = entry.step;
  const id = useId();
  const initial = step.kind === 'field' ? entry.value ?? step.initial?.(entry.before) ?? '' : '';
  const [raw, setRaw] = useState(initial);
  if (step.kind !== 'field') return null;
  return <form className="cc-steward-field" onSubmit={event => { event.preventDefault(); on_submit(raw.trim()); }}>
    <label className="cc-steward-field__label" htmlFor={`${id}-input`}>{step.label}</label>
    <div className="cc-steward-field__row">
      <input id={`${id}-input`} className="cc-input" data-autofocus inputMode={step.input === 'number' ? 'numeric' : undefined}
        value={raw} placeholder={step.placeholder} autoComplete="off" aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-note`} onChange={event => setRaw(event.currentTarget.value)} />
      <button type="submit" className="cc-btn cc-btn--primary">Continue</button>
    </div>
    <p id={`${id}-note`} className={error ? 'cc-steward-field__error' : 'cc-steward-field__hint'} role={error ? 'alert' : undefined}>
      {error ?? step.hint ?? 'Press Enter to continue.'}</p>
  </form>;
}

/** One active step: the Steward's line, then the card. */
export function StepCard({ session, entry, chamber, store, on_preview }: {
  session: FlowSession; entry: FlowEntry<unknown>; chamber: FlowChamber; store: DockStore; on_preview?: () => void;
}) {
  const { step } = entry;
  const sealing = session.state.status === 'sealing';
  const reopened = session.state.editing === step.id;
  const card = (() => {
    switch (step.kind) {
      case 'choice': return <Options kind="choice" options={step.options(entry.before)} value={entry.value} label={step.prompt}
        on_pick={id => store.answer(chamber, id)} />;
      case 'preset': return <Options kind="preset" options={step.presets(entry.before)} value={entry.value} label={step.prompt}
        on_pick={id => store.answer(chamber, id)} />;
      case 'field': return <FieldCard key={step.id} entry={entry} error={session.error} on_submit={raw => store.answer(chamber, raw)} />;
      case 'preview': return <div className="cc-steward-preview">
        {step.render && <div className="cc-steward-preview__picture">{step.render(entry.before)}</div>}
        {step.lines && <Lines lines={step.lines(entry.before)} />}
        <div className="cc-steward-card-actions">
          <button type="button" className="cc-btn cc-btn--primary" data-autofocus onClick={() => store.answer(chamber, 'ok')}>{step.continue_label ?? 'Looks right'}</button>
          <button type="button" className="cc-btn cc-btn--quiet" onClick={() => store.back(chamber)}>Change something</button>
        </div>
      </div>;
      case 'confirm': return <div className="cc-steward-confirm">
        <div className="cc-steward-confirm__sheet">
          <span className="cc-steward-confirm__draft">{session.flow.simulated ? <Sim /> : <span className="cc-steward-draft-mark">Draft</span>}</span>
          <Lines lines={step.lines(entry.before)} />
        </div>
        <div className="cc-steward-confirm__seal">
          {on_preview && <button type="button" className="cc-btn" disabled={sealing} onClick={on_preview}>Draft this → Preview</button>}
          <SealButton on_seal={() => { void store.seal(chamber); }} disabled={sealing} />
          <button type="button" className="cc-btn cc-btn--quiet" disabled={sealing} onClick={() => store.close(chamber)}>Withdraw this draft</button>
          <p className="cc-steward-confirm__note">{sealing ? 'Sealing...' : 'waits in Preview · hold Space to seal'}</p>
          {session.error && <p className="cc-steward-field__error" role="alert">{session.error}</p>}
        </div>
      </div>;
    }
  })();
  return <div className="cc-steward-step" data-kind={step.kind} data-step={step.id}>
    <p className="cc-beat cc-beat--steward cc-steward-step__prompt"><i className="cc-beat__mark" aria-hidden="true" />{step.prompt}</p>
    {card}
    {reopened && <button type="button" className="cc-link cc-steward-keep" onClick={() => store.keep(chamber)}>Keep my answer</button>}
  </div>;
}

