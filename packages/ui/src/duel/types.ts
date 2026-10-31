import type { DuelList } from '@castle-control/duel';
import type { Ballot } from '@castle-control/duel/ballots';
import type { TiltyardWords } from './words.js';

export type DuelMode = 'show' | 'chat' | 'ladder';
type Contestants = DuelList & { readonly provenance?: 'sample' };
export interface TiltyardLists {
  readonly bracket: Contestants;
  readonly chat: Contestants & { readonly window_ms: number; readonly key?: string };
  readonly ladder: { readonly title: string; readonly top: Contestants; readonly queue: Contestants;
    readonly provenance?: 'sample' };
}
export interface TiltyardProps {
  readonly lists: TiltyardLists;
  readonly words: TiltyardWords;
  readonly initial_mode?: DuelMode;
  readonly ballots?: (match_key: string, window_ms: number, opened_at: string) => readonly string[];
  readonly ballot_feed?: (window: { match_key: string; opened_at: string; window_ms: number },
    on_ballots: (ballots: readonly Ballot[]) => void) => () => void;
  readonly on_close?: () => void;
  readonly label: string;
}
