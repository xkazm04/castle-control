import { DesignFocus, designSession, presetsFor } from '@castle-control/ui/design';
import type { ArtifactId, DesignOutput, DesignSession } from '@castle-control/ui/design';
import { WindowedRows } from '@castle-control/ui';
import type { ModuleId } from '@castle-control/ui';
import { isPending } from '@castle-control/ui/steward';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { isDesignProposal } from './design-proposal.js';
import './design.css';

const artifacts: Readonly<Record<ModuleId, readonly ArtifactId[]>> = {
  lottery: ['draw'], moderator: ['overlay'], visuals: ['beacon', 'overlay'], studio: ['map'],
};
const labels: Readonly<Record<ArtifactId, string>> = {
  draw: 'Draw shape', urn: 'Urn', beacon: 'Beacon visuals', map: 'War-table panel', overlay: 'Overlay',
};
export type DesignSelection = { artifact: ArtifactId; action: 'restyle' | 'custom'; proposal_id?: string };

export function designSelection(session: DesignSession, selection: DesignSelection): DesignSelection {
  const pending = session.queue.pending().filter(proposal => proposal.fields.some(field => field.key === 'artifact' && field.value === selection.artifact));
  const proposal = pending.find(item => item.id === session.queue.getSnapshot().selected_proposal_id) ?? pending.at(-1);
  return proposal ? { ...selection, proposal_id: proposal.id } : selection;
}

export function presetName(artifact: ArtifactId, output: DesignOutput): string {
  const preset = presetsFor(artifact).find(item => item.output.scene.shape === output.scene.shape);
  const name = preset?.label ?? 'Custom design';
  return preset && (output.style.ink !== preset.output.style.ink || output.style.treatment !== preset.output.style.treatment
    || output.style.density !== preset.output.style.density) ? `Custom design · ${name}` : name;
}

export function ArtifactActions({ artifact, output, on_open }: {
  artifact: ArtifactId; output: DesignOutput; on_open: (selection: DesignSelection) => void;
}) {
  return <div className="overview-design-artifact" role="group" aria-label={`${labels[artifact]} design`}>
    <b>{labels[artifact]}</b><span>Preset: {presetName(artifact, output)}</span>
    <div><button type="button" onClick={() => on_open({ artifact, action: 'restyle' })}>Restyle</button>
      <button type="button" onClick={() => on_open({ artifact, action: 'custom' })}>Custom design</button></div>
  </div>;
}

export function DesignInspector({ selected, session = designSession }: { selected: ModuleId; session?: DesignSession }) {
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const [focus, setFocus] = useState<DesignSelection>();
  const open = (selection: DesignSelection) => {
    const next = designSelection(session, selection);
    session.queue.select(next.proposal_id);
    setFocus(next);
  };
  const pending = snapshot.queue.proposals.filter(item => isPending(item) && isDesignProposal(item));
  const items = pending.filter(item => item.chamber === selected
    || selected === 'moderator' && item.fields.some(field => field.key === 'artifact' && field.value === 'overlay'));
  return <section className="overview-design-inspector" aria-label="Visual artifact designs">
    <strong>SIMULATED · DATA-ONLY DESIGNS</strong>
    {artifacts[selected].map(artifact => <ArtifactActions key={artifact} artifact={artifact} output={snapshot.looks[artifact].output}
      on_open={open} />)}
    {items.length > 0 && <WindowedRows rows={items} label="Design proposals" row_key={item => item.id} row_height={96}>
      {proposal => {
        const artifact = artifacts[selected].find(id => proposal.fields.some(field => field.key === 'artifact' && field.value === id));
        return artifact && <button type="button" key={proposal.id} onClick={() => {
          session.queue.select(proposal.id); setFocus({ artifact, action: 'restyle', proposal_id: proposal.id });
        }}>Review {proposal.title} · rev {proposal.revision}</button>;
      }}</WindowedRows>}
    {focus && <DesignDialog selection={focus} session={session} on_close={() => setFocus(undefined)} />}
  </section>;
}

