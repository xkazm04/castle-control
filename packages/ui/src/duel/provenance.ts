import type { IndexedWindow } from '@castle-control/duel/ballots';
import type { TiltyardWords } from './words.js';

export function chatLabel(words: TiltyardWords, provenance: IndexedWindow['provenance']): string {
  return provenance === 'simulated' ? words.chat.simulated : provenance === 'live' ? words.chat.live
    : `${words.chat.live} · ${words.chat.simulated}`;
}

/** Keep fixture copy verbatim; live and mixed windows disclose their actual sources. */
export function chatWordsFor(words: TiltyardWords, provenance: IndexedWindow['provenance']): TiltyardWords {
  if (provenance === 'simulated') return words;
  const label = chatLabel(words, provenance);
  return { ...words, modes: { ...words.modes, chat: { ...words.modes.chat, detail: label } },
    chat: { ...words.chat, ticker_title: label, ticker_detail: '', ticker_label: label, tally_label: label,
      waiting: label, paused_before_enter: `${label} · ${words.cancelled} ` } };
}
