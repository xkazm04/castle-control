import { Children, cloneElement } from 'react';
import { ChamberStrip } from '@castle-control/ui';
import type { ChamberStripProps } from '@castle-control/ui';
import { proposalQueue } from '@castle-control/ui/steward';
import { useSyncExternalStore } from 'react';
import type { Snapshot } from '../model.js';
import { sampleProgram } from '../overview/program.js';
import { stripStates } from './strip-states.js';
import { shellRoles } from './roles.jsx';

type StripProps = Pick<ChamberStripProps, 'states' | 'on_open'> & { current: NonNullable<ChamberStripProps['current']>; on_keep: () => void };

export function ShellStrip({ current, states, on_open, on_keep }: StripProps) {
  const tree = ChamberStrip({ current, selected: current === 'keep' ? 'lottery' : current, states,
    on_select: () => undefined, on_open, on_keep });
  return shellRoles(cloneElement(tree, {}, Children.map(tree.props.children, tile => {
    const id = tile.props['data-room-tile'];
    return cloneElement(tile, { 'aria-pressed': undefined, onDoubleClick: undefined,
      onClick: () => id === 'keep' ? on_keep() : on_open(id) });
  })));
}

export function PersistentStrip({ snapshot, ...props }: Omit<StripProps, 'states'> & { snapshot: Snapshot }) {
  const queue = useSyncExternalStore(proposalQueue.subscribe, proposalQueue.getSnapshot, proposalQueue.getSnapshot);
  const program = useSyncExternalStore(sampleProgram.subscribe, sampleProgram.getSnapshot, sampleProgram.getSnapshot);
  return <ShellStrip {...props} states={stripStates(snapshot, queue.proposals, program)} />;
}
