import type { Ballot, BallotOption, Vote, WindowEvent } from './ballot-types.js';

const cheer_prefix = /^Cheer\d+\s+/i;

export function isCheer(text: string): boolean {
  return cheer_prefix.test(text.trimStart());
}

export function ballotOption(text: string): BallotOption | null {
  // The winner also generates double exclamations, such as "1!!".
  const token = /^([12])!*(?:\s|$)/.exec(text.trim().replace(cheer_prefix, ''))?.[1];
  return token === '1' ? 0 : token === '2' ? 1 : null;
}

/** Closed viewer output: money and weighting fields are never accepted. */
export function parseVote(value: unknown): Vote | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== 2 || !keys.includes('kind') || !keys.includes('option_index')) return null;
  if (!('kind' in value) || value.kind !== 'vote' || !('option_index' in value)
    || typeof value.option_index !== 'number' || !Number.isInteger(value.option_index)
    || value.option_index < 0) return null;
  return Object.freeze({ kind: 'vote', option_index: value.option_index });
}

export function classifyWindow(ballots: readonly Ballot[], opened_at: string, window_ms: number): WindowEvent[] {
  const start_ms = Date.parse(opened_at);
  const voted = new Set<string>();
  // Stable sorting retains page order for equal timestamps.
  return ballots.map((ballot) => ({ ballot, t_ms: Date.parse(ballot.at) - start_ms }))
    .filter(({ t_ms }) => t_ms >= 0 && t_ms <= window_ms)
    .sort((a, b) => a.t_ms - b.t_ms)
    .map(({ ballot, t_ms }): WindowEvent => {
      const option = ballotOption(ballot.text);
      const details = { t_ms, user_id: ballot.user_id, text: ballot.text, cheer: isCheer(ballot.text), provenance: ballot.provenance };
      const selected = { ...details, ...(option === null ? {} : { option }) };
      if (ballot.verdict === 'bar') return { ...selected, status: 'barred' };
      if (ballot.verdict === 'hold') return { ...selected, status: 'held' };
      if (option === null) return { ...details, status: 'chatter' };
      if (voted.has(ballot.user_id)) return { ...selected, status: 'repeat' };
      const vote = parseVote({ kind: 'vote', option_index: option });
      if (!vote) throw new Error('Invalid contract value');
      voted.add(ballot.user_id);
      return { ...details, option, status: 'counted', vote };
    });
}
