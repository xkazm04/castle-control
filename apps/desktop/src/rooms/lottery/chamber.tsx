import { RoomKeyBadge } from '../../shell/steward-keys.jsx';
import type { ReactNode } from 'react';
import { ChamberLayout, ChamberSection, Drawer } from '@castle-control/ui/chamber';

export type LotChamberProps = {
  picture: ReactNode; preview: ReactNode; program: ReactNode;
  setup: ReactNode; question: ReactNode; roll: ReactNode; cast: ReactNode; proof: ReactNode;
  tools: ReactNode; tools_open: boolean; on_tools: () => void; on_close: () => void;
  theatre: boolean; simulated: boolean; drafting: boolean; replay?: boolean;
  banner?: ReactNode;
  label?: string; busy?: boolean;
};

/** The same frame in fixture and core mode; every slot keeps its original authority. */
export function LotChamber(props: LotChamberProps) {
  const { picture, preview, program, setup, question, roll, cast, proof, tools,
    tools_open, on_tools, on_close, theatre, simulated, drafting, replay, banner } = props;
  return <div className="lottery-room" role="region" aria-label={props.label ?? 'Lot Chamber'} aria-busy={props.busy}
    data-theatre={theatre} data-replay={replay}
    data-phase={drafting ? 'draft' : undefined} onKeyDown={event => {
      if (event.key === 'Escape' && tools_open && !event.defaultPrevented) {
        event.preventDefault(); event.stopPropagation(); on_close();
      }
    }}>
    {banner}
    <ChamberLayout picture={picture} picture_label="Lot ceremony" preview={preview} program={program}
      caption={drafting ? 'Preview · draft, nothing sealed' : simulated ? 'as it is on air · SIMULATED' : 'Core ceremony · stylised illustration'}
      program_title={simulated ? 'Program · SIMULATED' : 'Program · core'}
      columns={[
        <><ChamberSection title="Set up the draw">{setup}</ChamberSection>
          <ChamberSection title="Questions for the hall">{question}</ChamberSection></>,
        <>{roll}<ChamberSection title="Cast the lots">{cast}</ChamberSection>
          <ChamberSection title="Prove it · the writ">{proof}
            <button type="button" className="cc-btn cc-btn--quiet" aria-expanded={tools_open}
              onClick={on_tools}><RoomKeyBadge room="lottery" action="tools" />The writ and draw tools</button>
          </ChamberSection></>,
      ]} />
    <Drawer open={tools_open} onClose={on_close} title="The writ and the draw tools"
      description={simulated ? 'SIMULATED · generated sample data' : 'Core draw · full proof and tools'}>{tools}</Drawer>
  </div>;
}
