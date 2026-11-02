import type { ReactNode } from 'react';
import { ChamberLayout, ChamberSection, Drawer } from '@castle-control/ui/chamber';
import './deck.css';

/** Common frame for fixture and core; every slot uses its room's existing data. */
export function BeaconDeck({ picture, reading, preview, program, picker, weighting, actions, drawer,
  open, on_open, on_close, caption, core = false }: {
  picture: ReactNode; reading: ReactNode; preview: ReactNode; program: ReactNode;
  picker: ReactNode; weighting?: ReactNode; actions: ReactNode; drawer: ReactNode;
  open: boolean; on_open: () => void; on_close: () => void; caption: ReactNode; core?: boolean;
}) {
  return <>
    <ChamberLayout picture={picture} picture_label="Beacon stream picture" caption={caption}
      preview={preview} program={program} program_title={core ? 'Program · core configuration' : 'Program · SIMULATED'}
      columns={[
        <ChamberSection key="selected" title="The selected beacon" aside={<span className="visuals-deck-tag">In the picture</span>}>
          {reading}{weighting}<div className="visuals-deck-actions">{actions}</div>
        </ChamberSection>,
        <ChamberSection key="beacons" title="The beacons">
          {picker}<button type="button" className="cc-btn visuals-drawer-trigger" aria-haspopup="dialog"
            aria-expanded={open} onClick={on_open}>More of the beacons</button>
        </ChamberSection>,
      ]} />
    <Drawer open={open} onClose={on_close} title="More of the beacons"
      description={core ? 'Core configurations · test fires and sample pictures are SIMULATED' : 'Generated sample data · SIMULATED'}>
      {drawer}
    </Drawer>
    {/* Like the former closed disclosure, pre-render the tools while closed.
        They stay hidden and inert; the shared Drawer presents them on request. */}
    {!open && <div hidden inert className="visuals-drawer-rest">{drawer}</div>}
  </>;
}
