import { flowChambers } from './flow.js';
import type { FlowChamber } from './flow.js';
import type { ChipAction, StewardRegistry } from './registry.js';

/**
 * Deterministic free-text matcher. It only ever chooses what to OPEN (a flow,
 * the demo, a catch-up beat, or a chamber's chips); nothing it returns acts.
 */
export type IntentMatch =
  | (ChipAction & { score: number })
  | { kind: 'chamber'; chamber: FlowChamber; score: number; hint?: string };

const catchUpPhrases = ['catch me up', 'catch up', 'what happened', 'what did i miss', 'recap', 'summary', 'summarise', 'summarize', 'where are we', 'status'];
const demoPhrases = ['play demo', 'play the demo', 'demo', 'show me how', 'simulate', 'how does', 'how do', 'how it works', 'what does it do'];

export function normalize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
}

/** Every phrase word must appear, in order; a text word may extend it ("draws" matches "draw"). */
export function phraseScore(words: readonly string[], phrase: string): number {
  const wanted = normalize(phrase);
  if (!wanted.length) return 0;
  let at = 0;
  for (const word of wanted) {
    const found = words.findIndex((candidate, index) => index >= at
      && (candidate === word || (word.length >= 3 && candidate.startsWith(word) && candidate.length - word.length <= 3)));
    if (found < 0) return 0;
    at = found + 1;
  }
  return wanted.length;
}

function best(words: readonly string[], phrases: readonly string[]): number {
  return phrases.reduce((top, phrase) => Math.max(top, phraseScore(words, phrase)), 0);
}

export function matchIntent(text: string, registry: StewardRegistry, current: FlowChamber): IntentMatch | null {
  const words = normalize(text);
  if (!words.length) return null;
  const demo = best(words, demoPhrases);
  if (demo) {
    // "How does the giveaway work" names a chamber: its demo wins over the current one's.
    const named = [current, ...flowChambers.filter(id => id !== current)]
      .find(id => registry[id].demo && best(words, registry[id].keywords ?? []) > 0);
    const chamber = named ?? (registry[current].demo ? current : undefined);
    if (chamber) return { kind: 'demo', chamber, score: demo };
  }
  const catchUp = best(words, catchUpPhrases);
  if (catchUp && registry[current].catch_up) return { kind: 'catch_up', chamber: current, score: catchUp };
  let found: IntentMatch | null = null;
  // Current chamber first and with a half-point lead, so "draw" in the Lot Chamber stays local.
  const order = [current, ...flowChambers.filter(id => id !== current)];
  for (const chamber of order) {
    for (const flow of registry[chamber].flows) {
      const score = best(words, [...(flow.intents ?? []), ...(flow.chip ? [flow.chip] : []), flow.title]) + (chamber === current ? 0.5 : 0);
      if (score > 0.5 && (!found || score > found.score)) found = { kind: 'flow', chamber, flow: flow.id, score };
    }
  }
  if (found) return found;
  for (const chamber of order) {
    const hint = registry[chamber].hints?.find(item => best(words, item.phrases) > 0);
    if (hint) return { kind: 'chamber', chamber, score: best(words, hint.phrases), hint: hint.say };
  }
  for (const chamber of order) {
    const score = best(words, registry[chamber].keywords ?? []);
    if (score) return { kind: 'chamber', chamber, score };
  }
  return null;
}
