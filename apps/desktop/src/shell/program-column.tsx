import { DraftFrame, EmptyState, PreviewMonitor, ProgramMonitor, SealButton, chambers } from '@castle-control/ui';
import type { ModuleId } from '@castle-control/ui';
import { isPending } from '@castle-control/ui/steward';
import { useId } from 'react';
import type { Snapshot } from '../model.js';
import type { StewardConnection } from '../client.js';
import { StreamScene } from '../overview/scene.jsx';
import { useSampleProgram } from './program.js';
import { shellRoles } from './roles.jsx';
import './program-column.css';

export function ProgramColumn({ snapshot, selected, connection }: {
  snapshot: Snapshot; selected: ModuleId; connection?: StewardConnection;
}) {
  const { queue, program, candidate, notice, sealing, proclaim } = useSampleProgram(selected, connection);
  const caption = useId();
  const draft = queue.proposals.find(item => item.id === candidate?.id && isPending(item));
  const chamber = chambers.find(item => item.id === candidate?.chamber)?.name;
  return <aside className="shell-program-column cc-monitor-column" aria-label="Preview and Program" tabIndex={0}>
    {shellRoles(PreviewMonitor({ children: draft ? <DraftFrame>
      <div className="shell-program-draft"><b>{draft.title}</b><span>Revision {draft.revision} · {chamber}</span>
        {draft.fields.map(field => <span key={field.key}>{field.key}: {String(field.value)}</span>)}</div>
    </DraftFrame> : <EmptyState compact title="Nothing in Preview" description="Ask the Steward to draft one." /> }))}
    {shellRoles(ProgramMonitor({ children: <StreamScene mode="program" proposals={program} sample={snapshot.mode === 'fixture'} /> }))}
    <div className="shell-program-proclaim" role="group" aria-describedby={caption}>
      <p id={caption}>{candidate ? `Next to proclaim: ${candidate.title} · rev ${candidate.revision} (${chamber ?? candidate.chamber})`
        : 'Nothing to proclaim: ask the Steward to draft one'}</p>
      <div data-role="seal"><SealButton key={`${candidate?.id}-${candidate?.revision}-${candidate?.state}`}
        variant="proclaim" disabled={!candidate || sealing} on_seal={() => { void proclaim(); }} /></div>
    </div>
    <p className="shell-program-note" data-role="colnote">Drafts stay in Preview until your hold. Sample picture only · nothing is sent to OBS.</p>
    {notice && <p className="shell-program-status" role="status">{notice}</p>}
    <div className="cc-fair" data-role="fair"><b>Fairness stays in the room</b>
      Free entry · equal odds. Paid entry and paid weight on prize draws are blocked by default. A barred message never counts toward a draw.
    </div>
  </aside>;
}
