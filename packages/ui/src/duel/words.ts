import type { Bracket, DuelItem, Side } from '@castle-control/duel';
import { totalRounds } from '@castle-control/duel';

/** All stage copy, including accessible labels and outcome announcements. */
export interface TiltyardWords {
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

/** Verbatim English from .port/winner/index.html (cc-t2-duel A/1). */
export const tiltyardWords: TiltyardWords = {
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
