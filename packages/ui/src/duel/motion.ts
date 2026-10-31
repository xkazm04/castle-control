import { useSyncExternalStore } from 'react';

const query = '(prefers-reduced-motion: reduce)';
function subscribe(on_change: () => void): () => void {
  const media = window.matchMedia(query);
  media.addEventListener('change', on_change);
  return () => media.removeEventListener('change', on_change);
}
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}
