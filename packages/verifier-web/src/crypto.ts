export const encoder = new TextEncoder();
export const concat = (...parts: Uint8Array[]): Uint8Array<ArrayBuffer> => {
  const output = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
};
export const bytes = (value: string): Uint8Array<ArrayBuffer> => Uint8Array.from(value.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));
export const encoded = (value: Uint8Array): string => Array.from(value, (b) => b.toString(16).padStart(2, '0')).join('');
export const be = (value: bigint, width: number): Uint8Array<ArrayBuffer> => {
  const output = new Uint8Array(width);
  for (let i = width - 1; i >= 0; i--) { output[i] = Number(value & 255n); value >>= 8n; }
  return output;
};
export const u32 = (value: number): Uint8Array<ArrayBuffer> => be(BigInt(value), 4);
export const digest = async (value: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> =>
  new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', value));
