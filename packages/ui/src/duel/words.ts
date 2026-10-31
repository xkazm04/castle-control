import type { Bracket, ChatVerdict, Counted, DuelItem, LadderLast, Side } from '@castle-control/duel';
import type { WindowEvent } from '@castle-control/duel/ballots';
import { totalRounds } from '@castle-control/duel';

/** All stage copy, including accessible labels and outcome announcements. */
export interface TiltyardWords {
  readonly chat: ChatWords;
  readonly ladder: LadderWords;
  readonly modes: Readonly<Record<'show' | 'chat' | 'ladder', { number: string; title: string; detail: string }>>;
  readonly mode_label: string;
  readonly sample: string;
  readonly pick: string;
  readonly mode: string;
  readonly cancel: string;
  readonly back: string;
  readonly enter_show: string;
  readonly enter_chat: string;
  readonly enter_chat_live: string;
  readonly enter_ladder: string;
  readonly keys: { readonly left: string; readonly right: string; readonly escape: string; readonly enter: string;
    readonly previous: string; readonly next: string; readonly undo: string };
  readonly wins: string;
  readonly wins_stamp: string;
  readonly vs: string;
  readonly card_hint: string;
  readonly theatre_hint: string;
  readonly skip_separator: string;
  readonly skip: string;
  readonly champion: string;
  readonly champion_rank: string;
  readonly champion_stamp: string;
  readonly final_order: string;
  readonly undo: string;
  readonly new_bracket: string;
  readonly run_again: string;
  readonly reopen: string;
  readonly closed_title: string;
  readonly closed_before_enter: string;
  readonly closed_before_escape: string;
  readonly closed_after_escape: string;
  readonly closing_note: string;
  readonly winner_to_come: string;
  readonly unknown_seed: string;
  readonly unknown_champion: string;
  readonly cancelled: string;
  readonly reopened: string;
  readonly undone: string;
  round(bracket: Bracket, round: number, plural?: boolean): string;
  match(number: number, total: number, title: string): string;
  decided(number: number, total: number): string;
  seed(number: number, side: Side): string;
  seed_number(number: number): string;
  champion_tag(title: string): string;
  champion_note(seed: number, note: string): string;
  suggested_by(by: string): string;
  card_label(title: string, side: Side, verb: string): string;
  arms_label(title: string): string;
  rail_heading(title: string): string;
  rail_detail(total: number): string;
  placed(total: number): string;
  out_in(round: string): string;
  outcome(winner: DuelItem, next: { round: string; a: DuelItem; b: DuelItem } | null): string;
  new_announcement(round: string, a: DuelItem, b: DuelItem): string;
}

export interface LadderWords {
  readonly hill: string; readonly below: string; readonly off: string; readonly challenged: string; readonly beaten: string;
  readonly held: string; readonly new: string; readonly down: string; readonly falls: string;
  readonly challenger: string; readonly challenger_wins: string; readonly climbs: string; readonly holds: string;
  readonly climbs_hint: string; readonly holds_pick: string; readonly holds_verdict_pick: string;
  readonly idle_title: string; readonly off_title: string; readonly empty_title: string; readonly empty_text: string;
  readonly abandoned: string; readonly abandoned_announcement: string; readonly undone: string;
  readonly start: string; readonly undo: string; readonly undo_last: string; readonly next: string; readonly reset: string;
  readonly queue: string; readonly queue_detail: string; readonly log: string;
  subtitle(title: string): string;
  range(possible: { from: number; to: number; below: boolean }, endpoint: string): string;
  challenger_tag(pick: number, max: number): string;
  incumbent_tag(rung: number, verdict: boolean): string;
  challenging(rung: number): string;
  verdict(rung: number, side: Side): string;
  holds_hint(rung: number): string;
  verb(rung: number, side: Side): string;
  incoming(index: number, total: number): string;
  from(by: string): string;
  search(title: string, max: number, spots: number): string;
  placed(rung: number): string;
  result(title: string, last: LadderLast): string;
  fallen(title: string): string;
  step(won: boolean, rung: number, title: string): string;
  opened(title: string, rung: number, incumbent: string): string;
  picked(title: string, rung: number, side: Side): string;
  placement(last: LadderLast, fallen: string | undefined): string;
  next_announcement(rung: number): string;
}

