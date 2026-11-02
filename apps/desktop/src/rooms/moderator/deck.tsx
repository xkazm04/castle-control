import { lazy, Suspense, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChamberLayout, Drawer } from '@castle-control/ui/chamber';
import type { ChamberLayoutProps } from '@castle-control/ui/chamber';
import type { ProposalQueue } from '@castle-control/ui/steward';
import { stewardDock } from '@castle-control/ui/steward-flow';
import { roomProposals, selectRoomDesign } from '../design/actions.jsx';
import type { RoomDesignSelection } from '../design/actions.jsx';
import { voteBarFlow } from './flow-votebar.jsx';
import { RoomKeyBadge } from '../../shell/steward-keys.jsx';
import './deck.css';
import './readability.css';

const DesignDialog = lazy(() => import('../design/focus.jsx').then(module => ({ default: module.RoomDesignDialog })));
const voteFlow = voteBarFlow({ mode: 'fixture', phase: 'ready' });

/** Keep the detail layer outside the shell's animated/clipping room frame. */
export function GatehouseDeck({ open, on_close, children, ...layout }: ChamberLayoutProps & {
  open: boolean; on_close: () => void; children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const host = root.current?.closest('.cc-frame');
  const drawer = <Drawer open={open} onClose={on_close} title="The Herald and more of the Gatehouse">
    <div className="gh-deck-details">{children}</div>
  </Drawer>;
  return <div ref={root} className="gh-deck" onKeyDown={event => {
    if (open && event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault(); event.stopPropagation(); on_close();
    }
  }}>
    <ChamberLayout {...layout} />
    {host ? createPortal(<div data-chamber="moderator">{drawer}</div>, host) : drawer}
  </div>;
}

/** A summary of existing drafts; their full fields and seal controls stay in the drawer. */
export function GateProposalMini({ queue, flow, on_open }: {
  queue: ProposalQueue; flow?: string | undefined; on_open: () => void;
}) {
  useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot);
  const pending = roomProposals(queue, 'moderator');
  return <div className="gh-mini-copy">
    <p>{pending[0]?.title ?? flow ?? 'Nothing in Preview. Ask the Steward to draft one.'}</p>
    {pending.length > 0 && <p>{pending.length} proposal{pending.length === 1 ? '' : 's'} · not on air</p>}
    <button type="button" className="cc-btn cc-btn--sm" onClick={on_open}>Proposal list</button>
  </div>;
}

/** Existing vote-bar flow and data-only design editor; neither acts on opening. */
export function VoteControls({ queue, full = false }: { queue: ProposalQueue; full?: boolean }) {
  const [design, setDesign] = useState<RoomDesignSelection>();
  const open = (action: RoomDesignSelection['action']) => {
    const selection = { artifact: 'overlay', action } as const;
    selectRoomDesign(queue, selection); setDesign(selection);
  };
  return <div className="gh-vote-controls">
    <div className="gh-deck-buttons">
      <button type="button" className="cc-btn cc-btn--sm" onClick={() => stewardDock.open(voteFlow)}><RoomKeyBadge room="moderator" action="vote_bar" />Show the vote bar</button>
      <button type="button" className="cc-btn cc-btn--sm" onClick={() => open('restyle')}><RoomKeyBadge room="moderator" action="restyle" />Restyle</button>
      {full && <button type="button" className="cc-btn cc-btn--sm" onClick={() => open('custom')}><RoomKeyBadge room="moderator" action="custom" />Custom design</button>}
    </div>
    {design && <Suspense fallback={<p role="status">Opening simulated design...</p>}>
      <DesignDialog selection={design} on_close={() => setDesign(undefined)} />
    </Suspense>}
  </div>;
}
