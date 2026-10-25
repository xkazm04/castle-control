import { checkChain, checkWrit, roundNumber, timestamp } from './schema.ts';
import type { Entry, Writ } from './schema.ts';
import { verifyBeaconRound } from './beacon.ts';
import { be, bytes, concat, digest, encoded, encoder, u32 } from './crypto.ts';

function entryBytes(entries: readonly Entry[]): Uint8Array<ArrayBuffer> {
  return concat(...entries.map((entry) => concat(u32(entry.handle.length), encoder.encode(entry.handle), u32(entry.weight))));
}
function canonical(writ: Writ): Uint8Array<ArrayBuffer> {
  const r = writ.roll;
  const source = r.randomness.source === 'drand_quicknet'
    ? concat(new Uint8Array([0]), bytes(r.randomness.chain_hash), be(BigInt(r.randomness.round), 8))
    : concat(new Uint8Array([1]), bytes(r.randomness.commitment));
  return concat(encoder.encode('castle-control/seal/v1\0'), u32(r.entries.length), entryBytes(r.entries),
    u32(r.winner_count), encoder.encode(r.sealed_at), u32(r.margin_s), source);
}
export function sample(candidate: bigint, total: bigint): bigint | undefined {
  const limit = ((1n << 64n) / total) * total;
  return candidate < limit ? candidate % total : undefined;
}
async function cast(writ: Writ, randomness: Uint8Array<ArrayBuffer>): Promise<readonly string[]> {
  const seed = await digest(concat(encoder.encode('castle-control/cast/v1\0'), randomness, bytes(writ.seal), entryBytes(writ.roll.entries)));
  const pool = [...writ.roll.entries];
  const winners: string[] = [];
  let counter = 0n;
  while (winners.length < writ.roll.winner_count) {
    if (counter > 0xffffffffffffffffn) throw new Error('Cast exhausted');
    const block = await digest(concat(seed, be(counter++, 8)));
    const candidate = new DataView(block.buffer).getBigUint64(0, false);
    const total = pool.reduce((n, entry) => n + BigInt(entry.weight), 0n);
    let target = sample(candidate, total);
    if (target === undefined) continue;
    let index = 0;
    for (const entry of pool) {
      if (target < BigInt(entry.weight)) break;
      target -= BigInt(entry.weight); index++;
    }
    const winner = pool.splice(index, 1)[0];
    if (!winner) throw new Error('Cast total');
    winners.push(winner.handle);
  }
  return Object.freeze(winners);
}
export type Verification = Readonly<{
  status: 'verified' | 'unverified'; seal: string; label: string;
  computed_winners: readonly string[]; reason: string;
}>;
const verifiedResults = new WeakSet<Verification>();

/** Seal/cast recomputation succeeds separately from beacon authentication. */
export async function verifyDecodedWrit(value: unknown, trustedChain?: unknown): Promise<Verification> {
  const writ = checkWrit(value);
  // Own the trust snapshot before the first async operation, just like the writ.
  const chain = trustedChain === undefined ? undefined : checkChain(trustedChain);
  if (encoded(await digest(canonical(writ))) !== writ.seal) throw new Error('Seal mismatch');
  const p = writ.proof;
  let randomness: Uint8Array<ArrayBuffer>;
  let verified = false;
  let label: string;
  let reason: string;
  if (p.source === 'streamer_commit' && writ.roll.randomness.source === p.source) {
    randomness = bytes(p.seed);
    if (encoded(await digest(concat(encoder.encode('castle-control/commit/v1\0'), randomness))) !== writ.roll.randomness.commitment) {
      throw new Error('Offline commitment mismatch');
    }
    verified = true;
    label = 'streamer-controlled';
    reason = 'Seal and cast verified. The streamer chose this seed; compare the previously published seal.';
  } else if (p.source === 'drand_quicknet' && writ.roll.randomness.source === p.source) {
    randomness = await digest(bytes(p.signature));
    if (encoded(randomness) !== p.randomness) throw new Error('Round randomness mismatch');
    if (chain !== undefined) {
      const genesis = BigInt(timestamp(chain.genesis_time));
      const after = BigInt(timestamp(writ.roll.sealed_at)) + BigInt(writ.roll.margin_s);
      const selected = after < genesis ? 1n : (after - genesis) / BigInt(chain.period_s) + 2n;
      if (chain.hash !== writ.roll.randomness.chain_hash || selected !== roundNumber(writ.roll.randomness.round)) {
        throw new Error('Round schedule/chain mismatch');
      }
      await verifyBeaconRound({ round: writ.roll.randomness.round, signature: p.signature, randomness: p.randomness }, chain);
      verified = true;
    }
    label = 'drand-quicknet';
    reason = chain === undefined
      ? 'UNVERIFIED: BLS signature authentication requires a separately trusted chain.'
      : 'Seal, scheduled round, BLS signature and cast verified. Compare the previously published seal.';
  } else { throw new Error('Source/proof mismatch'); }
  const computed_winners = await cast(writ, randomness);
  if (computed_winners.some((handle, index) => handle !== writ.winners[index])) throw new Error('Cast mismatch');
  const result: Verification = Object.freeze({ status: verified ? 'verified' : 'unverified', seal: writ.seal, label, computed_winners, reason });
  if (verified) verifiedResults.add(result);
  return result;
}

/** No unverified or caller-constructed value can feed an animation. */
export function animationCast(result: Verification): readonly string[] {
  if (!verifiedResults.has(result)) throw new Error('Unverified result cannot feed an animation');
  return result.computed_winners;
}
