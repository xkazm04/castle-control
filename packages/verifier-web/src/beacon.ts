import { bls12_381 } from '@noble/curves/bls12-381';
import { be, bytes, digest, encoded } from './crypto.ts';
import { checkChain, checkRound, roundNumber } from './schema.ts';

const QUICKNET_DST = 'BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_';

/** Authenticate a round with a separately supplied anchor; no trust is learned from the round. */
export async function verifyBeaconRound(value: unknown, trustedChain: unknown): Promise<string> {
  const chain = checkChain(trustedChain);
  const round = checkRound(value);
  const message = await digest(be(roundNumber(round.round), 8));
  try {
    const signature = bls12_381.shortSignatures.Signature.fromBytes(bytes(round.signature));
    const key = bls12_381.G2.Point.fromHex(bytes(chain.public_key));
    signature.assertValidity();
    key.assertValidity();
    if (signature.is0() || key.is0()) throw new Error('Identity point');
    const hashed = bls12_381.shortSignatures.hash(message, QUICKNET_DST);
    if (!bls12_381.shortSignatures.verify(signature, hashed, key)) throw new Error('Pairing mismatch');
  } catch (error) {
    throw new Error('BLS signature verification failed', { cause: error });
  }
  const randomness = encoded(await digest(bytes(round.signature)));
  if (randomness !== round.randomness) throw new Error('Round randomness mismatch');
  return randomness;
}
