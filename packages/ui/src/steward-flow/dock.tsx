import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import type { KeyboardEvent, ReactNode, Ref, RefObject } from 'react';
import { SealButton } from '../seal-button.jsx';
import { walkFlow } from './flow.js';
import type { FlowChamber, FlowEntry, FlowLine, FlowOption } from './flow.js';
import { matchIntent } from './intent.js';
import { awayChips, chamberChips, chamberFlows, chipFlow, findFlow } from './registry.js';
import { chipKey, FlowMenu } from './flow-menu.jsx';
import { WorkCard } from './work-card.jsx';
import type { StewardChip, StewardRegistry } from './registry.js';
import { stewardDock } from './store.js';
import type { Beat, DockStore, FlowSession } from './store.js';
import './dock.css';

export type UnmatchedReply = { reply: string; live?: boolean };
export type StewardDockProps = {
  chamber: FlowChamber;
  registry: StewardRegistry;
  mode?: 'simulated' | 'live';
  /** Under the name: "simulated co-pilot · sample data", "Drafting"... */
  role?: string;
  input_ref?: Ref<HTMLInputElement>;
  store?: DockStore;
  /** Text no flow matched: the existing engine may answer (live or simulated). */
  on_unmatched?: (text: string) => Promise<UnmatchedReply>;
  /** A chip that belongs to another chamber: go there first, then the flow opens. */
  on_chamber?: (chamber: FlowChamber) => void;
  /** A pending engine proposal, shown at the dock's end. */
  proposal?: ReactNode;
};

function Niche() {
  return <svg className="cc-steward__niche" viewBox="0 0 44 62" aria-hidden="true" focusable="false">
    <path className="cc-niche-arch" d="M3 61V24C3 12 12 4 22 1c10 3 19 11 19 23v37Z" />
    <path className="cc-niche-glass" d="M8 58V26c0-9 6-15 14-18 8 3 14 9 14 18v32Z" />
    <path className="cc-niche-lead" d="M8 40h28M22 8v50" />
    <ellipse className="cc-niche-glow" cx="22" cy="31" rx="11" ry="14" />
    <rect className="cc-niche-candle" x="18.5" y="34" width="7" height="16" />
    <path className="cc-flame" d="M22 21c4 5 5 9 0 12-5-3-4-7 0-12Z" />
    <path className="cc-niche-sill" d="M12 52h20" />
  </svg>;
}

function Sim({ children = 'Simulated' }: { children?: string }) {
  return <span className="cc-sim">{children}</span>;
}

function Lines({ lines }: { lines: readonly FlowLine[] }) {
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
      aria-pressed={value === option.id} disabled={option.disabled} data-picture={option.picture ? '' : undefined} onClick={() => on_pick(option.id)}>
      {option.picture && <img className="cc-steward-option__picture" src={option.picture.src} alt={option.picture.alt} loading="lazy" />}
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
  const suggestions = step.suggestions?.(entry.before) ?? [];
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
    {suggestions.length > 0 && <span className="cc-steward-field__chips" role="group" aria-label={`${step.label} suggestions`}>
      {suggestions.map(text => <button key={text} type="button" className="cc-btn cc-btn--quiet cc-btn--sm" onClick={() => on_submit(text)}>{text}</button>)}
    </span>}
  </form>;
}

