// Keep hash parsing small: design data and chamber copy load with the lazy page.
const focusIds = ['1.1', '1.2', '1.3', '1.4', '1.5', '1.6', 'writ', 'restyle', 'custom'] as const;
export type StageFocus = typeof focusIds[number];
export const stageHash = '#/lottery/stage';
export function stageRoute(hash: string): StageFocus | 'stage' | undefined {
  if (hash === stageHash) return 'stage';
  if (!hash.startsWith(`${stageHash}/`)) return undefined;
  const id = hash.slice(stageHash.length + 1);
  return focusIds.find(focus => focus === id);
}
