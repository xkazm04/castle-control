import type { TiltyardAction, TiltyardSession } from '@castle-control/contract';
import { Arena } from './arena.jsx';
import { Card } from './card.jsx';
import type { TiltyardWords } from './words.js';

/** Presentation of the core's snapshot. Never runs a duel transition or a ballot tally. */
export function CoreChat({ session, words, on_action, on_start }: {
  session?: TiltyardSession; words: TiltyardWords;
  on_action: (action: TiltyardAction) => void; on_start: () => void;
}) {
  if (!session) return <Arena bare><div className="ty-board">
    <h2>No Chat tournament started</h2>
    <p>Start the sample contestants on the core. Chat ballots and streamer calls share this tournament with OBS.</p>
    <button className="ty-yb ty-primary" type="button" onClick={on_start}>Start tournament</button>
  </div></Arena>;
  const { bracket, list, verdict, counted } = session;
  // Only locate a pair already present in the returned bracket. The core chooses every winner.
  const round = bracket.rounds.findIndex(matches => matches.some(match => match.winner === undefined));
  const index = bracket.rounds[round]?.findIndex(match => match.winner === undefined) ?? -1;
  const current = bracket.rounds[round]?.[index];
  const match = verdict ?? current ?? bracket.rounds.at(-1)?.[0];
  const a = list.items.find(item => item.id === match?.a);
  const b = list.items.find(item => item.id === match?.b);
  const champion = list.items.find(item => item.id === session.champion);
  const decision = verdict?.verdict;
  const selected_round = verdict?.round ?? String(round < 0 ? bracket.rounds.length - 1 : round);
  const selected_index = verdict?.index ?? index;
  const total_rounds = Math.log2(bracket.seeds.length);
  const round_label = selected_round === String(total_rounds - 1) ? 'Final'
    : selected_round === String(total_rounds - 2) ? 'Semifinal' : 'Quarterfinal';
  const match_number = verdict || !current ? session.history.length : session.history.length + 1;
  const total = counted.left + counted.right;
  const share = total === 0 ? 0.5 : counted.left / total;
  const tally = <div className="ty-tug" data-role="ty-tug" aria-label={words.chat.tally_label}>
    <div className="ty-tug-bar" data-role="ty-tug-bar">
      <span className="ty-l" style={{ flexGrow: Math.max(share, 0.001) }}>{total ? `${Math.round(share * 100)}%` : ''}</span>
      <span className="ty-r" style={{ flexGrow: Math.max(1 - share, 0.001) }}>{total ? `${100 - Math.round(share * 100)}%` : ''}</span>
      <i className="ty-mid" />
    </div>
    <div className="ty-tug-legend">
      <span>{a?.title ?? 'Left'}: <b data-role="ty-core-left-count">{counted.left}</b></span>
      <span><b>{total}</b> counted ballots</span>
      <span>{b?.title ?? 'Right'}: <b data-role="ty-core-right-count">{counted.right}</b></span>
    </div>
    <p>Counts and verdicts come from the core after moderation.</p>
  </div>;
  const send = (kind: 'enter' | 'cancel' | 'undo' | 'reset' | 'speed') => on_action({ kind });
  return <div className="ty-core-chat" data-role="ty-core-chat" data-phase={session.phase} data-match-key={verdict?.match_key ?? session.match_key}>
    <p role="status">{session.simulated ? 'SIMULATED ballots' : 'Core tournament'} · {session.phase === 'called_off'
      ? 'Paused on the core' : session.phase === 'done' ? 'Tournament finished' : session.phase === 'verdict' ? 'Vote closed' : 'Vote open'}</p>
    {champion && session.phase === 'done' ? <Arena bare><div className="ty-champ">
      <Card item={champion} side={0} words={words} tag="Champion" use="champion" result="won" />
      <div><h2>Chat’s champion</h2><p>{list.title}</p></div>
    </div></Arena> : a && b ? <Arena live={session.phase === 'live' || session.phase === 'verdict'} verdict={decision ? decision.side === 'left' ? 0 : 1 : null}>
      <Card item={a} side={0} words={words} tag={`1 · seed ${a.seed}`} pick={words.chat.call} verb={words.chat.call_verb}
        disabled={session.phase !== 'live' && session.phase !== 'verdict'}
        result={decision ? decision.side === 'left' ? 'won' : 'lost' : 'enter'}
        stamp={decision?.how === 'call' ? words.chat.your_call : words.chat.chose}
        on_pick={() => on_action({ kind: 'pick', side: 'left' })} />
      <div className="ty-center">
        <span className="ty-round" data-role="ty-round">{round_label}</span>
        <span className="ty-of" data-role="ty-of"><span data-role="ty-core-match-label">Match {match_number}</span> · {list.prompt ?? list.title}</span>
        <p data-role="ty-core-time">{session.phase === 'live' ? `${Math.ceil((session.window_ms - session.elapsed_ms) / 1000)}s on core`
          : session.phase === 'called_off' ? 'Paused' : 'Closed'}</p>
        {decision && <p role="status" data-role="ty-core-verdict" data-side={decision.side} data-how={decision.how}>
          {decision.how === 'call' ? 'Your call' : decision.how === 'tie' ? 'Tie · seed wins' : 'Chat chose'}: {decision.side === 'left' ? a.title : b.title}
        </p>}
      </div>
      <Card item={b} side={1} words={words} tag={`2 · seed ${b.seed}`} pick={words.chat.call} verb={words.chat.call_verb}
        disabled={session.phase !== 'live' && session.phase !== 'verdict'}
        result={decision ? decision.side === 'right' ? 'won' : 'lost' : 'enter'}
        stamp={decision?.how === 'call' ? words.chat.your_call : words.chat.chose}
        on_pick={() => on_action({ kind: 'pick', side: 'right' })} />
      {tally}
    </Arena> : null}
    {champion && session.phase === 'done' && tally}
    <div className="ty-btns">
      <button type="button" className="ty-yb" onClick={() => send('enter')}>
        {session.phase === 'called_off' ? 'Resume vote' : session.phase === 'live' ? 'Close vote' : session.phase === 'done' ? 'Run again' : 'Next match'}
      </button>
      <button type="button" className="ty-yb" disabled={session.phase !== 'live' && session.phase !== 'verdict'} onClick={() => send('cancel')}>Pause vote</button>
      <button type="button" className="ty-yb" disabled={session.history.length === 0} onClick={() => send('undo')}>{words.undo}</button>
      <button type="button" className="ty-yb" onClick={() => send('reset')}>{words.chat.new_vote}</button>
      <button type="button" className="ty-yb" aria-pressed={session.speed === 3} onClick={() => send('speed')}>{words.chat.speed(session.speed)}</button>
    </div>
    <div className="ty-rail" data-role="ty-rail"><div className="ty-tree">{bracket.rounds.map((matches, r) =>
      <div className="ty-tcol" key={r}><small>Round {r + 1}</small><div className="ty-ms">{matches.map((pair, i) =>
        <div className="ty-tm" data-role="ty-match" key={i} aria-current={String(r) === selected_round && i === selected_index ? 'step' : undefined}>
          {[pair.a, pair.b].map(id => <div className={`ty-row${pair.winner === id ? ' ty-w' : ''}`} key={id}>
            <span /><span className="ty-sd">{list.items.find(item => item.id === id)?.seed}</span>
            <span>{list.items.find(item => item.id === id)?.title}</span>
          </div>)}
        </div>)}</div></div>)}<div className="ty-tcol"><small>{words.champion}</small>
        <div className="ty-champ-slot" data-role="ty-champ-slot">{champion?.title ?? words.unknown_champion}</div>
      </div></div></div>
  </div>;
}