export interface ChatWords {
  readonly no_source_title: string; readonly no_source_text: string;
  readonly paused_title: string; readonly paused_before_enter: string; readonly paused_before_escape: string;
  readonly paused_after_escape: string; readonly resume: string; readonly new_vote: string;
  readonly seconds: string; readonly closed: string; readonly window_closed: string;
  readonly close_now: string; readonly call: string; readonly call_verb: string;
  readonly chose: string; readonly your_call: string;
  readonly tally_label: string; readonly counted_for: string; readonly one_per_viewer: string;
  readonly barred: string; readonly held: string; readonly repeats: string; readonly bits: string;
  readonly excluded: string; readonly ticker_title: string; readonly ticker_detail: string;
  readonly ticker_label: string; readonly simulated: string; readonly waiting: string; readonly bits_ignored: string;
  readonly status: Readonly<Record<'counted' | 'barred' | 'held' | 'repeat' | 'chatter', string>>;
  readonly closed_before: string; readonly closed_after: string;
  readonly tally_enter: string; readonly now: string;
  tag(type: number, seed: number): string;
  viewer(user_id: string, provenance: WindowEvent['provenance']): string;
  ballots(number: number): string;
  flip(barred: number, shadow: Counted): string;
  speed(speed: number): string;
  verdict(verdict: ChatVerdict, seconds: number): string;
  tally_line(verdict: ChatVerdict): string;
  outcome(verdict: ChatVerdict, winner: DuelItem): string;
  opened(round: string, a: DuelItem, b: DuelItem): string;
  champion(winner: DuelItem): string;
}

