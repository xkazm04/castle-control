/** Mirrors packages/renderer/src/draw/scenes.ts buildDrawScene:
 * 1200 ms flourish, then a winner every 900 ms. Keep both copies in sync;
 * desktop deliberately has no renderer dependency. */
export function revealedAt(elapsed_ms: number, count: number, { reduced_motion }: { reduced_motion: boolean }): number {
  if (reduced_motion) return count;
  return Math.min(count, Math.max(0, Math.floor((elapsed_ms - 1200) / 900) + 1));
}
