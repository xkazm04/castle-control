import { chambers } from '@castle-control/ui';
import type { ModuleId } from '@castle-control/ui';
import { useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { proposalQueue } from '@castle-control/ui/steward';
import { useFlowDraft } from '@castle-control/ui/steward-flow';
import type { Snapshot } from '../model.js';
import { stripStates } from '../shell/strip-states.js';
import { keepReadModel } from './read-model.js';
import { MoatHeartbeat } from '../moat/heartbeat.jsx';
import { fixtureReplay } from '../moderation-fixture.js';
import { LintelPlaque } from './plaque.jsx';
import { KeepScene, Tracery } from './window-scenes.jsx';
import { keepThemeFlow, keepTourFlow } from './steward-flows.js';
import './keep.css';

export type KeepProps = { snapshot?: Snapshot; on_open: (id: ModuleId) => void; on_enter: () => void; on_demo?: () => void; on_stream?: () => void; on_rehearsal?: () => void;
  /** Preview, the existing seal authority, and simulated Program occupy the middle of the sill. */
  aside?: ReactNode };

export function KeepEntrance({ on_enter, on_demo, on_stream, on_rehearsal }: Pick<KeepProps, 'on_enter' | 'on_demo' | 'on_stream' | 'on_rehearsal'>) {
  return <nav className="keep-heading ki__actions" aria-label="Keep actions">
    <button type="button" className="cc-btn cc-btn--primary" onClick={on_enter}>Enter the keep <kbd className="cc-kbd">0</kbd></button>
    <button type="button" className="cc-btn" data-demo-entry title="What is Castle Control? A short, simulated tour." disabled={!on_demo} onClick={on_demo}>See it on stream</button>
    <button type="button" className="cc-btn" disabled={!on_stream} onClick={on_stream}>Set up OBS</button>
    <button type="button" className="cc-btn" disabled={!on_rehearsal} onClick={on_rehearsal}>Dress rehearsal</button></nav>;
}

export function Keep({ snapshot = { mode: 'fixture', phase: 'ready' }, on_open, on_enter, on_demo, on_stream, on_rehearsal, aside }: KeepProps) {
  const queue = useSyncExternalStore(proposalQueue.subscribe, proposalQueue.getSnapshot, proposalQueue.getSnapshot);
  const read = keepReadModel(snapshot);
  // Windows use attention and draft state; Program's presentation stays in its sill cell.
  const layers = stripStates(snapshot, queue.proposals, []);
  const [hovered, setHovered] = useState<ModuleId | undefined>(undefined);
  const [focused, setFocused] = useState<ModuleId | undefined>(undefined);
  const toured = useFlowDraft(keepTourFlow)?.lit;
  const drafted = useFlowDraft(keepThemeFlow)?.lead ?? toured;
  const active = hovered ?? focused ?? drafted;
  return <section className="keep-home" aria-label="The keep">
    <header className="keep-caption">
      <div className="keep-caption-title">
        <div className="keep-eyebrow" data-role="keep-eyebrow"><h1 data-role="keep-name">The Keep</h1>
          <span> · {snapshot.mode === 'fixture' ? 'fixture mode · sample evening' : 'core mode · chamber readings'}</span></div>
        <p data-role="keep-sub">Point at a room, or press 1 to 4. The brightest window needs you.</p>
      </div>
      <div className="keep-fair" data-role="fair"><svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m12 2 8 4v6c0 5-4 8-8 10-4-2-8-5-8-10V6Z M8 12l3 3 5-6" /></svg>
        <p><b>Fairness stays in the room</b> Free entry · equal odds. Paid entry and paid weight on prize draws are blocked by default. A barred message never counts toward a draw.</p></div>
    </header>
    <div className="keep-wall" aria-label="The Keep's four lights">
      {chambers.map(item => {
        const reading = read.states[item.id];
        const layer = layers[item.id];
        return <article key={item.id} className={`keep-window${layer.needs_you ? ' is-needed' : ''}${layer.draft ? ' has-ink' : ''}`}
          data-room={item.id} data-module={item.id} data-active={active === item.id ? '' : undefined}>
          <div className="keep-glass" data-role="keep-window" data-room={item.id} data-needs-you={layer.needs_you || undefined}>
            <i className="keep-keystone" aria-hidden="true" /><Tracery />
            <KeepScene room={item.id} read={read} simulated={snapshot.mode === 'fixture'} />
          </div>
          <LintelPlaque chamber={item} state={reading} drafted={Boolean(layer.draft)} needs_you={Boolean(layer.needs_you)} />
          <button type="button" className="keep-hit kw-hit" data-room={item.id} data-room-tile={item.id}
            aria-label={`Open chamber ${item.number}, ${item.name}: ${reading.word}, ${reading.line}`}
            onClick={() => on_open(item.id)} onPointerEnter={() => setHovered(item.id)}
            onPointerLeave={() => setHovered(undefined)} onFocus={() => setFocused(item.id)} onBlur={() => setFocused(undefined)} />
        </article>;
      })}
    </div>
    <p className="keep-art-caption" data-role="keep-vlabel">Stylised illustration · drawn, not captured{snapshot.mode === 'fixture' ? ' · SIMULATED' : ''}</p>
    <div className="keep-sill" data-role="keep-sill" aria-label="The Keep sill">
      <KeepEntrance on_enter={on_enter} {...(on_demo ? { on_demo } : {})} {...(on_stream ? { on_stream } : {})} {...(on_rehearsal ? { on_rehearsal } : {})} />
      {aside}
      <section className="keep-moat km" aria-label="The moat">
        <h2 className="keep-moatlab km__label" data-role="moat-label">The moat · <span className={snapshot.mode === 'fixture' ? 'keep-delay' : undefined}>chat delay {read.delay}</span></h2>
        {snapshot.mode === 'fixture' && <><MoatHeartbeat source={fixtureReplay} delay_s={read.delay_s} />
          <a className="keep-moat-link cc-link" href="#/chamber/moderator/drill">Watch the full replay</a></>}
      </section>
    </div>
  </section>;
}
