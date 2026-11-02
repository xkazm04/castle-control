import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { DuelEvent } from '@castle-control/duel';
import { duelKeyAction, Shield, tiltyardWords } from '@castle-control/ui/duel';
import { ChamberLayout, ChamberSection } from '@castle-control/ui/chamber';
import { stewardDock } from '@castle-control/ui/steward-flow';
import { BracketSummary } from './duel-bracket.jsx';
import { DuelDrawer } from './duel-drawer.jsx';
import type { DuelDetails } from './duel-drawer.jsx';
import { DuelMini, DuelPictureView } from './duel-picture.jsx';
import { streamDuelFlow } from './steward-flows.js';
import { phaseWord, roundName, secondsLeft, verdictLine } from './duel-model.js';
import type { DuelEntrant, DuelPicture } from './duel-model.js';
import './duel.css';
import './duel-chamber.css';

function Contestant({ entrant, side, picture, action }: { entrant: DuelEntrant; side: 0 | 1; picture: DuelPicture; action?: ReactNode }) {
  const verdict = picture.verdict;
  const crowned = picture.phase === 'done' && picture.champion ? picture.champion.id === entrant.id : undefined;
  const result = verdict ? verdict.side === side ? 'won' : 'lost' : crowned === undefined ? undefined : crowned ? 'won' : 'lost';
  return <article className="duel-card" data-role="ty-card" data-side={side} data-result={result}
    aria-label={`${side === 0 ? 'Left' : 'Right'}: ${entrant.title}, seed ${entrant.seed}`}>
    <span className="duel-card__seed" data-role="ty-card-tag">{side === 0 ? 'Type 1' : 'Type 2'} · seed {entrant.seed}</span>
    <span className="duel-card__arms"><Shield item={{ id: entrant.id, title: entrant.title, by: entrant.by ?? 'streamer' }} words={tiltyardWords} /></span>
    <b className="duel-card__title" data-role="ty-card-title">{entrant.title}</b>
    {entrant.note && <i className="duel-card__note">{entrant.note}</i>}
    {result === 'won' && <span className="cc-stamp cc-stamp--inked cc-stamp--ok duel-card__stamp" data-role="ty-stamp">
      {crowned ? 'Champion' : verdict?.how === 'call' ? 'Your call' : verdict?.how === 'tie' ? 'Seed wins' : 'Chat chose'}</span>}
    {action && <div className="duel-card__act">{action}</div>}
  </article>;
}

function Tally({ picture }: { picture: DuelPicture }) {
  const [left, right] = picture.counts;
  const total = left + right;
  const share = total ? left / total : 0.5;
  const percent = Math.round(share * 100);
  return <div className="duel-tally" data-role="ty-tug" aria-label="Counted ballots">
    <b className="duel-tally__count" data-side="0" data-role="ty-count-left">{left}</b>
    <div className="duel-tally__bar" data-role="ty-tug-bar" data-empty={total === 0 || undefined}>
      <span className="duel-tally__l" style={{ flexGrow: Math.max(share, 0.001) }}>{total ? `${percent}%` : ''}</span>
      <span className="duel-tally__r" style={{ flexGrow: Math.max(1 - share, 0.001) }}>{total ? `${100 - percent}%` : ''}</span>
      <i className="duel-tally__mid" aria-hidden="true" />
    </div>
    <b className="duel-tally__count" data-side="1" data-role="ty-count-right">{right}</b>
    <p className="duel-tally__legend">
      <span><b>{total}</b> counted · one per viewer</span>
      {picture.barred !== undefined && <span data-role="ty-barred">{picture.barred} barred by moderation · never counted</span>}
      {picture.source === 'core' && <span>Counted by the core after moderation</span>}
    </p>
  </div>;
}

type Action = { id: string; label: string; event?: DuelEvent; tone?: 'primary' | 'call' | 'quiet'; disabled?: boolean };

