import { useState } from 'react';
import type { ReactNode } from 'react';
import { EmptyState } from '@castle-control/ui';
import type { ProposalQueue } from '@castle-control/ui/steward';
import type { Snapshot } from '../../model.js';
import { ProposalLayers } from '../visuals/proposal-layers.jsx';
import { HexTable, TileInspector } from './hex-table.jsx';
import { TestLadder } from './test-ladder.jsx';
import './room.css';

export function StudioWork({ queue, seal_slot }: { queue?: ProposalQueue; seal_slot?: ReactNode }) {
  const [tile, setTile] = useState('A1');
  const [rung, setRung] = useState(0);
  return <section className="studio-room" aria-label="Map Room work">
    <div className="studio-room-layout">
      <div className="studio-room-workbench">
        <p className="room-caption">The war table · 9 × 6 hexes · illustrative territory</p>
        <HexTable selected={tile} on_select={setTile} />
        <div className="studio-room-panel-drafts" aria-label="War-table panel proposals" data-on-air="false">
          <ProposalLayers chamber="studio" {...(queue ? { queue } : {})} />
        </div>
      </div>
      <div className="studio-room-details">
        <p className="room-caption">This turn · local sand table</p>
        <p className="room-now">Now: inspecting {tile} · simulated</p>
        <TileInspector selected={tile} />
        <TestLadder selected={rung} on_select={setRung} />
        <p>Human operator · AI proposes, the human approves in the shared seal slot.</p>
        {seal_slot}
      </div>
    </div>
  </section>;
}

export default function StudioRoom({ snapshot, seal_slot }: { snapshot: Snapshot; seal_slot?: ReactNode }) {
  if (snapshot.mode !== 'fixture') return <EmptyState title="Map Room is not configured"
    description="No live studio is connected. Twitch policy clearance is pending; no Extension is available." />;
  return <StudioWork seal_slot={seal_slot} />;
}
