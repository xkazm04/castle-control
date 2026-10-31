import type { LotsHandle, LotsProofRoll, LotsWrit } from '@castle-control/contract';

/** Writ Lab: an in-memory proof inspector for the cc-verify v1 byte protocol.
 * Every tamper produces a frozen copy; the frozen roll itself is never edited.
 * The beacon's BLS signature is not authenticated here (no pairing library in
 * the desktop); that step reports `unverified` and defers to cc-verify. */
export type TamperKind = 'weight' | 'handle' | 'seed' | 'plan' | 'winners';
export type Tamper = Readonly<{ kind: TamperKind; index?: number }>;
export type StepId = 'serialization' | 'seal' | 'randomness' | 'derivation';
export type StepStatus = 'pass' | 'fail' | 'blocked' | 'unverified';
export type LabReason = 'invalid_version' | 'invalid_entries' | 'handle_order' | 'invalid_winner_count'
  | 'seal_mismatch' | 'commitment_mismatch' | 'randomness_mismatch' | 'source_mismatch' | 'invalid_round'
  | 'signature_not_authenticated' | 'cast_mismatch' | 'blocked_by_earlier_step';
export type PreimageField = 'domain' | 'entry_count' | 'entry_length' | 'entry_handle' | 'entry_weight'
  | 'winner_count' | 'sealed_at' | 'margin_s' | 'source_tag' | 'chain_hash' | 'round' | 'commitment';
export type PreimageSegment = Readonly<{ field: PreimageField; start: number; end: number; entry?: number }>;
export type ByteDiff = Readonly<{ offset: number; before?: number; after?: number; field?: PreimageField; entry?: number;
  length_before: number; length_after: number }>;
export type TracePick = Readonly<{ counter: string; candidate: string; total: string; accepted: boolean;
  target?: string; index?: number; handle?: LotsHandle }>;
export type LabStep = Readonly<{ id: StepId; status: StepStatus; reason?: LabReason; recorded?: string; recomputed?: string }>;
export type LabReport = Readonly<{
  writ: LotsWrit; tamper?: Tamper; steps: readonly LabStep[];
  verdict: 'verified' | 'unverified' | 'caught'; caught_at?: StepId;
  source: LotsWrit['proof']['source']; entry_count: number; byte_length: number; preimage: Uint8Array;
  segments: readonly PreimageSegment[]; diff?: ByteDiff; trace: readonly TracePick[];
  computed_winners: readonly LotsHandle[]; round?: string;
}>;

const encoder = new TextEncoder();
const text = (value: string) => encoder.encode(value);
const big = (value: bigint, size: number) => {
  const bytes = new Uint8Array(size);
  for (let index = size - 1; index >= 0; index--) { bytes[index] = Number(value & 255n); value >>= 8n; }
  return bytes;
};
const u32 = (value: number) => big(BigInt(value), 4);
const join = (...values: Uint8Array[]) => {
  const result = new Uint8Array(values.reduce((size, value) => size + value.length, 0));
  let offset = 0;
  for (const value of values) { result.set(value, offset); offset += value.length; }
  return result;
};
/** Lenient hex decoding: tampered values still serialise so the seal can catch them. */
export const hexBytes = (value: string) => Uint8Array.from(value.match(/[0-9a-f]{2}/gi) ?? [], pair => Number.parseInt(pair, 16));
export const toHex = (value: Uint8Array) => Array.from(value, byte => byte.toString(16).padStart(2, '0')).join('');
const sha256 = async (...values: Uint8Array[]) => new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', join(...values)));
const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

function entryBytes(roll: LotsProofRoll): Uint8Array {
  return join(...roll.entries.map(entry => { const handle = text(entry.handle); return join(u32(handle.length), handle, u32(entry.weight)); }));
}

