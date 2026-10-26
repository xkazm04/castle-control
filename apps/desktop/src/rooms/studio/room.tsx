import { useState } from 'react';
import { EmptyState } from '@castle-control/ui';
import type { ProposalQueue } from '@castle-control/ui/steward';
import type { Snapshot } from '../../model.js';
import { ProposalLayers } from '../visuals/proposal-layers.jsx';
import { HexTable, TileInspector } from './hex-table.jsx';
import { TestLadder } from './test-ladder.jsx';
import './room.css';

export function StudioWork({ queue }: { queue?: ProposalQueue }) {
  const [tile, setTile] = useState('A1');
  const [rung, setRung] = useState(0);
  return <section className="studio-room" aria-label="Map Room work">
    <div className="studio-room-layout">
      <div className="studio-room-workbench">
        <HexTable selected={tile} on_select={setTile} />
        <div className="studio-room-panel-drafts" aria-label="War-table panel proposals" data-on-air="false">
          <ProposalLayers chamber="studio" {...(queue ? { queue } : {})} />
        </div>
      </div>
      <div className="studio-room-details">
        <TileInspector selected={tile} />
        <TestLadder selected={rung} on_select={setRung} />
        <p>Human operator · AI proposes, the human approves in the shared seal slot.</p>
      </div>
    </div>
  </section>;
}

export default function StudioRoom({ snapshot }: { snapshot: Snapshot }) {
  if (snapshot.mode !== 'fixture') return <EmptyState title="Map Room is not configured"
    description="No live studio is connected. Twitch policy clearance is pending; no Extension is available." />;
  return <StudioWork />;
}