export function DesignDialog({ selection, session, on_close }: {
  selection: DesignSelection; session: DesignSession; on_close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    node.showModal();
    node.querySelector<HTMLElement>(selection.action === 'custom' ? 'input' : 'select')?.focus();
    return () => { node.close(); };
  }, [selection.action]);
  return <dialog ref={dialog} className="overview-design-dialog" aria-label={`${labels[selection.artifact]} design`}
    onCancel={event => { event.preventDefault(); event.stopPropagation(); on_close(); }}
    onKeyDown={event => event.stopPropagation()}>
    <button type="button" className="overview-design-close" onClick={on_close}>Back to Inspector</button>
    <DesignFocus artifact={selection.artifact} session={session} />
  </dialog>;
}

export function DesignPresence({ artifact, mode, children }: { artifact: ArtifactId; mode: 'preview' | 'program'; children: ReactNode }) {
  const snapshot = useSyncExternalStore(designSession.subscribe, designSession.getSnapshot, designSession.getSnapshot);
  const preview = mode === 'preview' && Object.values(snapshot.previews).some(item => item.artifact === artifact);
  return snapshot.looks[artifact].revision > 1 || preview ? children : null;
}

// Only session-owned looks reach the picture. A queue's sealed/proclaimed flag has no authority here.
export function DesignArtwork({ artifact, mode, children, session = designSession }: {
  artifact: ArtifactId; mode: 'preview' | 'program'; children: ReactNode; session?: DesignSession;
}) {
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const previews = Object.values(snapshot.previews).filter(item => item.artifact === artifact);
  const preview = mode === 'preview'
    ? previews.find(item => item.proposal_id === snapshot.queue.selected_proposal_id) ?? previews.at(-1) : undefined;
  const look = snapshot.looks[artifact];
  if (!preview && look.revision === 1) return children;
  const output = preview?.output ?? look.output;
  return <div className="overview-design-look" data-ink={output.style.ink} data-treatment={output.style.treatment}
    data-density={output.style.density} aria-label={`SIMULATED ${labels[artifact]} ${mode}`}>
    <ArtifactPicture output={output} />
    <span>{presetName(artifact, output)} · SIMULATED</span>
    {preview && <b>DRAFT · NOT ON AIR{session.canSeal(preview) ? '' : ' · STALE'}</b>}
  </div>;
}

function ArtifactPicture({ output }: { output: DesignOutput }) {
  const shape = output.scene.shape;
  return <svg viewBox="0 0 160 100" role="img" aria-label={`${shape} · ${output.style.treatment} · ${output.style.density}`}>
    {shape === 'urn' ? <path d="M55 12h50l-7 18q35 50-18 56Q27 80 62 30Z M50 90h60" />
      : shape === 'wheel' ? <><circle cx="80" cy="50" r="42" /><path d="M38 50h84M80 8v84M50 20l60 60m0-60L50 80" /></>
      : shape === 'deck' ? <><rect x="45" y="12" width="65" height="75" rx="6" /><path d="m40 20-8 65 65 8M72 42l12-13 12 13-12 14Z" /></>
      : shape === 'ballot-box' || shape === 'draw' ? <path d="M30 40h100v50H30Zm0 0 15-15h70l15 15M65 31h30M72 5h22v22H72Z" />
      : shape === 'altar' ? <path d="M35 80h90v12H35Zm15-12h60v12H50ZM80 10q-30 30 0 50 30-20 0-50Z" />
      : shape === 'border' ? <path d="M15 35V10h35m60 0h35v25m0 30v25h-35m-60 0H15V65" />
      : shape === 'hex-map' ? <>{[30, 65, 100].map(x => <path key={x} d={`m${x} 20 20-10 20 10v25l-20 10-20-10Zm0 40 20-10 20 10v25l-20 10-20-10Z`} />)}</>
      : shape === 'choice-board' ? <>{[20, 65, 110].map(x => <rect key={x} x={x} y="15" width="30" height="70" />)}</>
      : shape === 'viewer-card' ? <><rect x="40" y="5" width="80" height="90" /><circle cx="80" cy="35" r="15" /><path d="M55 65h50m-50 15h40" /></>
      : shape === 'contribution-meter' ? <><rect x="10" y="30" width="140" height="40" /><path d="M20 40h90v20H20Z" /></>
      : shape === 'chat-overlay' ? <path d="M15 10h130v65H65L40 95V75H15Zm15 20h100M30 45h85M30 60h95" />
      : <><rect x="10" y="10" width="140" height="80" /><rect x="20" y="20" width="120" height="60" /></>}
  </svg>;
}
