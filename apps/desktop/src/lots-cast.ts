import type { LotsHandle, LotsProofRoll, LotsWrit } from '@castle-control/contract';

// cc-verify v1 byte protocol; extracted from the desktop's parity-pinned vector.
// Trusted in-process streamer_commit rehearsals only, not an imported-writ parser
// or a drand authenticator. Boundary parsing stays in packages/contract.
const text = (value: string) => new TextEncoder().encode(value);
const number = (value: bigint, size: number) => {
  const bytes = new Uint8Array(size);
  for (let index = size - 1; index >= 0; index--) { bytes[index] = Number(value & 255n); value >>= 8n; }
  return bytes;
};
const u32 = (value: number) => number(BigInt(value), 4);
const hex = (value: string) => {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error('Expected a 32-byte lowercase hex value.');
  return Uint8Array.from(value.match(/../g) ?? [], byte => Number.parseInt(byte, 16));
};
const join = (...values: Uint8Array[]) => {
  const result = new Uint8Array(values.reduce((size, value) => size + value.length, 0));
  let offset = 0;
  for (const value of values) { result.set(value, offset); offset += value.length; }
  return result;
};
const hash = async (...values: Uint8Array[]) => new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', join(...values)));
const encode = (value: Uint8Array) => Array.from(value, byte => byte.toString(16).padStart(2, '0')).join('');
function entryBytes(roll: LotsProofRoll): Uint8Array {
  if (roll.version !== 1 || !roll.entries.length || roll.winner_count < 1 || !Number.isInteger(roll.winner_count)
    || roll.winner_count > roll.entries.length || new Set(roll.entries.map(entry => entry.handle)).size !== roll.entries.length
    || roll.entries.some(entry => !/^[a-z0-9_]{1,25}$/.test(entry.handle)
      || !Number.isInteger(entry.weight) || entry.weight < 1 || entry.weight > 0xffff_ffff)) throw new Error('Invalid rehearsal roll.');
  return join(...roll.entries.map(entry => join(u32(entry.handle.length), text(entry.handle), u32(entry.weight))));
}

export async function sealOf(roll: LotsProofRoll): Promise<string> {
  if (roll.randomness.source !== 'streamer_commit') throw new Error('Only streamer-controlled rehearsals are supported.');
  return encode(await hash(text('castle-control/seal/v1\0'), u32(roll.entries.length), entryBytes(roll), u32(roll.winner_count),
    text(roll.sealed_at), u32(roll.margin_s), new Uint8Array([1]), hex(roll.randomness.commitment)));
}

export async function commitmentOf(seed: string): Promise<string> {
  return encode(await hash(text('castle-control/commit/v1\0'), hex(seed)));
}

export async function castWinners(revealed: string, seal: string, roll: LotsProofRoll): Promise<readonly LotsHandle[]> {
  const seed = await hash(text('castle-control/cast/v1\0'), hex(revealed), hex(seal), entryBytes(roll));
  const pool = [...roll.entries];
  const winners: LotsHandle[] = [];
  let counter = 0n;
  while (winners.length < roll.winner_count) {
    const block = await hash(seed, number(counter++, 8));
    const candidate = new DataView(block.buffer).getBigUint64(0);
    const total = pool.reduce((sum, entry) => sum + BigInt(entry.weight), 0n);
    if (candidate >= ((1n << 64n) / total) * total) continue;
    let target = candidate % total;
    const index = pool.findIndex(entry => { if (target < BigInt(entry.weight)) return true; target -= BigInt(entry.weight); return false; });
    const winner = pool.splice(index, 1)[0];
    if (!winner) throw new Error('Invalid cast total.');
    winners.push(winner.handle);
  }
  return Object.freeze(winners);
}

/** Returns the recomputed ordered winners or rejects; never claims live trust. */
export async function verifyWrit(writ: LotsWrit): Promise<readonly LotsHandle[]> {
  if (writ.proof.source !== 'streamer_commit' || writ.roll.randomness.source !== 'streamer_commit') throw new Error('Source mismatch.');
  if (await sealOf(writ.roll) !== writ.seal) throw new Error('Seal mismatch.');
  if (await commitmentOf(writ.proof.seed) !== writ.roll.randomness.commitment) throw new Error('Commitment mismatch.');
  const winners = await castWinners(writ.proof.seed, writ.seal, writ.roll);
  if (winners.length !== writ.winners.length || winners.some((winner, index) => winner !== writ.winners[index])) throw new Error('Cast mismatch.');
  return winners;
}
