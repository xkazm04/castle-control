/** Offline proof schema mirror, not a lots RPC contract. JSON decoding awaits the public contract door. */
export type Entry = Readonly<{ handle: string; weight: number }>;
export type Plan = Readonly<{ source: 'drand_quicknet'; chain_hash: string; round: string }>
  | Readonly<{ source: 'streamer_commit'; commitment: string }>;
export type Proof = Readonly<{ source: 'drand_quicknet'; signature: string; randomness: string }>
  | Readonly<{ source: 'streamer_commit'; seed: string }>;
export type Roll = Readonly<{
  version: number; entries: readonly Entry[]; winner_count: number; sealed_at: string; margin_s: number; randomness: Plan;
}>;
export type Writ = Readonly<{ roll: Roll; seal: string; proof: Proof; winners: readonly string[] }>;
export type Chain = Readonly<{ hash: string; public_key: string; genesis_time: string; period_s: number; scheme: string }>;
export type Round = Readonly<{ round: string; signature: string; randomness: string }>;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected object');
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, expected: string[]): void {
  if (Object.keys(value).length !== expected.length || expected.some((key) => !Object.hasOwn(value, key))) {
    throw new Error('Missing or unknown field');
  }
}
function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Expected string');
  return value;
}
function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new Error('Integer range');
  return value;
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Expected array');
  return value;
}
export function hex(value: unknown, bytes: number): string {
  const result = text(value);
  if (result.length !== bytes * 2 || !/^[0-9a-f]+$/.test(result)) throw new Error('Noncanonical hex');
  return result;
}
export function roundNumber(value: unknown): bigint {
  const round = text(value);
  if (!/^[1-9][0-9]*$/.test(round) || round.length > 20 || BigInt(round) > 0xffffffffffffffffn) throw new Error('Round string');
  return BigInt(round);
}
export function timestamp(value: unknown): number {
  const input = text(value);
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$/.test(input)) throw new Error('Canonical UTC timestamp');
  const time = Date.parse(input);
  if (!Number.isFinite(time) || time < 0 || new Date(time).toISOString() !== input.slice(0, -1) + '.000Z') throw new Error('Timestamp range');
  return time / 1000;
}

/** This anchor must come from an independent source, never from a writ. */
export function checkChain(value: unknown): Chain {
  const c = record(value);
  keys(c, ['hash', 'public_key', 'genesis_time', 'period_s', 'scheme']);
  const genesis_time = text(c.genesis_time);
  timestamp(genesis_time);
  if (c.scheme !== 'bls-unchained-g1-rfc9380') throw new Error('Quicknet scheme');
  return Object.freeze({ hash: hex(c.hash, 32), public_key: hex(c.public_key, 96), genesis_time,
    period_s: integer(c.period_s, 3, 3), scheme: c.scheme });
}

export function checkRound(value: unknown): Round {
  const r = record(value);
  keys(r, ['round', 'signature', 'randomness']);
  const round = text(r.round);
  roundNumber(round);
  return Object.freeze({ round, signature: hex(r.signature, 48), randomness: hex(r.randomness, 32) });
}

function plan(value: unknown): Plan {
  const p = record(value);
  if (p.source === 'drand_quicknet') {
    keys(p, ['source', 'chain_hash', 'round']);
    const round = text(p.round);
    roundNumber(round);
    return Object.freeze({ source: p.source, chain_hash: hex(p.chain_hash, 32), round });
  }
  if (p.source === 'streamer_commit') {
    keys(p, ['source', 'commitment']);
    return Object.freeze({ source: p.source, commitment: hex(p.commitment, 32) });
  }
  throw new Error('Randomness source');
}
function proof(value: unknown): Proof {
  const p = record(value);
  if (p.source === 'drand_quicknet') {
    keys(p, ['source', 'signature', 'randomness']);
    return Object.freeze({ source: p.source, signature: hex(p.signature, 48), randomness: hex(p.randomness, 32) });
  }
  if (p.source === 'streamer_commit') {
    keys(p, ['source', 'seed']);
    return Object.freeze({ source: p.source, seed: hex(p.seed, 32) });
  }
  throw new Error('Proof source');
}
/** One schema-validation door for decoded boundary objects; returns an owned frozen snapshot. */
export function checkWrit(value: unknown): Writ {
  const w = record(value);
  keys(w, ['roll', 'seal', 'proof', 'winners']);
  const r = record(w.roll);
  keys(r, ['version', 'entries', 'winner_count', 'sealed_at', 'margin_s', 'randomness']);
  const rawEntries = array(r.entries);
  if (rawEntries.length < 1 || rawEntries.length > 10000) throw new Error('Entry count');
  let previous = '';
  const entries = rawEntries.map((raw): Entry => {
    const e = record(raw);
    keys(e, ['handle', 'weight']);
    const handle = text(e.handle);
    if (!/^[a-z0-9_]{1,25}$/.test(handle) || handle <= previous) throw new Error('Entry handle/order');
    previous = handle;
    return Object.freeze({ handle, weight: integer(e.weight, 1, 0xffffffff) });
  });
  const sealed_at = text(r.sealed_at);
  timestamp(sealed_at);
  const roll: Roll = Object.freeze({
    version: integer(r.version, 1, 1), entries: Object.freeze(entries),
    winner_count: integer(r.winner_count, 1, entries.length), sealed_at,
    margin_s: integer(r.margin_s, 1, 0xffffffff), randomness: plan(r.randomness),
  });
  const winners = array(w.winners);
  if (winners.length !== roll.winner_count) throw new Error('Winner count');
  const claimed = winners.map(text);
  if (claimed.some((handle) => !entries.some((e) => e.handle === handle)) || new Set(claimed).size !== claimed.length) {
    throw new Error('Claimed winners');
  }
  return Object.freeze({ roll, seal: hex(w.seal, 32), proof: proof(w.proof), winners: Object.freeze(claimed) });
}