/** cc-verify v1 seal preimage for both randomness sources, with a field map for display. */
export function sealPreimage(roll: LotsProofRoll): { bytes: Uint8Array; segments: readonly PreimageSegment[] } {
  const parts: Uint8Array[] = [];
  const segments: PreimageSegment[] = [];
  let offset = 0;
  const push = (field: PreimageField, bytes: Uint8Array, entry?: number) => {
    parts.push(bytes);
    segments.push(entry === undefined ? { field, start: offset, end: offset + bytes.length } : { field, start: offset, end: offset + bytes.length, entry });
    offset += bytes.length;
  };
  push('domain', text('castle-control/seal/v1\0'));
  push('entry_count', u32(roll.entries.length));
  roll.entries.forEach((entry, index) => {
    const handle = text(entry.handle);
    push('entry_length', u32(handle.length), index); push('entry_handle', handle, index); push('entry_weight', u32(entry.weight), index);
  });
  push('winner_count', u32(roll.winner_count));
  push('sealed_at', text(roll.sealed_at));
  push('margin_s', u32(roll.margin_s));
  const plan = roll.randomness;
  if (plan.source === 'drand_quicknet') {
    push('source_tag', new Uint8Array([0])); push('chain_hash', hexBytes(plan.chain_hash));
    push('round', big(/^[0-9]{1,20}$/.test(plan.round) ? BigInt(plan.round) & 0xffff_ffff_ffff_ffffn : 0n, 8));
  } else {
    push('source_tag', new Uint8Array([1])); push('commitment', hexBytes(plan.commitment));
  }
  return { bytes: join(...parts), segments: Object.freeze(segments) };
}

export async function sealOfRoll(roll: LotsProofRoll): Promise<string> {
  return toHex(await sha256(sealPreimage(roll).bytes));
}

export function segmentAt(segments: readonly PreimageSegment[], offset: number): PreimageSegment | undefined {
  return segments.find(segment => offset >= segment.start && offset < segment.end) ?? segments.at(-1);
}

/** First byte that differs between two preimages; undefined when they are identical. */
export function preimageDiff(before: Uint8Array, after: Uint8Array, segments: readonly PreimageSegment[]): ByteDiff | undefined {
  const length = Math.max(before.length, after.length);
  for (let offset = 0; offset < length; offset++) {
    if (before[offset] === after[offset]) continue;
    const segment = segmentAt(segments, offset);
    const diff: ByteDiff = { offset, length_before: before.length, length_after: after.length,
      ...(before[offset] === undefined ? {} : { before: before[offset] }), ...(after[offset] === undefined ? {} : { after: after[offset] }),
      ...(segment ? { field: segment.field } : {}), ...(segment?.entry === undefined ? {} : { entry: segment.entry }) };
    return Object.freeze(diff);
  }
  return undefined;
}

/** Mirrors lots-cast.ts castWinners exactly, recording every 64-bit draw. */
export async function traceCast(randomness: Uint8Array, seal: string, roll: LotsProofRoll): Promise<{ winners: readonly LotsHandle[]; trace: readonly TracePick[] }> {
  const seed = await sha256(text('castle-control/cast/v1\0'), randomness, hexBytes(seal), entryBytes(roll));
  const pool = [...roll.entries];
  const winners: LotsHandle[] = [];
  const trace: TracePick[] = [];
  let counter = 0n;
  while (winners.length < roll.winner_count && pool.length) {
    if (counter > 0xffff_ffff_ffff_ffffn) throw new Error('Cast exhausted.');
    const block = await sha256(seed, big(counter, 8));
    const candidate = new DataView(block.buffer).getBigUint64(0);
    const total = pool.reduce((sum, entry) => sum + BigInt(entry.weight), 0n);
    const pick = { counter: counter.toString(), candidate: candidate.toString(16).padStart(16, '0'), total: total.toString() };
    counter++;
    if (candidate >= ((1n << 64n) / total) * total) { trace.push(Object.freeze({ ...pick, accepted: false })); continue; }
    const target = candidate % total;
    let remaining = target;
    const index = pool.findIndex(entry => { if (remaining < BigInt(entry.weight)) return true; remaining -= BigInt(entry.weight); return false; });
    const winner = pool.splice(index, 1)[0];
    if (!winner) throw new Error('Invalid cast total.');
    winners.push(winner.handle);
    trace.push(Object.freeze({ ...pick, accepted: true, target: target.toString(), index, handle: winner.handle }));
  }
  return { winners: Object.freeze(winners), trace: Object.freeze(trace) };
}