function actionsFor(picture: DuelPicture): Action[] {
  const left = picture.left?.title ?? 'left';
  const right = picture.right?.title ?? 'right';
  switch (picture.phase) {
    case 'ready': return [{ id: 'open', label: 'Open the vote', event: { kind: 'enter' }, tone: 'primary' }];
    case 'live': return [
      { id: 'left', label: `Call ${left}`, event: { kind: 'pick', side: 0 }, tone: 'call' },
      { id: 'close', label: 'Close the vote', event: { kind: 'enter' }, tone: 'primary' },
      { id: 'right', label: `Call ${right}`, event: { kind: 'pick', side: 1 }, tone: 'call' },
      { id: 'off', label: 'Call it off', event: { kind: 'cancel' }, tone: 'quiet' },
    ];
    case 'verdict': return [
      { id: 'next', label: 'Next match', event: { kind: 'enter' }, tone: 'primary' },
      { id: 'off', label: 'Call it off', event: { kind: 'cancel' }, tone: 'quiet' },
    ];
    case 'called_off': return [{ id: 'resume', label: 'Resume the vote', event: { kind: 'enter' }, tone: 'primary' }];
    case 'done': return [{ id: 'again', label: 'Run it again', event: { kind: 'enter' }, tone: 'primary' }];
    case 'empty': return [];
  }
}

export type DuelStageProps = {
  picture: DuelPicture;
  /** The actual tournament remains Program while a Steward draft takes Preview. */
  program?: DuelPicture;
  details?: DuelDetails | undefined;
  on_event?: (event: DuelEvent) => void;
  /** Controls are frozen (core request in flight, disconnected, or a draft on show). */
  frozen?: boolean;
  /** Shown in place of the stage body when there is no tournament. */
  empty?: ReactNode;
  /** Extra controls on the tools row (More menu, source copy, refresh). */
  tools?: ReactNode;
  /** Status lines above the stage (core notices, demo banner). */
  notice?: ReactNode;
};

