import { useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChamberSection, Drawer } from '@castle-control/ui/chamber';
import { BracketSheet } from './duel-bracket.jsx';
import type { DuelPicture } from './duel-model.js';

export type DuelDetails = { open: boolean; content: ReactNode; on_close: () => void };

/** Keep local draft forms mounted across drawer closes. Only their DOM host moves;
 * the React portal and its state keep the same identity, like the old hidden slot.
 * The drawer itself lives outside the shell's fading/transforming room frame.
 */
export function DuelDrawer({ open, on_close, picture, tools, notice, details }: {
  open: boolean; on_close: () => void; picture: DuelPicture; tools?: ReactNode; notice?: ReactNode;
  details?: DuelDetails | undefined;
}) {
  const [host] = useState(() => typeof document === 'undefined' ? null : document.createElement('div'));
  const drawer = <div className="duel-details" data-chamber="studio" onKeyDown={event => {
    // Drawer keys never call a hidden tournament. Nested menus and demos handle their own keys first.
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); on_close(); }
  }}><Drawer open={open} onClose={on_close} title="Full bracket"
    description={`Map Room · ${picture.simulated ? 'SIMULATED' : 'core tournament'}`}>
    <ChamberSection title="Full bracket with seeds"><BracketSheet picture={picture} /></ChamberSection>
    <ChamberSection title="More of the Map Room">{tools}</ChamberSection>
    {notice}
    {host && <div ref={node => { if (node && host.parentNode !== node) node.appendChild(host); }} />}
  </Drawer>
    {host ? createPortal(details?.content, host) : <div hidden={!open}>{details?.content}</div>}
  </div>;
  return typeof document === 'undefined' ? drawer : createPortal(drawer, document.body);
}