/** One active step: the Steward's line, then the card. */
function StepCard({ session, entry, chamber, store }: { session: FlowSession; entry: FlowEntry<unknown>; chamber: FlowChamber; store: DockStore }) {
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
          {step.actions?.(entry.before).map(action => <button key={action.step} type="button" className="cc-btn cc-btn--quiet"
            onClick={() => store.reopen(chamber, action.step)}>{action.label}</button>)}
          <button type="button" className="cc-btn cc-btn--quiet" onClick={() => store.back(chamber)}>Change something</button>
        </div>
      </div>;
      case 'work': return <WorkCard entry={entry} work={session.work?.step === step.id ? session.work : undefined}
        on_cancel={() => store.cancel(chamber)} on_retry={() => store.retry(chamber)} on_back={() => store.back(chamber)} />;
      case 'confirm': return <div className="cc-steward-confirm">
        <div className="cc-steward-confirm__sheet">
          <span className="cc-steward-confirm__draft">{session.flow.simulated ? <Sim /> : <span className="cc-steward-draft-mark">Draft</span>}</span>
          <Lines lines={step.lines(entry.before)} />
        </div>
        <div className="cc-steward-confirm__seal">
          <SealButton on_seal={() => { void store.seal(chamber); }} disabled={sealing} />
          <p className="cc-steward-confirm__note">{sealing ? 'Sealing...' : step.note ?? 'Nothing acts until you hold. Release early to cancel.'}</p>
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

function BeatLine({ beat, on_chip }: { beat: Beat; on_chip: (chip: StewardChip) => void }) {
  if (beat.who === 'you') return <p className="cc-beat cc-beat--you"><span className="cc-sr">You: </span>{beat.text}</p>;
  return <div className={`cc-beat cc-beat--steward${beat.sealed ? ' cc-beat--sealed' : ''}`}>
    <p><i className="cc-beat__mark" aria-hidden="true" />{beat.text}
      {beat.simulated && <> <Sim /></>}{beat.live && <span className="cc-steward-live-tag"> · live</span>}</p>
    {beat.lines && <Lines lines={beat.lines} />}
    {beat.chips && beat.chips.length > 0 && <span className="cc-steward-beat-chips">
      {beat.chips.map(chip => <button key={chip.label} type="button" className="cc-btn cc-btn--quiet cc-btn--sm" onClick={() => on_chip(chip)}>{chip.label}</button>)}
    </span>}
  </div>;
}

function focusCard(root: RefObject<HTMLElement | null>) {
  const card = root.current?.querySelector('.cc-steward-step');
  const target = card?.querySelector<HTMLElement>('[data-autofocus]') ?? card?.querySelector<HTMLElement>('button:not(:disabled), input');
  target?.focus({ preventScroll: true });
}

/**
 * The Steward's dock: collapsed it is the sill (plate, one line, input, chips);
 * a chip, a matched phrase or a resumed draft raises it into the sheet.
 */
/** --m-exit: how long a lowered sheet keeps its place while it fades out (instant under reduced motion or without a window). */
const sheetExitMs = 180;

/** True while `open`, and for `ms` after it turns false so the exit animation can play. */
function useLingering(open: boolean, ms: number): boolean {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) { setMounted(true); return; }
    if (!mounted) return;
    const still = typeof window === 'undefined' || typeof window.matchMedia !== 'function'
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still) { setMounted(false); return; }
    const timer = setTimeout(() => { setMounted(false); }, ms);
    return () => { clearTimeout(timer); };
  }, [open, mounted, ms]);
  return open || mounted;
}

