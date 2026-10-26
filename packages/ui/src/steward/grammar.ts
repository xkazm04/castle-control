import type { FieldAmendment } from './port.js';

export type Intent =
  | { readonly type: 'draw' }
  | { readonly type: 'amend'; readonly fields: readonly FieldAmendment[] }
  | { readonly type: 'verdict'; readonly verdict: 'pass' | 'bar'; readonly line: string }
  | { readonly type: 'shield' }
  | { readonly type: 'fire'; readonly gifts: number }
  | { readonly type: 'consensus' | 'brief' | 'turn' | 'confirm' | 'unknown' };

const words: Readonly<Record<string, number>> = Object.freeze({
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
});

function count(raw: string): number | undefined {
  const value = words[raw.toLowerCase()] ?? (/^\d+$/.test(raw) ? Number(raw) : NaN);
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

interface GrammarRule {
  readonly pattern: RegExp;
  readonly intent: (match: RegExpMatchArray) => Intent;
}

const rules: readonly GrammarRule[] = [
  { pattern: /^(?:draft|make|start|new|set up|setup|run|open|prepare|create)(?: a)? (?:question )?(?:draw|lottery|raffle|giveaway|urn)$/i,
    intent: () => ({ type: 'draw' }) },
  { pattern: /^(?:make it )?(\d+|one|two|three|four|five|six|seven|eight|nine|ten) winners?$/i,
    intent: match => {
      const n = count(match[1] ?? '');
      return n === undefined ? { type: 'unknown' } : { type: 'amend', fields: [{ key: 'winners', value: n }] };
    } },
  { pattern: /^(?:no|exclude|without) raiders?$/i,
    intent: () => ({ type: 'amend', fields: [{ key: 'cap', value: 'raiders excluded' }] }) },
  { pattern: /^prize\s*(?:is|of|:|=)\s*(.+)$/i,
    intent: match => ({ type: 'amend', fields: [{ key: 'prize', value: match[1] ?? '' }] }) },
  { pattern: /^no prize$/i, intent: () => ({ type: 'amend', fields: [{ key: 'prize', value: 'none' }] }) },
  { pattern: /^pass all as proposed$/i, intent: () => ({ type: 'verdict', verdict: 'pass', line: 'all as proposed' }) },
  { pattern: /^(pass|bar) (.+)$/i,
    intent: match => ({ type: 'verdict', verdict: match[1]?.toLowerCase() === 'bar' ? 'bar' : 'pass', line: match[2] ?? '' }) },
  { pattern: /^(?:raise the drawbridge|raise the bridge|shield)$/i, intent: () => ({ type: 'shield' }) },
  { pattern: /^test fire (\d+|one|two|three|four|five|six|seven|eight|nine|ten) gifts?$/i,
    intent: match => {
      const n = count(match[1] ?? '');
      return n === undefined ? { type: 'unknown' } : { type: 'fire', gifts: n };
    } },
  { pattern: /^(?:what does chat want|what is chat saying|consensus)$/i, intent: () => ({ type: 'consensus' }) },
  { pattern: /^(?:catch me up|status|brief|summary)$/i, intent: () => ({ type: 'brief' }) },
  { pattern: /^(?:what should the next turn be|next turn|propose a turn)$/i, intent: () => ({ type: 'turn' }) },
  { pattern: /^(?:yes|yep|ok|okay|do it|seal(?: it)?|approve(?: it)?|confirm|proclaim(?: it)?)$/i,
    intent: () => ({ type: 'confirm' }) },
];

/** Ported as typed intent data from the keep/preview grammar, never executable UI. */
export function parseIntent(text: string): Intent {
  const normalized = text.trim().replace(/\s+/g, ' ').replace(/[.!?]+$/, '').trim();
  for (const rule of rules) {
    const match = normalized.match(rule.pattern);
    if (match) return rule.intent(match);
  }
  return { type: 'unknown' };
}
