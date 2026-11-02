import { useSyncExternalStore } from 'react';
import type { ArtAssetKind } from '@castle-control/contract';

/**
 * Fixture mode only: the library look each kind was sealed with in this session, so the
 * SIMULATED previews (herald vote bar, draw preview) can wear it. Core mode keeps looks in the core.
 */
type Looks = Readonly<Partial<Record<ArtAssetKind, string>>>;
let looks: Looks = {};
const listeners = new Set<() => void>();
export const sealedLooks = {
  get: (): Looks => looks,
  set(kind: ArtAssetKind, library_id: string) { looks = { ...looks, [kind]: library_id }; for (const listener of listeners) listener(); },
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
};
export function useSealedLook(kind: ArtAssetKind): string | undefined {
  return useSyncExternalStore(sealedLooks.subscribe, () => looks[kind], () => looks[kind]);
}