export function StewardDock({ chamber, registry, mode = 'simulated', role, input_ref, store = stewardDock,
  on_unmatched, on_chamber, proposal }: StewardDockProps) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const steward = registry[chamber];
  const live = mode === 'live';
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLElement>(null);
  const thread = useRef<HTMLDivElement>(null);
  const own_input = useRef<HTMLInputElement>(null);
  const sheet_id = useId();
  const session = snapshot.sessions[chamber];
  const view = session ? walkFlow(session.flow, session.state) : undefined;
  const beats = snapshot.beats.filter(beat => beat.chamber === chamber);
  const last_steward = beats.findLast(beat => beat.who === 'steward');
  const expanded = snapshot.expanded;
  const sheet = useLingering(expanded, sheetExitMs);
  // After a seal that offers next steps, those lead the row: "Set up a real draw" beats the generic chips.
  const offered = !session && last_steward?.sealed && last_steward === beats.at(-1) ? last_steward.chips ?? [] : [];
  const offered_keys = new Set(offered.map(chipKey));
  const chips = offered.length ? [...offered, ...chamberChips(chamber, steward).filter(item => item.action.kind !== 'flow' && !offered_keys.has(chipKey(item)))]
    : chamberChips(chamber, steward);
  const flows = chamberFlows(chamber, steward);
  const shown = new Set(chips.map(chipKey));
  const more = flows.some(item => !shown.has(chipKey(item)));
  const current_key = session ? (steward.demo?.id === session.flow.id ? `demo:${chamber}` : `flow:${session.flow.id}`) : undefined;
  const says = busy ? 'Thinking it over. Nothing acts until your hold to seal.' : last_steward?.text ?? steward.greeting;
  const active_key = view?.active ? `${session?.flow.id}:${view.active.step.id}` : '';

  useEffect(() => {
    if (!expanded) return;
    const focused = document.activeElement;
    const adrift = !focused || focused === document.body || (root.current?.contains(focused) && focused !== own_input.current);
    if (active_key && adrift) focusCard(root);
    const node = thread.current;
    if (!node) return;
    // Follow the conversation down, but never past the active step's own first line.
    const step = node.querySelector('.cc-steward-step');
    const step_top = step ? step.getBoundingClientRect().top - node.getBoundingClientRect().top + node.scrollTop - 10 : Infinity;
    node.scrollTop = Math.min(node.scrollHeight, step_top);
  }, [expanded, active_key, beats.length]);

  function input(): HTMLInputElement | null { return own_input.current; }
  function setRefs(node: HTMLInputElement | null) {
    own_input.current = node;
    if (typeof input_ref === 'function') input_ref(node);
    else if (input_ref) (input_ref as { current: HTMLInputElement | null }).current = node;
  }
  function collapse() { store.collapse(); input()?.focus(); }
  function catchUp(target: FlowChamber) {
    const brief = registry[target].catch_up?.();
    store.say({ chamber: target, who: 'steward', text: brief?.say ?? `Nothing new in ${registry[target].name}.`,
      ...(brief?.lines ? { lines: brief.lines } : {}), ...(brief?.simulated ? { simulated: true } : {}) });
    store.expand();
  }
  function chip(next: StewardChip, spoken = true) {
    // A flow chip is not echoed: the sheet's title already names what was asked for.
    if (spoken && next.action.kind !== 'flow' && next.action.kind !== 'demo') store.say({ chamber, who: 'you', text: next.label });
    const target = next.action.chamber;
    if (target !== chamber) on_chamber?.(target);
    if (next.action.kind === 'go') { store.say({ chamber: target, who: 'steward', text: registry[target].greeting }); store.expand(); return; }
    if (next.action.kind === 'catch_up') { catchUp(target); return; }
    const flow = chipFlow(registry, next.action);
    if (!flow) return;
    store.open(flow);
    requestAnimationFrame(() => focusCard(root));
  }
  function offer(target: FlowChamber, text: string, extra: Partial<Beat> = {}) {
    const chips = target === chamber ? chamberChips(target, registry[target]) : awayChips(target, registry[target]);
    store.say({ chamber, who: 'steward', text, chips, ...extra });
    store.expand();
  }
  async function tell() {
    const text = value.trim();
    if (!text || busy) return;
    setValue('');
    store.say({ chamber, who: 'you', text });
    const match = matchIntent(text, registry, chamber);
    if (match && match.kind !== 'chamber' && (match.chamber === chamber || match.kind === 'catch_up')) {
      chip({ label: text, action: match }, false);
      return;
    }
    if (match) {
      const flow = match.kind === 'flow' ? findFlow(registry, match.chamber, match.flow) : undefined;
      const here = match.chamber === chamber;
      const hint = match.kind === 'chamber' ? match.hint : undefined;
      offer(match.chamber, hint ?? (flow ? `That is set up in ${registry[match.chamber].name}: "${flow.title}". Shall we go?`
        : here ? `Here in ${steward.name}, these are ready.` : `That belongs in ${registry[match.chamber].name}. These are ready there.`));
      return;
    }
    if (on_unmatched) {
      setBusy(true);
      try {
        const answer = await on_unmatched(text);
        offer(chamber, answer.reply, answer.live ? { live: true } : {});
      } finally { setBusy(false); }
      return;
    }
    offer(chamber, `I only act on drafts you seal. Here is what I can set up in ${steward.name}.`);
  }
  const latest = beats.at(-1);
  const sheet_title = session ? session.flow.title : 'The Steward';
  const simulated_sheet = !live || session?.flow.simulated === true;

  return <section ref={root} className="cc-dock cc-steward-dock" data-chamber={chamber} data-expanded={expanded} aria-label="The Steward"
    onKeyDown={event => {
      if (event.key === 'Escape' && expanded) { event.preventDefault(); event.stopPropagation(); collapse(); }
    }}>
    {sheet && <div className="cc-steward-sheet" id={sheet_id} role="group" aria-label="Steward conversation" {...(expanded ? {} : { 'data-closing': '' })}>
      <header className="cc-steward-sheet__head">
        <b className="cc-steward-sheet__title">{sheet_title}</b>
        {session && view && <span className="cc-steward-sheet__count">step {view.position} of {Math.max(view.planned, view.position)}</span>}
        {simulated_sheet && <Sim />}
        <span className="cc-steward-sheet__tools">
          {session && <>
            <button type="button" className="cc-btn cc-btn--quiet cc-btn--sm" disabled={!view?.entries.some(entry => entry.status === 'answered')}
              onClick={() => store.back(chamber)}>Back</button>
            <button type="button" className="cc-btn cc-btn--quiet cc-btn--sm" onClick={() => store.reset(chamber)}>Start over</button>
          </>}
          <button type="button" className="cc-btn cc-btn--quiet cc-btn--sm" aria-controls={sheet_id} aria-expanded="true" onClick={collapse}>
            Lower <kbd className="cc-kbd">Esc</kbd></button>
        </span>
      </header>
      <div className="cc-steward-thread" ref={thread}>
        {beats.map(beat => <BeatLine key={beat.id} beat={beat} on_chip={next => chip(next)} />)}
        {session && view && <div className="cc-steward-flow">
          {view.entries.some(entry => entry.status === 'answered') && <ol className="cc-steward-answers" aria-label="Answered so far">
            {view.entries.filter(entry => entry.status === 'answered' || (entry.status === 'active' && session.state.editing === entry.step.id))
              .map(entry => <li key={entry.step.id}>
                {entry.step.kind === 'work' ? <span className="cc-steward-answer" data-kind="work">{entry.summary ?? entry.step.label}</span>
                  : <button type="button" className="cc-steward-answer" aria-current={entry.status === 'active' ? 'step' : undefined}
                    aria-label={`Change ${entry.step.label}`} onClick={() => store.reopen(chamber, entry.step.id)}>
                    {entry.summary ?? `${entry.step.label} · changing`}</button>}</li>)}
          </ol>}
          {view.active && <StepCard session={session} entry={view.active} chamber={chamber} store={store} />}
        </div>}
      </div>
    </div>}
    <div className="cc-steward" role="group" aria-label="Steward identity">
      <Niche />
      <b className="cc-steward__name">The Steward</b>
      <span className="cc-steward__role">{role ?? (live ? 'live co-pilot' : 'simulated co-pilot · sample data')}</span>
      {live ? <span className="cc-steward__live">Live Steward</span> : <Sim />}
    </div>
    <form className="cc-talk" onSubmit={event => { event.preventDefault(); void tell(); }}>
      <p className="cc-talk__msg" data-busy={busy || undefined}>{says}</p>
      <div className="cc-talk__row">
        <label className="cc-sr" htmlFor={`${sheet_id}-input`}>Talk to the Steward...</label>
        <input ref={setRefs} id={`${sheet_id}-input`} className="cc-input" aria-label="Talk to the Steward..." placeholder="Talk to the Steward..."
          autoComplete="off" value={value} onChange={event => setValue(event.currentTarget.value)} />
        <button type="submit" className="cc-btn" disabled={!value.trim() || busy}>Tell</button>
        <span className="cc-suggest" role="group" aria-label="Steward suggestions">
          {session && !expanded && <button type="button" className="cc-btn cc-btn--quiet cc-steward-resume" onClick={() => store.expand()}>
            Resume · {session.flow.chip ?? session.flow.title}</button>}
          {chips.filter(item => !(session && item.action.kind !== 'catch_up' && chipFlow(registry, item.action)?.id === session.flow.id))
            .map(item => <button key={item.label} type="button" className="cc-btn cc-btn--quiet"
              onClick={() => chip(item)}>{item.label}</button>)}
          {more && <FlowMenu items={flows} current={current_key} on_pick={item => chip(item)} />}
          {!expanded && beats.length > 0 && !session && <button type="button" className="cc-btn cc-btn--quiet" aria-expanded="false"
            onClick={() => store.expand()}>Raise</button>}
        </span>
      </div>
    </form>
    {proposal && <aside className="cc-steward-proposal" aria-label="Steward proposal">{proposal}</aside>}
    <p className="cc-sr" aria-live="polite" aria-atomic="true">{latest?.who === 'steward' ? latest.text : ''}</p>
  </section>;
}

