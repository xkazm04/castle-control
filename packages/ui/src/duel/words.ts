import type { Bracket, ChatVerdict, Counted, DuelItem, Side } from '@castle-control/duel';
import type { WindowEvent } from '@castle-control/duel/ballots';
import { totalRounds } from '@castle-control/duel';

/** All stage copy, including accessible labels and outcome announcements. */
export interface TiltyardWords {
  readonly chat: ChatWords;
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
