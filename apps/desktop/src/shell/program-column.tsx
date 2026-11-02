import { DraftFrame, PreviewMonitor, ProgramMonitor, SealButton, chambers } from '@castle-control/ui';
import { Drawer } from '@castle-control/ui/chamber';
import type { ModuleId } from '@castle-control/ui';
import { isPending } from '@castle-control/ui/steward';
import { useId, useState } from 'react';
import type { Snapshot } from '../model.js';
import type { StewardConnection } from '../client.js';
import { dispatchShortcut } from '../navigation.js';
import { StreamScene } from '../overview/scene.jsx';
import { useSampleProgram } from './program.js';
import { shellRoles } from './roles.jsx';
import './program-column.css';

/** Kept under its existing export: the former column is now three cells in the Keep sill. */
export function ProgramColumn({ snapshot, selected, connection }: {
  snapshot: Snapshot; selected: ModuleId; connection?: StewardConnection;
}) {
  const { queue, program, candidate, notice, sealing, proclaim } = useSampleProgram(selected, connection);
  const [detail, setDetail] = useState<'preview' | 'program' | undefined>(undefined);
  const caption = useId();
  const draft = queue.proposals.find(item => item.id === candidate?.id && isPending(item));
  const chamber = chambers.find(item => item.id === candidate?.chamber)?.name;
  const pending = queue.proposals.filter(isPending);
  return <aside className="shell-program-column" aria-label="Preview and Program" tabIndex={0}
    onKeyDown={event => {
      if (!detail || event.key !== 'Escape') return;
      dispatchShortcut({ key: event.key, ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey,
        isComposing: event.nativeEvent.isComposing, preventDefault: () => { event.preventDefault(); } }, false,
      () => undefined, undefined, { back: () => { setDetail(undefined); } });
    }}>
    {shellRoles(PreviewMonitor({ children: <>
      {draft ? <DraftFrame><b>{draft.title}</b><span>Revision {draft.revision} · {chamber}</span></DraftFrame>
        : <p className="shell-program-empty"><b>Nothing in Preview</b><span>Ask the Steward to draft one.</span></p>}
      <button type="button" className="shell-sill-link" onClick={() => { setDetail('preview'); }}>Review drafts{pending.length ? ` · ${pending.length}` : ''}</button>
    </> }))}
    <div className="shell-program-proclaim" role="group" aria-describedby={caption}>
      <div data-role="seal"><SealButton key={`${candidate?.id}-${candidate?.revision}-${candidate?.state}`}
        variant="proclaim" disabled={!candidate || sealing} on_seal={() => { void proclaim(); }} /></div>
      {notice ? <p id={caption} className="shell-program-status" role="status">{notice}</p>
        : <p id={caption}>{candidate ? `Next: ${candidate.title} · rev ${candidate.revision}` : 'Nothing to proclaim: ask the Steward to draft one'}</p>}
      <p className="shell-program-note" data-role="colnote">Drafts wait for your hold · no OBS output</p>
    </div>
    {shellRoles(ProgramMonitor({ children: <>
      <div className="shell-program-summary" data-scene="program">
        {program.length ? program.slice(-1).map(item => <p key={item.id}><b>{item.title}</b><span>Revision {item.revision} · simulated</span></p>)
          : <p>Simulated program picture · nothing proclaimed yet</p>}
      </div>
      <button type="button" className="shell-sill-link" onClick={() => { setDetail('program'); }}>View program picture{program.length > 1 ? ` · all ${program.length} layers` : ''}</button>
    </> }))}
    <Drawer open={detail !== undefined} onClose={() => { setDetail(undefined); }}
      title={detail === 'preview' ? 'Preview · drafts only' : 'Program · simulated'}
      description="Sample picture only · nothing is sent to OBS">
      {detail === 'preview' ? <>{pending.length ? pending.map(item => <DraftFrame key={item.id}>
        <div className="shell-program-draft"><b>{item.title}</b><span>Revision {item.revision} · {chambers.find(room => room.id === item.chamber)?.name}</span>
          {item.fields.map(field => <span key={field.key}>{field.label}: {String(field.value)}</span>)}</div>
      </DraftFrame>) : <p>Nothing in Preview. Ask the Steward to draft one.</p>}</>
        : <StreamScene mode="program" proposals={program} sample={snapshot.mode === 'fixture'} />}
    </Drawer>
  </aside>;
}
