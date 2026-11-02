import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode, Ref, RefObject } from 'react';
import { ActionRow } from '../action-row/index.jsx';
import type { ActionKey } from '../action-row/index.jsx';
import { Lines, Sim, StepCard } from './cards.jsx';
import { walkFlow } from './flow.js';
import type { FlowChamber } from './flow.js';
import { matchIntent } from './intent.js';
import { awayChips, chamberChips, chamberFlows, chipFlow, findFlow } from './registry.js';
import { chipKey, FlowMenu } from './flow-menu.jsx';
import type { StewardChip, StewardRegistry } from './registry.js';
import { stewardDock } from './store.js';
import type { Beat, DockStore } from './store.js';
import './dock.css';
import './deck.css';

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
  action_keys?: readonly ActionKey[];
  seal_key?: ReactNode;
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

function BeatLine({ beat, on_chip, proposal }: { beat: Beat; on_chip: (chip: StewardChip) => void; proposal?: ReactNode }) {
  const stamp = <small className="cc-beat-time">{beat.who === 'you' ? 'You' : 'The Steward'} · <time dateTime={beat.at}>{beat.at.slice(11, 16)} UTC</time> · {beat.live ? 'live' : 'simulated'}</small>;
  if (beat.who === 'you') return <div data-role="steward-bubble" className="cc-beat cc-beat--you">{stamp}<p>{beat.text}</p></div>;
  return <div data-role="steward-bubble" className={`cc-beat cc-beat--steward${beat.sealed ? ' cc-beat--sealed' : ''}`}>
    {stamp}
    <p><i className="cc-beat__mark" aria-hidden="true" />{beat.text}
      {beat.simulated && <> <Sim /></>}{beat.live && <span className="cc-steward-live-tag"> · live</span>}</p>
    {beat.lines && <Lines lines={beat.lines} />}
    {beat.chips && beat.chips.length > 0 && <span className="cc-steward-beat-chips">
      {beat.chips.map(chip => <button key={chip.label} type="button" className="cc-btn cc-btn--quiet cc-btn--sm" onClick={() => on_chip(chip)}>{chip.label}</button>)}
    </span>}
    {proposal && <aside className="cc-steward-proposal" aria-label="Steward proposal">{proposal}</aside>}
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
  on_unmatched, on_chamber, proposal, action_keys, seal_key }: StewardDockProps) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const steward = registry[chamber];
  const live = mode === 'live';
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLElement>(null);
  const thread = useRef<HTMLDivElement>(null);
  const own_input = useRef<HTMLInputElement>(null);
  const opened_at = useRef(new Date().toISOString());
  const thinking = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const seen = useRef(false);
  const [peek, setPeek] = useState<number>();
  const sheet_id = useId();
  const session = snapshot.sessions[chamber];
  const view = session ? walkFlow(session.flow, session.state) : undefined;
  const beats = snapshot.beats.filter(beat => beat.chamber === chamber);
  const last_steward = beats.findLast(beat => beat.who === 'steward');
  const expanded = snapshot.expanded;
  const sheet = useLingering(expanded, sheetExitMs);
  const unread = beats.filter(beat => beat.who === 'steward' && beat.id > snapshot.read_through).length;
  useEffect(() => {
    if (expanded || !last_steward) { setPeek(undefined); return; }
    setPeek(last_steward.id);
    const timer = setTimeout(() => setPeek(undefined), 7000);
    return () => clearTimeout(timer);
  }, [expanded, last_steward]);
  useEffect(() => () => clearTimeout(thinking.current), []);
  // After a seal that offers next steps, those lead the row: "Set up a real draw" beats the generic chips.
  const offered = !session && last_steward?.sealed && last_steward === beats.at(-1) ? last_steward.chips ?? [] : [];
  const offered_keys = new Set(offered.map(chipKey));
  const chips = offered.length ? [...offered, ...chamberChips(chamber, steward).filter(item => item.action.kind !== 'flow' && !offered_keys.has(chipKey(item)))]
    : chamberChips(chamber, steward);
  const flows = chamberFlows(chamber, steward);
  const quick = chips.slice(0, 2);
  const menu_items = [...flows, ...chips.filter(item => !flows.some(flow => chipKey(flow) === chipKey(item)))];
  const more = menu_items.some(item => !new Set(quick.map(chipKey)).has(chipKey(item)));
  const current_key = session ? (steward.demo?.id === session.flow.id ? `demo:${chamber}` : `flow:${session.flow.id}`) : undefined;
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
  function collapse() { store.collapse(); seen.current = true; input()?.focus(); seen.current = false; }
  function open() { seen.current = false; store.expand(); }
  function catchUp(target: FlowChamber) {
    const brief = registry[target].catch_up?.();
    store.say({ chamber: target, who: 'steward', text: brief?.say ?? `Nothing new in ${registry[target].name}.`,
      ...(brief?.lines ? { lines: brief.lines } : {}), ...(brief?.simulated ? { simulated: true } : {}) });
  }
  function chip(next: StewardChip, spoken = true) {
    if (spoken) store.say({ chamber, who: 'you', text: next.label, ...(live ? { live: true } : { simulated: true }) });
    const target = next.action.chamber;
    if (target !== chamber) on_chamber?.(target);
    if (next.action.kind === 'go') { store.say({ chamber: target, who: 'steward', text: registry[target].greeting }); return; }
    if (next.action.kind === 'catch_up') { catchUp(target); return; }
    const flow = chipFlow(registry, next.action);
    if (!flow) return;
    store.open(flow, store.getSnapshot().expanded);
    if (store.getSnapshot().expanded) requestAnimationFrame(() => focusCard(root));
  }
  function offer(target: FlowChamber, text: string, extra: Partial<Beat> = {}) {
    const chips = target === chamber ? chamberChips(target, registry[target]) : awayChips(target, registry[target]);
    store.say({ chamber, who: 'steward', text, chips, ...extra });
  }
  function chooseChip(next: StewardChip) {
    clearTimeout(thinking.current); open(); setBusy(true);
    thinking.current = setTimeout(() => { setBusy(false); chip(next); }, 280);
  }
  async function tell() {
    const text = value.trim();
    if (!text || busy) return;
    setValue('');
    open(); setBusy(true);
    store.say({ chamber, who: 'you', text, ...(live ? { live: true } : { simulated: true }) });
    await new Promise<void>(resolve => { setTimeout(resolve, 280); });
    setBusy(false);
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

  return <section ref={root} className="cc-dock cc-steward-dock" data-chamber={chamber} data-chat-open={expanded} aria-label="The Steward"
    onKeyDown={event => {
      if (event.key === '/' && !expanded && event.target === own_input.current) { event.preventDefault(); open(); }
      if (event.key === 'Escape' && store.peel()) { event.preventDefault(); event.stopPropagation(); if (!store.getSnapshot().expanded) collapse(); }
    }}>
    {action_keys && <ActionRow entries={action_keys} seal={seal_key} open={snapshot.popover === 'actions'} on_open={value => store.popover(value ? 'actions' : undefined)} />}
    {sheet && <div className="cc-steward-sheet" data-role="steward-chat" id={sheet_id} role="group" aria-label="Steward conversation" {...(expanded ? {} : { 'data-closing': '' })}>
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
        {!beats.length && <BeatLine beat={{ id: 0, at: opened_at.current, chamber, who: 'steward', text: steward.greeting,
          ...(live ? { live: true } : { simulated: true }) }} on_chip={chooseChip} proposal={proposal} />}
        {beats.map(beat => <BeatLine key={beat.id} beat={beat} on_chip={chooseChip} proposal={beat.id === last_steward?.id ? proposal : undefined} />)}
        {busy && <p className="cc-steward-typing" role="status">The Steward is typing<span aria-hidden="true"> · · ·</span></p>}
        {session && view && <div className="cc-steward-flow" data-role="steward-bubble">
          <small className="cc-beat-time">The Steward · <time dateTime={last_steward?.at ?? opened_at.current}>{(last_steward?.at ?? opened_at.current).slice(11, 16)} UTC</time> · {session.flow.simulated ? 'simulated' : 'live'}</small>
          {view.entries.some(entry => entry.status === 'answered') && <ol className="cc-steward-answers" aria-label="Answered so far">
            {view.entries.filter(entry => entry.status === 'answered' || (entry.status === 'active' && session.state.editing === entry.step.id))
              .map(entry => <li key={entry.step.id}>
                <button type="button" className="cc-steward-answer" aria-current={entry.status === 'active' ? 'step' : undefined}
                  aria-label={`Change ${entry.step.label}`} onClick={() => store.reopen(chamber, entry.step.id)}>
                  {entry.summary ?? `${entry.step.label} · changing`}</button></li>)}
          </ol>}
          {view.active && <StepCard session={session} entry={view.active} chamber={chamber} store={store}
            {...(seal_key ? { on_preview: () => { if (store.preview(chamber)) root.current?.querySelector<HTMLButtonElement>('[data-role="seal-key"]')?.focus(); } } : {})} />}
        </div>}
      </div>
    </div>}
    <div className="cc-steward-bar-row" data-role="steward-bar">
    {!expanded && peek === last_steward?.id && last_steward && <button type="button" className="cc-steward-peek" onClick={open}>
      <b>The Steward · {live ? 'live' : 'simulated'}</b><span>{last_steward.text}</span></button>}
    <button type="button" className="cc-steward" aria-label={`Steward identity${unread ? ` · ${unread} unread` : ''}`} aria-expanded={expanded} onClick={() => expanded ? collapse() : open()}>
      <Niche />
      <b className="cc-steward__name">The Steward</b>
      <span className="cc-steward__role">{role ?? (live ? 'live co-pilot' : 'simulated co-pilot · sample data')}</span>
      {live ? <span className="cc-steward__live">Live Steward</span> : <Sim />}
      {unread > 0 && <span className="cc-steward-unread">{unread}</span>}
    </button>
    <form className="cc-talk" onSubmit={event => { event.preventDefault(); void tell(); }}>
      <div className="cc-talk__row">
        <label className="cc-sr" htmlFor={`${sheet_id}-input`}>Talk to the Steward...</label>
        <input ref={setRefs} id={`${sheet_id}-input`} className="cc-input" aria-label="Talk to the Steward..." placeholder="Talk to the Steward..."
          autoComplete="off" value={value} onFocus={() => { if (!seen.current) open(); seen.current = false; }}
          onKeyDown={event => {
            // The input already owns focus: peel without focusing it again and reopening chat.
            if (event.key === 'Escape' && store.peel()) { event.preventDefault(); event.stopPropagation(); }
          }}
          onChange={event => { setValue(event.currentTarget.value); if (event.currentTarget.value) open(); }} />
        <kbd className="cc-talk-hint">/</kbd>
        <button type="submit" className="cc-btn" disabled={!value.trim() || busy}>Tell</button>
        <span className="cc-suggest" role="group" aria-label="Steward suggestions">
          {session && !expanded && <button type="button" className="cc-btn cc-btn--quiet cc-steward-resume" onClick={() => store.expand()}>
            Resume · {session.flow.chip ?? session.flow.title}</button>}
          {quick.filter(item => !(session && item.action.kind !== 'catch_up' && chipFlow(registry, item.action)?.id === session.flow.id))
            .map(item => <button key={item.label} type="button" className="cc-btn cc-btn--quiet"
              onClick={() => chooseChip(item)}>{item.label}</button>)}
          {more && <FlowMenu items={menu_items} current={current_key} on_pick={chooseChip} expanded={snapshot.popover === 'flows'}
            on_expanded={value => store.popover(value ? 'flows' : undefined)} />}
          {!expanded && beats.length > 0 && !session && <button type="button" className="cc-btn cc-btn--quiet" aria-expanded="false"
            onClick={() => store.expand()}>Raise</button>}
        </span>
      </div>
    </form>
    </div>
    <p className="cc-sr" aria-live="polite" aria-atomic="true">{latest?.who === 'steward' ? latest.text : ''}</p>
  </section>;
}