function rollReason(roll: LotsProofRoll): LabReason | undefined {
  if (roll.version !== 1) return 'invalid_version';
  if (!roll.entries.length || roll.entries.length > 10_000 || roll.entries.some(entry => !/^[a-z0-9_]{1,25}$/.test(entry.handle)
    || !Number.isInteger(entry.weight) || entry.weight < 1 || entry.weight > 0xffff_ffff)) return 'invalid_entries';
  if (roll.entries.some((entry, index) => index > 0 && entry.handle <= (roll.entries[index - 1]?.handle ?? ''))) return 'handle_order';
  if (!Number.isInteger(roll.winner_count) || roll.winner_count < 1 || roll.winner_count > roll.entries.length) return 'invalid_winner_count';
  return undefined;
}

const handleAlphabet = '0123456789_abcdefghijklmnopqrstuvwxyz';
/** Edit one character (replace, else append) while keeping the roll's ascending order where possible,
 * so the alteration slips past the format check and only the seal catches it. */
function alterHandle(entries: readonly { handle: LotsHandle }[], index: number): LotsHandle {
  const handle = entries[index]?.handle ?? '';
  const previous = entries[index - 1]?.handle ?? '';
  const next = entries[index + 1]?.handle;
  const stem = handle.slice(0, -1);
  const replaced = Array.from(handleAlphabet, char => stem + char).filter(value => value !== handle);
  const appended = handle.length < 25 ? Array.from(handleAlphabet, char => handle + char) : [];
  return [...replaced, ...appended].find(value => value > previous && (next === undefined || value < next)) ?? replaced[0] ?? `${handle}x`;
}
const flipNibble = (value: string) => {
  const last = value.at(-1) ?? '0';
  return value.slice(0, -1) + (Number.parseInt(last, 16) ^ 1).toString(16);
};

/** Pure: returns a new frozen writ with exactly one alteration. */
export function applyTamper(writ: LotsWrit, tamper: Tamper): LotsWrit {
  const copy = structuredClone(writ);
  const entries = copy.roll.entries;
  const index = Math.min(Math.max(0, tamper.index ?? 0), Math.max(0, entries.length - 1));
  const entry = entries[index];
  if (tamper.kind === 'weight' && entry) entry.weight = entry.weight >= 0xffff_ffff ? entry.weight - 1 : entry.weight + 1;
  if (tamper.kind === 'handle' && entry) {
    const altered = alterHandle(entries, index);
    copy.winners = copy.winners.map(winner => winner === entry.handle ? altered : winner);
    entry.handle = altered;
  }
  if (tamper.kind === 'seed') {
    copy.proof = copy.proof.source === 'streamer_commit' ? { ...copy.proof, seed: flipNibble(copy.proof.seed) }
      : { ...copy.proof, signature: flipNibble(copy.proof.signature) };
  }
  if (tamper.kind === 'plan') {
    const plan = copy.roll.randomness;
    copy.roll.randomness = plan.source === 'streamer_commit' ? { ...plan, commitment: flipNibble(plan.commitment) }
      : { ...plan, round: (BigInt(/^[0-9]{1,20}$/.test(plan.round) ? plan.round : '0') + 1n).toString() };
  }
  if (tamper.kind === 'winners') {
    const [first, second] = copy.winners;
    if (first !== undefined && second !== undefined) copy.winners = [second, first, ...copy.winners.slice(2)];
    else copy.winners = [entries.find(item => !copy.winners.includes(item.handle))?.handle ?? `${first ?? ''}x`, ...copy.winners.slice(1)];
  }
  return deepFreeze(copy);
}

/** The entry a tamper of this kind would target by default: the first recorded winner. */
export function defaultTamperIndex(writ: LotsWrit): number {
  const index = writ.roll.entries.findIndex(entry => entry.handle === writ.winners[0]);
  return index < 0 ? 0 : index;
}

