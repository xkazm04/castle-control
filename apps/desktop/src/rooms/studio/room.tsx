import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { EmptyState, Plate } from '@castle-control/ui';
import type { ProposalQueue } from '@castle-control/ui/steward';
import { useStewardDraft } from '@castle-control/ui/steward-flow';
import { designSession } from '@castle-control/ui/design';
import type { DesignSession } from '@castle-control/ui/design';
import type { Snapshot } from '../../model.js';
import { coreTiltyardConnection } from '../../client.js';
import { studioCopy as copy } from '../../studio-copy.js';
import { ProposalLayers } from '../visuals/proposal-layers.jsx';
import { HexTable, TileInspector } from './hex-table.jsx';
import { TestLadder } from './test-ladder.jsx';
import { BannerInspector, StudioDesignControls } from './design.jsx';
import { boardForSize, createStudioSession, updateStudioSession } from './session.js';
import type { SessionField } from './session.js';
import type { StudioBoard } from './board.js';
import { Spyglass } from './spyglass.jsx';
import { RehearseWork } from './rehearse.jsx';
import { RehearseSide } from './rehearse-side.jsx';
import { rehearseCopy } from './rehearse-copy.js';
import { useRehearse } from './use-rehearse.js';
import { sizeChoices } from './rehearse-state.js';
import { duelDraftFlows } from './steward-flows.js';
import type { DuelDraft } from './duel-model.js';
import './room.css';
import './hex-field.css';

const TiltyardView = lazy(() => import('./tiltyard-view.jsx'));
export type StudioView = 'table' | 'spyglass' | 'rehearse';
export type RoomView = 'duel' | 'show' | 'ladder' | 'proposals' | StudioView;

export function StudioViewSwitch({ view, on_view }: { view: StudioView; on_view: (view: StudioView) => void }) {
  return <div className="studio-view-switch" role="group" aria-label={copy.view}>
    <button type="button" aria-pressed={view === 'table'} onClick={() => on_view('table')}>{copy.table}</button>
    <button type="button" aria-pressed={view === 'spyglass'} onClick={() => on_view('spyglass')}>{copy.spyglass}</button>
    <button type="button" aria-pressed={view === 'rehearse'} onClick={() => on_view('rehearse')}>{rehearseCopy.view}</button>
  </div>;
}

/** The sand table, Spyglass and Rehearse: local demos behind More. */
export function StudioWork({ queue, seal_slot, board, design_session = designSession, view: shown, on_view }: {
  queue?: ProposalQueue; seal_slot?: ReactNode; board?: StudioBoard; design_session?: DesignSession;
  view?: StudioView; on_view?: (view: StudioView) => void;
}) {
  const looks = useSyncExternalStore(design_session.subscribe, design_session.getSnapshot, design_session.getSnapshot).looks;
  const [session, setSession] = useState(() => createStudioSession(board));
  const [rung, setRung] = useState(0);
  const [own, setOwn] = useState<StudioView>('table');
  const view = shown ?? own;
  const current_board = board ?? boardForSize(session.design.size);
  const size_choices = board ? undefined : sizeChoices;
  const rehearse = useRehearse(current_board, size_choices);
  const end_board = rehearse.view.done ? rehearse.state.run?.turns.at(-1)?.board : undefined;
  // Leaving Rehearse pauses the round, so a hidden view never plays on or announces turns.
  const open = (next: StudioView) => { if (view === 'rehearse' && next !== 'rehearse') rehearse.handlers.pause(); setOwn(next); on_view?.(next); };
  const change = (field: SessionField, value?: string) => setSession(state => updateStudioSession(state, field, value, board));
  return <div className="studio-sand cc-herald" data-view={view}>
    <div className="studio-table-work" data-studio-view={view}>
      <StudioViewSwitch view={view} on_view={open} />
      {view === 'rehearse' ? <RehearseWork {...rehearse} size={session.design.size} look={looks.map.output.style}
        {...(size_choices ? { sizes: size_choices } : {})} />
        : view === 'spyglass' ? <>
          {end_board && <p className="studio-spyglass-note" role="status">{rehearseCopy.spyglass_note(rehearse.state.run?.setup.seed ?? '')}</p>}
          <Spyglass board={end_board ?? current_board} size={session.design.size} session={design_session} />
        </> : <HexTable selected={session.selected} on_select={id => change('tile', id)} board={current_board}
          size={session.design.size} look={looks.map.output.style} />}
    </div>
    <div className="cc-herald-side" role="region" aria-label={copy.side_label} tabIndex={0} aria-describedby="studio-scroll-hint">
      <p id="studio-scroll-hint" className="studio-visually-hidden">{copy.side_hint}</p>
      {view === 'rehearse' ? <RehearseSide {...rehearse} size={session.design.size}
        {...(size_choices ? { on_size: (id: string) => change('size', id) } : {})} /> : <>
        <TileInspector selected={session.selected} board={current_board} />
        <BannerInspector selected={session.selected} board={current_board} on_select={side => change('banner', side)} />
      </>}
      <StudioDesignControls session={session} on_change={change} {...(board ? { board } : {})} />
      <TestLadder selected={rung} on_select={setRung} />
      <div className="studio-room-panel-drafts" aria-label={copy.drafts} data-on-air="false">
        <ProposalLayers chamber="studio" {...(queue ? { queue } : {})} />
      </div>
      <div className="studio-seal-group"><p className="cc-side-fine">{copy.operator}</p>
        {seal_slot && <Plate variant="plain" border_ink="rule" className="cc-seal-card">{seal_slot}</Plate>}
      </div>
    </div>
  </div>;
}

