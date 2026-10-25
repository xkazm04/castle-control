// Adapted from Shadowrunr OS, packages/stage-kit/src/timing.ts @ 7e4b6f8 (Apache-2.0).
// Generic word timing only; the show's vocabulary has been removed.

export interface TimedWord {
  word: string;
  /** Onset from the line's start, in milliseconds. */
  start_ms: number;
  emphasis: boolean;
}

export interface TimedLine {
  words: readonly TimedWord[];
  spoken_ms: number;
}

export const BASE_WORD_MS = 230;
export const PER_CHAR_MS = 24;
export const PAUSE_COMMA_MS = 170;
export const PAUSE_STOP_MS = 360;
export const PAUSE_ELLIPSIS_MS = 560;
export const CAPTION_HOLD_MS = 4200;

/** Emphasise uppercase words and numbers without any channel-specific vocabulary. */
export function isEmphatic(word: string): boolean {
  const bare = word.replace(/[^\p{L}\p{N}%$]/gu, '');
  if (bare.length === 0) return false;
  if (/\d/.test(bare)) return true;
  return bare.length >= 2 && bare === bare.toUpperCase() && /\p{L}/u.test(bare);
}

function pauseAfter(word: string): number {
  if (/(\.\.\.|…)["')\]]*$/.test(word)) return PAUSE_ELLIPSIS_MS;
  if (/[.!?]["')\]]*$/.test(word)) return PAUSE_STOP_MS;
  if (/[,;:—–]["')\]]*$/.test(word) || word === '—' || word === '–') return PAUSE_COMMA_MS;
  return 0;
}

export function wordTimings(text: string): TimedLine {
  const raw = text.split(/\s+/).filter((word) => word.length > 0);
  const words: TimedWord[] = [];
  let elapsed_ms = 0;
  for (const word of raw) {
    words.push({ word, start_ms: elapsed_ms, emphasis: isEmphatic(word) });
    const letters = word.replace(/[^\p{L}\p{N}]/gu, '').length;
    elapsed_ms += BASE_WORD_MS + Math.min(letters, 14) * PER_CHAR_MS + pauseAfter(word);
  }
  return { words, spoken_ms: elapsed_ms };
}

export function visibleWords(line: TimedLine, elapsed_ms: number): number {
  if (elapsed_ms < 0) return 0;
  let count = 0;
  for (const word of line.words) {
    if (word.start_ms <= elapsed_ms) count++;
    else break;
  }
  return count;
}

/** Hold the caption, then fade over 600 milliseconds. */
export function captionOpacity(line: TimedLine, elapsed_ms: number): number {
  const fade_start_ms = line.spoken_ms + CAPTION_HOLD_MS;
  if (elapsed_ms <= fade_start_ms) return 1;
  return Math.max(0, 1 - (elapsed_ms - fade_start_ms) / 600);
}
