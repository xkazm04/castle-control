import { useState } from 'react';
import type { ReactNode } from 'react';
import { EmptyState, Plate } from '@castle-control/ui';
import type { ProposalQueue } from '@castle-control/ui/steward';
import type { Snapshot } from '../../model.js';
import { studioCopy as copy } from '../../studio-copy.js';
import { ProposalLayers } from '../visuals/proposal-layers.jsx';
import { HexTable, TileInspector } from './hex-table.jsx';
import { TestLadder } from './test-ladder.jsx';
import { BannerInspector, StudioDesignControls } from './design.jsx';
import { boardForSize, createStudioSession, updateStudioSession } from './session.js';
import type { SessionField } from './session.js';
import type { StudioBoard } from './board.js';
import './room.css';
import './hex-field.css';

export function StudioWork({ queue, seal_slot, board }: { queue?: ProposalQueue; seal_slot?: ReactNode; board?: StudioBoard }) {
  const [session, setSession] = useState(() => createStudioSession(board));
  const [rung, setRung] = useState(0);
  const current_board = board ?? boardForSize(session.design.size);
  const change = (field: SessionField, value?: string) => setSession(state => updateStudioSession(state, field, value, board));
  return <section className="studio-room cc-herald" aria-label={copy.work}>
    <HexTable selected={session.selected} on_select={id => change('tile', id)} board={current_board} size={session.design.size} />
    <div className="cc-herald-side" role="region" aria-label={copy.side_label} tabIndex={0} aria-describedby="studio-scroll-hint">
      <p id="studio-scroll-hint" className="studio-visually-hidden">{copy.side_hint}</p>
      <TileInspector selected={session.selected} board={current_board} />
      <BannerInspector selected={session.selected} board={current_board} on_select={side => change('banner', side)} />
      <StudioDesignControls session={session} on_change={change} {...(board ? { board } : {})} />
      <TestLadder selected={rung} on_select={setRung} />
      <div className="studio-room-panel-drafts" aria-label={copy.drafts} data-on-air="false">
        <ProposalLayers chamber="studio" {...(queue ? { queue } : {})} />
      </div>
      <div className="studio-seal-group"><p className="cc-side-fine">{copy.operator}</p>
        {seal_slot && <Plate variant="plain" border_ink="rule" className="cc-seal-card">{seal_slot}</Plate>}
      </div>
    </div>
  </section>;
}

export default function StudioRoom({ snapshot, seal_slot }: { snapshot: Snapshot; seal_slot?: ReactNode }) {
  if (snapshot.mode !== 'fixture') return <section className="studio-room studio-core">
    <EmptyState title={copy.bare} description={copy.unconfigured} />{seal_slot}
  </section>;
  return <StudioWork seal_slot={seal_slot} />;
}
