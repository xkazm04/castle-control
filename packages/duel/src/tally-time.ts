/** A radix index over nonnegative safe-integer milliseconds (53 fixed bits). */
export type TimeIndex = { seen: number; earlier?: TimeIndex; later?: TimeIndex };

export function indexTime(root: TimeIndex, t_ms: number, seen: number): void {
  if (!Number.isSafeInteger(t_ms) || t_ms < 0) throw new Error('Expected nonnegative integer event time');
  let node = root;
  node.seen = seen;
  for (let power = 52; power >= 0; power--) {
    const later = Math.floor(t_ms / 2 ** power) % 2 === 1;
    let child = later ? node.later : node.earlier;
    if (!child) {
      child = { seen: 0 };
      if (later) node.later = child;
      else node.earlier = child;
    }
    child.seen = seen;
    node = child;
  }
}

/** At most 53 steps, independent of the number of events or gaps in time. */
export function seenAtTime(root: TimeIndex, t_ms: number): number {
  if (Number.isNaN(t_ms) || t_ms < 0) return 0;
  if (t_ms >= Number.MAX_SAFE_INTEGER) return root.seen;
  const time = Math.floor(t_ms);
  let node: TimeIndex | undefined = root;
  let seen = 0;
  for (let power = 52; power >= 0 && node; power--) {
    if (Math.floor(time / 2 ** power) % 2 === 1) {
      seen = node.earlier?.seen ?? seen;
      node = node.later;
    } else node = node.earlier;
  }
  return node?.seen ?? seen;
}