/** Verbatim English from .port/winner/index.html (cc-t2-duel A/1). */
export const tiltyardWords: TiltyardWords = {
  ladder: {
    hill: 'The hill', below: 'below the hill', off: 'off the hill', challenged: 'challenged', beaten: 'beaten', held: 'held',
    new: 'new', down: '↓ steps down', falls: 'falls from the hill',
    challenger: 'Challenger', challenger_wins: 'challenger wins', climbs: 'Climbs', holds: 'Holds',
    climbs_hint: ' climbs · ', holds_pick: 'holds the rung', holds_verdict_pick: 'holds',
    idle_title: 'A challenger arrives', off_title: 'Off the hill', empty_title: 'The queue is empty',
    empty_text: 'Every simulated suggestion has climbed.',
    abandoned: ' The last climb was abandoned; the list is unchanged.',
    abandoned_announcement: 'Climb abandoned. The list is unchanged.', undone: 'Climb undone. The list is back as it was.',
    start: 'Climb the hill', undo: 'Undo climb', undo_last: 'Undo last climb', next: 'Next suggestion', reset: 'Reset sample ladder',
    queue: 'Suggestion queue', queue_detail: 'simulated chat suggestions · one climb each', log: 'This climb',
    subtitle: title => `${title} · simulated · session only`,
    range: (possible, endpoint) => `Still possible: #${possible.from}${possible.to > possible.from ? `–${possible.below ? endpoint : `#${possible.to}`}` : ''}`,
    challenger_tag: (pick, max) => `Challenger · pick ${pick} of at most ${max}`,
    incumbent_tag: (rung, verdict) => verdict ? `Incumbent #${rung}` : `Incumbent · #${rung}`,
    challenging: rung => `Challenging #${rung}`,
    verdict: (rung, side) => `${side === 0 ? 'Climbs past' : 'Holds the rung:'} #${rung}`,
    holds_hint: rung => ` #${rung} holds`,
    verb: (rung, side) => `${side === 0 ? 'climbs past' : 'holds'} #${rung}`,
    incoming: (index, total) => `Incoming suggestion · ${index} of ${total}`,
    from: by => `from ${by}`,
    search: (title, max, spots) => `It challenges its way into ${title} by binary search: at most ${max} picks over ${spots} spots.`,
    placed: rung => `Placed at #${rung}`,
    result: (title, last) => `${title} ${last.made_it ? `took #${last.place + 1}` : 'lost every challenge and does not make the top 10'} in ${last.steps.length} pick${last.steps.length === 1 ? '' : 's'}: ${last.steps.map(step => `${step.won ? 'beat #' : 'lost to #'}${step.at + 1}`).join(' · ')}.`,
    fallen: title => `${title} falls from the hill`,
    step: (won, rung, title) => `${won ? '✓ beat' : '✗ lost to'} #${rung} ${title}`,
    opened: (title, rung, incumbent) => `${title} climbs. Challenging number ${rung}, ${incumbent}.`,
    picked: (title, rung, side) => side === 0 ? `${title} beats number ${rung}.` : `Number ${rung} holds.`,
    placement: (last, fallen) => last.made_it
      ? ` Placed at number ${last.place + 1} in ${last.steps.length} picks.${fallen ? ` ${fallen} falls from the hill.` : ''}`
      : ' It does not make the top 10.',
    next_announcement: rung => ` Challenging number ${rung}.`,
  },
  chat: {
    no_source_title: 'No ballot source connected', no_source_text: 'No ballot source is connected.',
    paused_title: 'Vote window paused',
    paused_before_enter: 'The duel was called off, so the simulated chat window stopped where it was. You are still in the room. ',
    paused_before_escape: ' resumes the window; ', paused_after_escape: ' goes back to the keep.',
    resume: 'Resume the window', new_vote: 'New vote', seconds: 'seconds', closed: 'closed', window_closed: 'window closed',
    close_now: ' close now · ', call: 'streamer call', call_verb: 'by streamer call', chose: 'Chat chose', your_call: 'Your call',
    tally_label: 'Simulated tally', counted_for: 'Counted for', one_per_viewer: 'counted ballots · one per viewer',
    barred: 'Barred · never counted', held: '· held for review', repeats: ' · repeats counted once', bits: ' · bits weighed as 1',
    excluded: 'Barred ballots are shown, struck through, and left out of every number above.',
    ticker_title: 'Simulated chat', ticker_detail: 'fixture verdicts · generated, not real chat',
    ticker_label: 'Simulated chat ticker', simulated: 'SIMULATED', waiting: 'Waiting for simulated chat…', bits_ignored: ' · bits ignored',
    status: { counted: 'counted', barred: 'barred', held: 'held', repeat: 'repeat', chatter: 'chatter' },
    closed_before: 'Each counted ballot becomes only ', closed_after: ' · bits are refused at the door.',
    tally_enter: 's · ', now: ' now',
    tally_line: verdict => `Chat chose ${verdict.counted[verdict.side]}–${verdict.counted[1 - verdict.side]} · next match in `,
    tag: (type, seed) => `Type ${type} · seed #${seed}`,
    viewer: (user_id, provenance) => provenance === 'simulated' ? `simulated_viewer_${user_id.padStart(4, '0')}` : user_id,
    ballots: number => `${number} ${number === 1 ? 'ballot' : 'ballots'}`,
    flip: (barred, shadow) => `If the ${barred} barred ballots counted, the bar would read ${shadow[0]}–${shadow[1]} and lean the other way. They never count.`,
    speed: speed => `Speed ×${speed === 1 ? 3 : 1}`,
    verdict: (verdict, seconds) => verdict.how === 'call'
      ? `Streamer call · logged openly. Tally at the call: ${verdict.counted[0]}–${verdict.counted[1]}.`
      : verdict.how === 'tie' ? `Tie ${verdict.counted[0]}–${verdict.counted[1]} → better seed goes through`
        : `Chat chose ${verdict.counted[verdict.side]}–${verdict.counted[1 - verdict.side]} · next match in ${seconds}s · Enter now`,
    outcome: (verdict, winner) => `${verdict.how === 'call' ? 'Streamer call' : verdict.how === 'tie' ? 'Tie, better seed goes through' : 'Chat chose'}: ${winner.title}, ${verdict.counted[verdict.side]} to ${verdict.counted[1 - verdict.side]}.`,
    opened: (round, a, b) => `${round}: ${a.title} versus ${b.title}. Window open.`,
    champion: winner => `Chat's champion: ${winner.title}.`,
  },
  modes: {
    show: { number: 'I', title: 'Showdown', detail: 'You pick · 8 seeds · 7 picks' },
    chat: { number: 'II', title: 'Chat decides', detail: 'Simulated tally · barred never count' },
    ladder: { number: 'III', title: 'King of the hill', detail: 'Climb the top 10 · ≤ 4 picks' },
  },
  mode_label: 'Duel mode', sample: 'SAMPLE', pick: 'pick', mode: 'mode',
  cancel: 'call off the duel', back: 'back to the keep', enter_show: 'open the lists',
  enter_chat: 'next / start', enter_chat_live: 'close the window now', enter_ladder: 'climb / next',
  keys: { left: '←', right: '→', escape: 'Esc', enter: 'Enter', previous: '[', next: ']', undo: '⌫' },
  wins: 'wins', wins_stamp: 'Wins', vs: 'VS', card_hint: 'Click a card or press ',
  theatre_hint: 'Next match in a moment · ', skip_separator: '/', skip: ' skips',
  champion: 'Champion', champion_rank: 'champion', champion_stamp: 'Champion', final_order: 'Final order',
  undo: 'Back one match', new_bracket: 'New bracket', run_again: 'Run again', reopen: 'Reopen the lists',
  closed_title: 'The lists are closed',
  closed_before_enter: 'The duel was called off. You are still in the Map Room; picks so far are kept. Press ',
  closed_before_escape: ' to reopen them, ', closed_after_escape: ' to go back to the keep.',
  closing_note: 'One undoable result · session only · nothing is sent.',
  winner_to_come: 'winner to come', unknown_seed: '—', unknown_champion: '?',
  cancelled: 'Duel called off. You are still in the room.', reopened: 'The lists reopen.', undone: 'Back one match.',
  round: (bracket, round, plural = false) => {
    const left = totalRounds(bracket) - round;
    const name = left === 1 ? 'Final' : left === 2 ? 'Semifinal' : left === 3 ? 'Quarterfinal' : `Round ${round + 1}`;
    return name + (plural ? 's' : '');
  },
  match: (number, total, title) => `Match ${number} of ${total} · ${title}`,
  decided: (number, total) => `Match ${number} of ${total} · decided`,
  seed: (number, side) => `Seed #${number} · ${side === 0 ? 'azure' : 'gules'}`,
  seed_number: number => `#${number}`, champion_tag: title => `Champion · ${title}`,
  champion_note: (seed, note) => `seed #${seed} · ${note}`,
  suggested_by: by => `suggested by ${by}`,
  card_label: (title, side, verb) => `${title} ${verb} (${side === 0 ? 'Left' : 'Right'} arrow)`,
  arms_label: title => `Generated arms for ${title}`,
  rail_heading: title => `The lists · ${title}`,
  rail_detail: total => `${total} matches to a champion · seeded 1v8 · 4v5 · 2v7 · 3v6`,
  placed: total => `Final order · ${total} placed`, out_in: round => `out in the ${round.toLowerCase()}`,
  outcome: (winner, next) => `${winner.title} wins. ` + (next
    ? `Next: ${next.round}, ${next.a.title} versus ${next.b.title}.` : `Champion: ${winner.title}.`),
  new_announcement: (round, a, b) => `New bracket. ${round} 1: ${a.title} versus ${b.title}`,
};
