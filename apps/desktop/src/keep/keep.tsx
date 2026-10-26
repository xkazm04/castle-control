import { chambers, InkButton } from '@castle-control/ui';
import type { ModuleId } from '@castle-control/ui';
import { useSyncExternalStore } from 'react';
import { isPending, proposalQueue } from '@castle-control/ui/steward';
import type { Snapshot } from '../model.js';
import { keepReadModel } from './read-model.js';
import { ChamberArt } from './art.jsx';
import './keep.css';

export type KeepProps = { snapshot?: Snapshot; on_open: (id: ModuleId) => void; on_enter: () => void };

export function KeepEntrance({ on_enter }: { on_enter: () => void }) {
  return <header className="keep-heading"><div><p>Your channel is your keep.</p><h1>The lit keep</h1></div>
    <InkButton variant="primary" onClick={on_enter}>Enter the keep <kbd>0</kbd></InkButton></header>;
}

export function KeepRoomTile({ chamber, word, line, sample, on_open }: {
  chamber: (typeof chambers)[number]; word: string; line: string; sample: boolean; on_open: (id: ModuleId) => void;
}) {
  return <button className="keep-room" type="button" data-module={chamber.id}
    data-room-tile={chamber.id} onClick={() => on_open(chamber.id)} aria-label={`Open ${chamber.name}`}>
    <span className="keep-room-heading"><b>{chamber.name}</b><kbd>{chamber.number}</kbd></span>
    <span className="keep-room-function">{chamber.description}</span>
    <span className="keep-room-art"><ChamberArt chamber={chamber.id} /></span>
    <strong className="keep-room-word">{word}</strong><span className="keep-room-line">{line}</span>
    {sample && <span className="keep-room-source">Room preview · sample data</span>}
  </button>;
}

export function Keep({ snapshot = { mode: 'fixture', phase: 'ready' }, on_open, on_enter }: KeepProps) {
  const queue = useSyncExternalStore(proposalQueue.subscribe, proposalQueue.getSnapshot, proposalQueue.getSnapshot);
  const read = keepReadModel(snapshot);
  return <section className="keep-home" aria-label="The keep">
    <KeepEntrance on_enter={on_enter} />
    <p className="keep-provenance">{read.label}</p>
    <div className="keep-cross-section">
      <div className="keep-stone" aria-hidden="true" />
      {chambers.map(chamber => {
        const proposal = queue.proposals.filter(item => item.chamber === chamber.id && isPending(item)).at(-1);
        const state = read.states[chamber.id];
        return <KeepRoomTile key={chamber.id} chamber={chamber} on_open={on_open} sample={snapshot.mode === 'fixture'}
          word={proposal ? 'Draft' : state.word} line={proposal ? `PROPOSAL · ${proposal.title} · not on air` : state.line} />;
      })}
      <button type="button" className="keep-herald" onClick={() => on_open('moderator')}>
        <b>The Herald</b><em>Chat consensus</em>
        {read.consensus.length ? read.consensus.map(direction => <span className="keep-direction" key={direction.key}>
          <span>{direction.label}</span><meter min={0} max={1} value={direction.share} />
          <strong>{Math.round(direction.share * 100)}%</strong>
        </span>) : <span>Consensus unknown</span>}
        <small>{snapshot.mode === 'fixture' ? 'Sample room reading · never an action' : 'Awaiting chamber data'}</small>
      </button>
      <div className="keep-moat"><span>The moat</span>Chat delay · {read.delay}<span aria-hidden="true">≈ ≈ ≈ ≈ ≈ ≈ ≈</span></div>
    </div>
  </section>;
}
