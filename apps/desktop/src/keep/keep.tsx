import { chambers, InkButton } from '@castle-control/ui';
import type { ModuleId } from '@castle-control/ui';
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { CSSProperties } from 'react';
import { isPending, proposalQueue } from '@castle-control/ui/steward';
import { appOverviewFrame, appOverviewTarget, appRoomTarget, frameTransform, keepRooms } from '@castle-control/keep-art';
import type { Snapshot } from '../model.js';
import { keepReadModel } from './read-model.js';
import { MoatHeartbeat } from '../moat/heartbeat.jsx';
import { fixtureReplay } from '../moderation-fixture.js';
import './keep.css';
import { KeepArt } from './keep-art.jsx';
import { LintelPlaque } from './plaque.jsx';
import { useDiorama, useKeepCamera } from './camera.js';

export type KeepProps = { snapshot?: Snapshot; on_open: (id: ModuleId) => void; on_enter: () => void; on_demo?: () => void; on_stream?: () => void; on_rehearsal?: () => void };
type KeepStyle = CSSProperties & { '--keep-scale'?: number; '--keep-inverse'?: number };

const chamberLines: Record<ModuleId, string> = {
  lottery: 'Seal the roll. Wait for a public round. Cast the lots.',
  moderator: 'One gate guards the room and reads it.',
  visuals: 'Money changes how it looks, never what it decides.',
  studio: 'A studio for interactive designs, expressed as data.',
};

export function KeepEntrance({ on_enter, on_demo, on_stream, on_rehearsal }: Pick<KeepProps, 'on_enter' | 'on_demo' | 'on_stream' | 'on_rehearsal'>) {
  return <header className="keep-heading">
    <InkButton variant="primary" onClick={on_enter}>Enter the keep <kbd>0</kbd></InkButton>
    <InkButton data-demo-entry disabled={!on_demo} onClick={on_demo}>See it on stream</InkButton>
    <InkButton disabled={!on_stream} onClick={on_stream}>Set up OBS</InkButton>
    <InkButton disabled={!on_rehearsal} onClick={on_rehearsal}>Dress rehearsal</InkButton></header>;
}

// The art stays mounted; only these overlay classes change when a room is lit.
export function lightRoom(castle: HTMLDivElement | null, id?: ModuleId) {
  castle?.querySelectorAll<SVGElement>('.dim, .litglow').forEach(element => {
    element.classList.toggle('on', element.dataset['room'] === id);
  });
}

export function Keep({ snapshot = { mode: 'fixture', phase: 'ready' }, on_open, on_enter, on_demo, on_stream, on_rehearsal }: KeepProps) {
  const queue = useSyncExternalStore(proposalQueue.subscribe, proposalQueue.getSnapshot, proposalQueue.getSnapshot);
  const read = keepReadModel(snapshot);
  const [hovered, setHovered] = useState<ModuleId | undefined>(undefined);
  const [focused, setFocused] = useState<ModuleId | undefined>(undefined);
  const { host, scale } = useDiorama();
  const { castle, opening, open, transitionEnd } = useKeepCamera(on_open);
  const active = opening ?? hovered ?? focused;
  const chamber = chambers.find(item => item.id === active);
  const state = chamber ? read.states[chamber.id] : undefined;
  const room = opening ? keepRooms[opening] : undefined;
  const camera = frameTransform(room?.appFrame ?? room?.frame ?? appOverviewFrame,
    room ? appRoomTarget : appOverviewTarget, room ? 'cover' : 'contain');
  const stageStyle: KeepStyle = { '--keep-scale': scale, '--keep-inverse': 1 / scale };
  const castleStyle: KeepStyle = {
    transform: `translate(${camera.ox}px, ${camera.oy}px) scale(${camera.s})`,
    '--keep-inverse': 1 / (scale * camera.s),
  };
  useEffect(() => { lightRoom(castle.current, active); }, [castle, active]);
  return <section className={`keep-home${opening ? ' room-mode' : ''}`} aria-label="The keep">
    <KeepEntrance on_enter={on_enter} {...(on_demo ? { on_demo } : {})} {...(on_stream ? { on_stream } : {})} {...(on_rehearsal ? { on_rehearsal } : {})} />
    <div className="keep-viewport" ref={host}>
      <div className="keep-diorama" style={stageStyle}>
        <header className="keep-khead">
          <span className="eyebrow" data-role="keep-eyebrow">{chamber
            ? `Chamber ${chamber.number} of 4 · ${chamber.description} · press ${chamber.number} or click`
            : `The Keep · ${snapshot.mode === 'fixture' ? 'fixture mode · sample evening' : 'core mode · chamber readings'}`}</span>
          <h1 key={active ?? 'keep'} className="display ghost slip" data-role="keep-name" data-room={active}>{chamber && state
            ? `${chamber.name} · ${state.word}` : 'The Keep'}</h1>
          <span className="sub" data-role="keep-sub">{chamber && state
            ? `${state.line}. ${chamberLines[chamber.id]}` : 'Point at a room, or press 1 to 4.'}</span>
          <span className="keep-vlab" data-role="keep-vlabel">Stylised illustration · drawn, not captured</span>
        </header>
        <div className="keep-dio">
          <div className={`keep-castle${active ? ' focus' : ''}`} ref={castle} style={castleStyle}
            onTransitionEnd={transitionEnd} onPointerLeave={() => setHovered(undefined)}>
            <KeepArt />
            {chambers.map(item => <LintelPlaque key={item.id} chamber={item} state={read.states[item.id]}
              drafted={queue.proposals.some(proposal => proposal.chamber === item.id && isPending(proposal))} />)}
            {chambers.map(item => {
              const hit = keepRooms[item.id].hit;
              const reading = read.states[item.id];
              return <button key={item.id} type="button" className="keep-hit" data-room={item.id} data-room-tile={item.id}
                style={{ left: hit.x, top: hit.y, width: hit.w, height: hit.h }}
                aria-label={`Open chamber ${item.number}, ${item.name}: ${reading.word}, ${reading.line}`}
                onClick={() => open(item.id)} onPointerEnter={() => setHovered(item.id)}
                onPointerLeave={() => setHovered(undefined)} onFocus={() => setFocused(item.id)} onBlur={() => setFocused(undefined)} />;
            })}
          </div>
        </div>
      </div>
    </div>
    <div className="keep-moat">
      <span className="keep-moatlab" data-role="moat-label">The moat · chat delay {read.delay}</span>
      {snapshot.mode === 'fixture' && <><MoatHeartbeat source={fixtureReplay} delay_s={read.delay_s} />
        <a className="keep-moat-link" href="#/chamber/moderator/drill">Watch the full replay</a></>}
    </div>
  </section>;
}
