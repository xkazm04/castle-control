import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ProposalCard } from '@castle-control/ui';
import { DesignFocus, designSession } from '@castle-control/ui/design';
import type { ArtifactId, DesignSession, DesignSnapshot } from '@castle-control/ui/design';
import type { Proposal } from '@castle-control/ui/steward';
import { roomArtifactLabels } from './actions.jsx';
import type { RoomDesignSelection } from './actions.jsx';

export function RoomDesignDialog({ selection, on_close, session = designSession }: {
  selection: RoomDesignSelection; on_close: () => void; session?: DesignSession;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    const trigger = document.activeElement;
    node.showModal();
    node.querySelector<HTMLElement>(selection.action === 'custom' ? 'input' : 'select')?.focus();
    return () => { node.close(); if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus(); };
  }, [selection.action]);
  return <dialog ref={dialog} className="room-design-dialog" aria-label={`${roomArtifactLabels[selection.artifact]} design`}
    onCancel={event => { event.preventDefault(); event.stopPropagation(); on_close(); }}
    onKeyDown={event => event.stopPropagation()}>
    <button type="button" className="room-design-close" onClick={on_close}>Back to the room</button>
    <DesignFocus artifact={selection.artifact} session={session} />
  </dialog>;
}

export function RoomDesignProposal({ proposal, artifact, focused, on_open, session = designSession }: {
  proposal: Proposal; artifact: ArtifactId; focused: boolean; on_open: () => void; session?: DesignSession;
}) {
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  return <RoomDesignProposalView proposal={proposal} artifact={artifact} focused={focused} on_open={on_open}
    session={session} snapshot={snapshot} />;
}

export function RoomDesignProposalView({ proposal, artifact, focused, on_open, session, snapshot }: {
  proposal: Proposal; artifact: ArtifactId; focused: boolean; on_open: () => void; session: DesignSession; snapshot: DesignSnapshot;
}) {
  const [error, setError] = useState<{ proposal_id: string; artifact: ArtifactId; reason: string }>();
  const capture = (result: { readonly ok: true } | { readonly ok: false; readonly reason: string }) => {
    setError(result.ok ? undefined : { proposal_id: proposal.id, artifact, reason: result.reason });
  };
  const preview = snapshot.previews[proposal.id];
  const ready = preview !== undefined && session.canSeal(preview);
  return <section className="room-design-proposal" aria-label={`${roomArtifactLabels[artifact]} proposal`}>
    <p>SIMULATED · {roomArtifactLabels[artifact]} · {ready ? 'Preview ready' : preview ? 'Stale draft · preview again' : 'Preview required'}</p>
    <button type="button" onClick={on_open}>Review design</button>
    <button type="button" onClick={() => { capture(session.preview(proposal.id)); on_open(); }}>Preview draft</button>
    <ProposalCard key={`${proposal.id}:${proposal.revision}:${preview?.base_revision}:${ready}`}
      proposal={proposal} focused={focused} busy={!ready}
      on_focus={() => { if (session.queue.getSnapshot().selected_proposal_id !== proposal.id) session.queue.select(proposal.id); }}
      on_tear={() => capture(session.tearUp(proposal.id))} on_seal={() => { if (preview) capture(session.seal(preview)); }} />
    {error?.proposal_id === proposal.id && error.artifact === artifact && <p role="alert">{error.reason}</p>}
  </section>;
}
