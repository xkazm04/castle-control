import type { ModuleId } from '@castle-control/ui';
import type { StewardConnection } from '../client.js';
import { Keep } from '../keep/keep.jsx';
import type { KeepProps } from '../keep/keep.jsx';
import { ProgramColumn } from './program-column.jsx';
import '@castle-control/ui/fused/surface.css';
import '@castle-control/ui/fused/glass.css';

export default function KeepWorkspace({ selected = 'lottery', connection, ...props }: KeepProps & {
  selected?: ModuleId; connection?: StewardConnection;
}) {
  return <div className="shell-keep-workspace"><Keep {...props}
    aside={<ProgramColumn snapshot={props.snapshot ?? { mode: 'fixture', phase: 'ready' }} selected={selected}
      {...(connection ? { connection } : {})} />} />
  </div>;
}