export function DuelStage({ picture, program = picture, details, on_event, frozen = false, empty, tools, notice }: DuelStageProps) {
  const root = useRef<HTMLElement>(null);
  const [sheet, setSheet] = useState(false);
  const drawer_open = sheet || details?.open === true;
  const closeDrawer = () => { setSheet(false); details?.on_close(); };
  // A selected More view owns the open state until it returns to the duel.
  useEffect(() => { if (details?.open) setSheet(false); }, [details?.open]);
  useEffect(() => { root.current?.focus({ preventScroll: true }); }, []);
  // An action button that leaves with its phase must not strand the keys on the page body.
  // Only focus that was on the stage comes back: the Steward sheet keeps its own.
  const held = useRef(true);
  useEffect(() => {
    const active = document.activeElement;
    if (held.current && !drawer_open && (active === null || active === document.body)) root.current?.focus({ preventScroll: true });
  }, [picture.phase, picture.match_key, drawer_open]);
  const draft = picture.source === 'draft';
  const send = (event: DuelEvent) => { if (!frozen && !draft) on_event?.(event); };
  const seconds = secondsLeft(picture);
  const verdict = verdictLine(picture);
  const size = (picture.rounds[0]?.length ?? 1) * 2;
  const actions = actionsFor(picture);
  const button = (action: Action) => <button key={action.id} type="button" data-action={action.id}
    className={`cc-btn duel-act duel-act--${action.tone ?? 'quiet'}${action.tone === 'primary' ? ' cc-btn--primary' : ''}`}
    disabled={frozen || draft || action.disabled} onClick={() => { if (action.event) send(action.event); }}>
    <span>{action.label}</span>
  </button>;
  const call = (side: 'left' | 'right') => actions.find(action => action.id === side);
  const centre = actions.filter(action => action.id !== 'left' && action.id !== 'right');
  return <section ref={root} className="duel" data-role="ty-duel" data-source={picture.source} data-phase={picture.phase}
    data-match-key={picture.match_key} data-draft={draft || undefined} aria-label="The duel stage" tabIndex={-1}
    onFocus={() => { held.current = true; }}
    onBlur={event => { if (event.relatedTarget !== null && !event.currentTarget.contains(event.relatedTarget)) held.current = false; }}
    onKeyDown={event => {
      if (drawer_open) {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeDrawer(); }
        return;
      }
      if (draft || frozen || picture.phase === 'empty') return;
      const action = duelKeyAction(event, { phase: picture.phase === 'ready' ? 'called_off' : picture.phase });
      if (action === null || action === 'mode_prev' || action === 'mode_next') return;
      event.preventDefault(); event.stopPropagation();
      if (action === 'pick_left' || action === 'pick_right') send({ kind: 'pick', side: action === 'pick_left' ? 0 : 1 });
      else send({ kind: action === 'cancel' ? 'cancel' : action === 'undo' ? 'undo' : 'enter' });
    }}>
    <ChamberLayout picture={<DuelPictureView picture={picture} />} picture_label="Map Room duel picture"
      caption={draft ? 'Draft · not on air' : picture.simulated ? 'As it is on air · SIMULATED' : 'As it is on air · core tournament'}
      preview={draft ? <DuelMini picture={picture} /> : <p className="duel-mini">Nothing in Preview. Ask the Steward to draft a duel.</p>}
      program={<><DuelMini picture={program} />{program.source === 'core' && notice}</>}
      program_title={program.simulated ? 'Program · SIMULATED' : 'Program · core tournament'}
      columns={[
      <ChamberSection key="duel" title="The duel" aside={<div className="duel__marks">
        {draft && <span className="cc-stamp cc-stamp--draft" data-role="ty-draft">Draft · not started</span>}
        {picture.demo && <span className="cc-stamp cc-stamp--key">Demo</span>}
        {picture.simulated && <span className="cc-sim" data-role="ty-simulated">Simulated</span>}
      </div>}>
      <div className="duel__heading">
        <p className="cc-rubric duel__rubric" data-role="ty-round">{picture.phase === 'empty' ? 'The duel' : roundName(size, picture.round)}</p>
        <h2 className="duel__title">{picture.prompt ?? picture.title}</h2>
      </div>
    {picture.phase === 'empty' ? <div className="duel__empty">{empty}</div> : <>
      <div className="duel__field" data-role="ty-arena" data-live={picture.phase === 'live' ? '1' : '0'}
        data-verdict={picture.verdict?.side ?? -1}>
        {picture.left && <Contestant entrant={picture.left} side={0} picture={picture} action={call('left') && button(call('left')!)} />}
        <div className="duel__centre">
          <span className="duel__match" data-role="ty-match-label">Match {picture.match} of {picture.matches}{draft
            ? ` · ${picture.window_ms / 1000} s to vote` : ''}</span>
          {picture.phase === 'done' || picture.phase === 'verdict' ? <span className="duel__crown" data-phase={picture.phase} aria-hidden="true" />
            : <span className="duel__clock" data-role="ty-secs" data-phase={picture.phase}
              aria-label={`${seconds} seconds left`}>{seconds}</span>}
          <span className="duel__phase" data-role="ty-phase">{phaseWord(picture)}{picture.speed === 3 ? ' · ×3' : ''}</span>
          {verdict && <p className="duel__verdict" role="status" data-role="ty-verdict" data-side={picture.verdict?.side === 0 ? 'left' : 'right'}
            data-how={picture.verdict?.how}>{verdict}</p>}
          {picture.phase === 'done' && picture.champion && <p className="duel__verdict" role="status" data-role="ty-champion">
            Champion: {picture.champion.title}</p>}
          <div className="duel__actions" role="group" aria-label="Streamer actions">{centre.map(button)}</div>
        </div>
        {picture.right && <Contestant entrant={picture.right} side={1} picture={picture} action={call('right') && button(call('right')!)} />}
      </div>
      {picture.left && picture.right && picture.phase !== 'done' && <Tally picture={picture} />}
    </>}
    </ChamberSection>,
    <div key="tools" className="duel__column">
      <ChamberSection title="The bracket">
        <BracketSummary picture={picture} />
        {size > 4 && <p className="duel-mini">Quarterfinals and all seeds are in the full bracket.</p>}
        <button type="button" className="cc-btn cc-btn--sm" aria-haspopup="dialog" onClick={() => setSheet(true)}>Full bracket</button>
      </ChamberSection>
      <ChamberSection title="Call the duel"><div className="duel__minor">
        <button type="button" className="cc-btn cc-btn--sm cc-btn--quiet" disabled={frozen || draft || !picture.can_undo}
          onClick={() => send({ kind: 'undo' })}>Undo last call</button>
        <button type="button" className="cc-btn cc-btn--sm cc-btn--quiet" aria-pressed={picture.speed === 3} disabled={frozen || draft}
          onClick={() => send({ kind: 'speed' })}>Speed ×3</button>
        <button type="button" className="cc-btn cc-btn--sm cc-btn--quiet" disabled={frozen || draft}
          onClick={() => send({ kind: 'reset' })}>New bracket</button>
        <button type="button" className="cc-btn cc-btn--sm" onClick={() => stewardDock.open(streamDuelFlow(picture.source === 'core' ? 'core' : 'fixture'))}>
          Show the duel on stream</button>
        <button type="button" className="cc-btn cc-btn--sm" aria-haspopup="dialog" onClick={() => setSheet(true)}>More</button>
      </div>
      </ChamberSection>
    </div>,
    ]} />
    <DuelDrawer open={drawer_open} on_close={closeDrawer} picture={picture} tools={tools}
      notice={program.source === 'core' ? null : notice} details={details} />
  </section>;
}