const moreItems: readonly { id: Exclude<RoomView, 'duel'>; label: string; line: string }[] = [
  { id: 'show', label: copy.more_show, line: copy.more_show_line },
  { id: 'ladder', label: copy.more_ladder, line: copy.more_ladder_line },
  { id: 'table', label: copy.more_table, line: copy.more_table_line },
  { id: 'spyglass', label: copy.more_spyglass, line: copy.more_spyglass_line },
  { id: 'rehearse', label: copy.more_rehearse, line: copy.more_rehearse_line },
  { id: 'proposals', label: copy.more_proposals, line: copy.more_proposals_line },
];
export const viewName = (view: RoomView) => view === 'duel' ? copy.duel : moreItems.find(item => item.id === view)?.label ?? view;

/** One disclosure for every rarely used view; each is a labelled local demo. */
export function MoreMenu({ view, on_view }: { view: RoomView; on_view: (view: RoomView) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    first.current?.focus();
    const away = (event: MouseEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => { document.removeEventListener('mousedown', away); };
  }, [open]);
  return <div ref={box} className="studio-more" onKeyDown={event => {
    event.stopPropagation();
    if (event.key === 'Escape' && open) { event.preventDefault(); setOpen(false); box.current?.querySelector('button')?.focus(); }
  }}>
    <button type="button" className="cc-btn cc-btn--sm" aria-haspopup="menu" aria-expanded={open}
      onClick={() => setOpen(value => !value)}>{copy.more}</button>
    {open && <div className="studio-more__menu" role="menu" aria-label={copy.more_label}>
      {view !== 'duel' && <button type="button" role="menuitem" className="studio-more__item"
        onClick={() => { setOpen(false); on_view('duel'); }}><b>{copy.back_to_duel}</b><span>{copy.duel_line}</span></button>}
      {moreItems.map((item, index) => <button key={item.id} ref={index === 0 ? first : undefined} type="button" role="menuitem"
        className="studio-more__item" aria-current={view === item.id || undefined}
        onClick={() => { setOpen(false); on_view(item.id); }}><b>{item.label}</b><span>{item.line}</span></button>)}
      <p className="studio-more__fine"><span className="cc-sim">Simulated</span>{copy.more_fine}</p>
    </div>}
  </div>;
}

export default function StudioRoom({ snapshot, seal_slot }: { snapshot: Snapshot; seal_slot?: ReactNode }) {
  const [view, setView] = useState<RoomView>('duel');
  const publication = useStewardDraft('studio');
  const draft = publication && duelDraftFlows.includes(publication.flow) ? publication.draft as DuelDraft : undefined;
  const drafting = draft !== undefined;
  // A duel draft takes the stage, wherever the room was.
  useEffect(() => { if (drafting) setView('duel'); }, [drafting]);
  const fixture = snapshot.mode === 'fixture';
  const connection = fixture ? undefined : coreTiltyardConnection(snapshot);
  if (!fixture && !connection) return <section className="studio-room studio-core" aria-label={copy.work} data-view="duel">
    <EmptyState title={copy.bare} description={copy.unconfigured} />{seal_slot}
  </section>;
  const more = <MoreMenu view={view} on_view={setView} />;
  const duelish = view === 'duel' || view === 'show' || view === 'ladder';
  return <section className={`studio-room${fixture ? '' : ' studio-core'}`} aria-label={copy.work} data-view={view}>
    {view !== 'duel' && <div className="studio-away">
      <button type="button" className="cc-btn cc-btn--sm" onClick={() => setView('duel')}>{copy.back_to_duel}</button>
      <b className="studio-away__name">{viewName(view)}</b>
      {view !== 'proposals' && <span className="cc-sim">{copy.local_demo}</span>}
      <span className="studio-away__line">{view === 'proposals' ? copy.proposals_away : copy.local_line}</span>
      {more}
    </div>}
    {duelish ? <Suspense fallback={<p className="studio-loading" role="status">{copy.loading}</p>}>
      <TiltyardView connection={connection} view={view === 'duel' ? 'duel' : view} draft={draft} tools={more} />
    </Suspense> : view === 'proposals' ? !seal_slot && <EmptyState title={copy.proposals_none} description={copy.proposals_away} />
      : <StudioWork seal_slot={seal_slot} view={view} on_view={setView} />}
    {/* Design proposals sit behind More; the slot stays mounted (hidden) beside the duel so a half-made draft keeps its state. */}
    {(duelish || view === 'proposals') && seal_slot && <div className="studio-proposals" hidden={view !== 'proposals'}>
      <Plate variant="plain" border_ink="rule" className="cc-seal-card">{seal_slot}</Plate>
    </div>}
  </section>;
}
