import { useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChamberSection, Drawer } from '@castle-control/ui/chamber';
import { BracketSheet } from './duel-bracket.jsx';
import type { DuelPicture } from './duel-model.js';
import { keyFor } from '../../shell/steward-keys.jsx';

export type DuelDetails = { open: boolean; content: ReactNode; on_close: () => void };

/** Keep local draft forms mounted across drawer closes. Only their DOM host moves;
 * the React portal and its state keep the same identity, like the old hidden slot.
 * The drawer itself lives outside the shell's fading/transforming room frame.
 */
export function DuelDrawer({ open, on_close, picture, tools, actions, notice, details }: {
  open: boolean; on_close: () => void; picture: DuelPicture; tools?: ReactNode; notice?: ReactNode;
  actions?: ReactNode;
  details?: DuelDetails | undefined;
}) {
  const [host] = useState(() => typeof document === 'undefined' ? null : document.createElement('div'));
  const total = picture.counts[0] + picture.counts[1];
  const percent = total ? Math.round(picture.counts[0] / total * 100) : 0;
  const drawer = <div className="duel-details" data-chamber="studio" onKeyDown={event => {
    // The moved controls retain their table shortcuts. A local demo/form keeps its own keys.
    if (!details?.open && ['speed', 'reset', 'stream'].some(action => keyFor('studio', action)?.toLowerCase() === event.key.toLowerCase())) return;
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); on_close(); }
  }}><Drawer open={open} onClose={on_close} title="Full bracket"
    description={`Map Room · ${picture.simulated ? 'SIMULATED' : 'core tournament'}`}>
    <ChamberSection title="Full bracket with seeds"><BracketSheet picture={picture} /></ChamberSection>
    <ChamberSection title="Duel tools and details">
      {actions}
      <p>Current match: {picture.left?.title ?? 'No contestant'} · {picture.right?.title ?? 'No contestant'}</p>
      {total > 0 && <p>Counted ballot share: {percent}% left · {100 - percent}% right</p>}
      {(picture.rounds[0]?.length ?? 0) > 2 && <p>Quarterfinals and all seeds are in the full bracket.</p>}
      {picture.barred !== undefined && <p data-role="ty-barred">{picture.barred} barred by moderation · never counted</p>}
      {picture.source === 'core' && <p>Counted by the core after moderation</p>}
      {Object.values(picture.entrants).some(entrant => entrant.note) && <dl className="duel-entrant-notes" aria-label="Contestant notes">
        {Object.values(picture.entrants).filter(entrant => entrant.note).map(entrant => <div key={entrant.id}>
          <dt>{entrant.title}</dt><dd>{entrant.note}</dd>
        </div>)}
      </dl>}
    </ChamberSection>
    <ChamberSection title="More of the Map Room">{tools}</ChamberSection>
    {notice}
    {host && <div ref={node => { if (node && host.parentNode !== node) node.appendChild(host); }} />}
  </Drawer>
    {host ? createPortal(details?.content, host) : <div hidden={!open}>{details?.content}</div>}
  </div>;
  return typeof document === 'undefined' ? drawer : createPortal(drawer, document.body);
}