/** Four-step proof walk. A failed step blocks every later step. */
export async function inspectWrit(original: LotsWrit, tamper?: Tamper): Promise<LabReport> {
  const writ = tamper ? applyTamper(original, tamper) : original;
  const { bytes, segments } = sealPreimage(writ.roll);
  const baseline = sealPreimage(original.roll).bytes;
  const diff = tamper ? preimageDiff(baseline, bytes, segments) : undefined;
  const steps: LabStep[] = [];
  let failed: StepId | undefined;
  const add = (step: LabStep) => {
    if (failed) { steps.push({ id: step.id, status: 'blocked', reason: 'blocked_by_earlier_step' }); return; }
    steps.push(step);
    if (step.status === 'fail') failed = step.id;
  };
  const invalid = rollReason(writ.roll);
  add(invalid ? { id: 'serialization', status: 'fail', reason: invalid } : { id: 'serialization', status: 'pass' });
  const recomputed = failed ? '' : toHex(await sha256(bytes));
  add(recomputed === writ.seal ? { id: 'seal', status: 'pass', recorded: writ.seal, recomputed }
    : { id: 'seal', status: 'fail', reason: 'seal_mismatch', recorded: writ.seal, recomputed });
  let randomness: Uint8Array | undefined;
  if (!failed) {
    const proof = writ.proof; const plan = writ.roll.randomness;
    if (proof.source === 'streamer_commit' && plan.source === 'streamer_commit') {
      const commitment = toHex(await sha256(text('castle-control/commit/v1\0'), hexBytes(proof.seed)));
      randomness = hexBytes(proof.seed);
      add(commitment === plan.commitment ? { id: 'randomness', status: 'pass', recorded: plan.commitment, recomputed: commitment }
        : { id: 'randomness', status: 'fail', reason: 'commitment_mismatch', recorded: plan.commitment, recomputed: commitment });
    } else if (proof.source === 'drand_quicknet' && plan.source === 'drand_quicknet') {
      const digest = await sha256(hexBytes(proof.signature));
      randomness = digest;
      const computed = toHex(digest);
      add(!/^[1-9][0-9]{0,19}$/.test(plan.round) ? { id: 'randomness', status: 'fail', reason: 'invalid_round' }
        : computed !== proof.randomness ? { id: 'randomness', status: 'fail', reason: 'randomness_mismatch', recorded: proof.randomness, recomputed: computed }
          : { id: 'randomness', status: 'unverified', reason: 'signature_not_authenticated', recorded: proof.randomness, recomputed: computed });
    } else add({ id: 'randomness', status: 'fail', reason: 'source_mismatch' });
  } else add({ id: 'randomness', status: 'blocked' });
  let computed_winners: readonly LotsHandle[] = [];
  let trace: readonly TracePick[] = [];
  if (!failed && randomness) {
    ({ winners: computed_winners, trace } = await traceCast(randomness, writ.seal, writ.roll));
    const matches = computed_winners.length === writ.winners.length && computed_winners.every((winner, index) => winner === writ.winners[index]);
    add(matches ? { id: 'derivation', status: 'pass', recorded: writ.winners.join(', '), recomputed: computed_winners.join(', ') }
      : { id: 'derivation', status: 'fail', reason: 'cast_mismatch', recorded: writ.winners.join(', '), recomputed: computed_winners.join(', ') });
  } else add({ id: 'derivation', status: 'blocked' });
  const plan = writ.roll.randomness;
  const report: LabReport = {
    writ, steps: Object.freeze(steps.map(step => Object.freeze(step))), source: writ.proof.source,
    verdict: failed ? 'caught' : steps.some(step => step.status === 'unverified') ? 'unverified' : 'verified',
    entry_count: writ.roll.entries.length, byte_length: bytes.length, preimage: bytes, segments, trace, computed_winners,
    ...(failed ? { caught_at: failed } : {}), ...(tamper ? { tamper } : {}), ...(diff ? { diff } : {}),
    ...(plan.source === 'drand_quicknet' ? { round: plan.round } : {}),
  };
  return Object.freeze(report);
}

/** A window of preimage bytes around an offset, for the hex excerpt. */
export function byteWindow(bytes: Uint8Array, offset: number, width = 16): { start: number; bytes: readonly number[] } {
  const start = Math.max(0, Math.min(offset - Math.floor(width / 3), bytes.length - width));
  return { start, bytes: Array.from(bytes.subarray(start, start + width)) };
}
