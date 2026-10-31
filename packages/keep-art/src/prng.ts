// FNV-1a over UTF-16 code units, matching the winner (including surrogate pairs).
export function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function hex8(n: number): string {
  return (`00000000${n.toString(16)}`).slice(-8);
}
