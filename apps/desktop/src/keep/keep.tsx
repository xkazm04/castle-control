import { chambers } from '@castle-control/ui';
import type { ModuleId } from '@castle-control/ui';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { isPending, proposalQueue } from '@castle-control/ui/steward';
import { useFlowDraft } from '@castle-control/ui/steward-flow';
import type { Snapshot } from '../model.js';
import { keepReadModel } from './read-model.js';
import { MoatHeartbeat } from '../moat/heartbeat.jsx';
import { fixtureReplay } from '../moderation-fixture.js';
import './keep.css';
import { LintelPlaque } from './plaque.jsx';
import { keepBatPath, keepWindowSvg } from './keep-window.js';
import { keepThemeFlow, keepTourFlow } from './steward-flows.js';

export type KeepProps = { snapshot?: Snapshot; on_open: (id: ModuleId) => void; on_enter: () => void; on_demo?: () => void; on_stream?: () => void; on_rehearsal?: () => void;
  /** The program column, laid in the third track of the Keep's grid. */
  aside?: ReactNode };

const chamberLines: Record<ModuleId, string> = {
  lottery: 'Seal the roll. Wait for a public round. Cast the lots.',
  moderator: 'One gate guards the room and reads it.',
  visuals: 'Money changes how it looks, never what it decides.',
  studio: 'A studio for interactive designs, expressed as data.',
};

export function KeepEntrance({ on_enter, on_demo, on_stream, on_rehearsal }: Pick<KeepProps, 'on_enter' | 'on_demo' | 'on_stream' | 'on_rehearsal'>) {
  return <header className="keep-heading ki__actions">
    <button type="button" className="cc-btn cc-btn--primary" onClick={on_enter}>Enter the keep <kbd className="cc-kbd">0</kbd></button>
    <button type="button" className="cc-btn" data-demo-entry title="What is Castle Control? A short, simulated tour." disabled={!on_demo} onClick={on_demo}>See it on stream</button>
    <button type="button" className="cc-btn" disabled={!on_stream} onClick={on_stream}>Set up OBS</button>
    <button type="button" className="cc-btn" disabled={!on_rehearsal} onClick={on_rehearsal}>Dress rehearsal</button></header>;
}

// The window stays mounted; a lit room only moves `data-active` on its light and its tag.
type Light = { dataset: Record<string, string | undefined>; setAttribute: (name: string, value: string) => void; removeAttribute: (name: string) => void };
export function lightRoom(glass: { querySelectorAll: (selector: string) => { forEach: (each: (light: Light) => void) => void } } | null, id?: ModuleId) {
  glass?.querySelectorAll('.kw-light, .kw-light-tag').forEach(element => {
    if (element.dataset['room'] === id) element.setAttribute('data-active', ''); else element.removeAttribute('data-active');
  });
}

/** Where each chamber's light sits in the window's 720 by 514 plane (percent of the window box). */
const hitBox: Record<ModuleId, { left: string; top: string; width: string; height: string }> = {
  lottery: { left: '5.56%', top: '50.19%', width: '20.97%', height: '47.08%' },
  moderator: { left: '28.19%', top: '50.19%', width: '20.97%', height: '47.08%' },
  visuals: { left: '50.83%', top: '50.19%', width: '20.97%', height: '47.08%' },
  studio: { left: '73.47%', top: '50.19%', width: '20.97%', height: '47.08%' },
};

export function Keep({ snapshot = { mode: 'fixture', phase: 'ready' }, on_open, on_enter, on_demo, on_stream, on_rehearsal, aside }: KeepProps) {
  const queue = useSyncExternalStore(proposalQueue.subscribe, proposalQueue.getSnapshot, proposalQueue.getSnapshot);
  const read = keepReadModel(snapshot);
  const [hovered, setHovered] = useState<ModuleId | undefined>(undefined);
  const [focused, setFocused] = useState<ModuleId | undefined>(undefined);
  const glass = useRef<HTMLDivElement>(null);
  // The Steward's open theme draft lights its room live, under any pointer or focus.
  const toured = useFlowDraft(keepTourFlow)?.lit;
  const drafted = useFlowDraft(keepThemeFlow)?.lead ?? toured;
  const active = hovered ?? focused ?? drafted;
  const chamber = chambers.find(item => item.id === active);
  const state = chamber ? read.states[chamber.id] : undefined;
  useEffect(() => { lightRoom(glass.current, active); }, [active]);
  return <section className="keep-home" aria-label="The keep">
    <section className="ki" aria-labelledby="keep-title">
      <p className="cc-eyebrow ki__eyebrow" data-role="keep-eyebrow">{chamber
        ? `Chamber ${chamber.number} of 4 · ${chamber.description} · press ${chamber.number} or click`
        : `The Keep · ${snapshot.mode === 'fixture' ? 'fixture mode · sample evening' : 'core mode · chamber readings'}`}</p>
      <h1 id="keep-title" className="ki__title" data-role="keep-name" {...(active ? { 'data-room': active, 'data-module': active } : {})}>{chamber && state
        ? `${chamber.name} · ${state.word}` : 'The Keep'}</h1>
      <p className="ki__sub" data-role="keep-sub" {...(active ? { 'data-room': active } : {})}>{chamber && state
        ? `${state.line}. ${chamberLines[chamber.id]}` : 'Point at a room, or press 1 to 4.'}</p>
      <div className="cc-beads cc-beads--chapel ki__rule" aria-hidden="true" />
      <div className="keep-moat km" aria-label="The moat">
        <span className="keep-moatlab km__label" data-role="moat-label">The moat · chat delay {read.delay}</span>
        {snapshot.mode === 'fixture' && <><MoatHeartbeat source={fixtureReplay} delay_s={read.delay_s} />
          <a className="keep-moat-link cc-link" href="#/chamber/moderator/drill">Watch the full replay</a></>}
      </div>
      <KeepEntrance on_enter={on_enter} {...(on_demo ? { on_demo } : {})} {...(on_stream ? { on_stream } : {})} {...(on_rehearsal ? { on_rehearsal } : {})} />
    </section>
    <section className="kh" aria-label="The keep's great window">
      <div className="kh__stage">
        <div className="keep-castle kw" ref={glass} {...(active ? { 'data-hover': active } : {})}>
          <div className="kw-art" dangerouslySetInnerHTML={{ __html: keepWindowSvg }} />
          {chambers.map(item => {
            const reading = read.states[item.id];
            return <button key={item.id} type="button" className="keep-hit kw-hit" data-room={item.id} data-room-tile={item.id}
              style={hitBox[item.id]}
              aria-label={`Open chamber ${item.number}, ${item.name}: ${reading.word}, ${reading.line}`}
              onClick={() => on_open(item.id)} onPointerEnter={() => setHovered(item.id)}
              onPointerLeave={() => setHovered(undefined)} onFocus={() => setFocused(item.id)} onBlur={() => setFocused(undefined)} />;
          })}
        </div>
        <div className="kh__pool" aria-hidden="true" />
        {[0, 1].map(bat => <svg key={bat} className={`kbat kbat--${bat}`} viewBox="-28 -14 56 24" aria-hidden="true"><path d={keepBatPath} /></svg>)}
        <p className="ki__caption" data-role="keep-vlabel">Stylised illustration · drawn, not captured</p>
        <div className="kh__plaques">
          {chambers.map(item => <LintelPlaque key={item.id} chamber={item} state={read.states[item.id]}
            drafted={queue.proposals.some(proposal => proposal.chamber === item.id && isPending(proposal))} />)}
        </div>
      </div>
    </section>
    {aside}
  </section>;
}
