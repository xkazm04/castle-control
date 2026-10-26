import type { Shape } from './lots-model.js';
import { stageCopy as copy } from './lots-stage-copy.js';
import type { StageFocus } from './lots-stage-route.js';

// In-process fixture design data only: no executable styles or external input.
export type FixtureDesign = {
  id: 'wax' | 'blue' | 'gold' | 'custom'; name: string;
  ink: 'gules' | 'azure' | 'or'; stock: 'paper' | 'tint'; shape: Shape;
};
export const fixturePresets: readonly FixtureDesign[] = [
  { id: 'wax', name: copy.presets.wax, ink: 'gules', stock: 'paper', shape: 'urn' },
  { id: 'blue', name: copy.presets.blue, ink: 'azure', stock: 'tint', shape: 'wheel' },
  { id: 'gold', name: copy.presets.gold, ink: 'or', stock: 'paper', shape: 'deck' },
];
export const defaultDesign: FixtureDesign = fixturePresets[0] ?? { id: 'wax', name: copy.presets.wax, ink: 'gules', stock: 'paper', shape: 'urn' };
export const cannedDesign: FixtureDesign = { id: 'custom', name: copy.presets.custom, ink: 'or', stock: 'tint', shape: 'urn' };
export const fixtureDelayMs = 450;
export function createDesignPreview(apply: (design: FixtureDesign) => void, discard: () => void) {
  let snapshot: { prompt: string; busy: boolean; pending?: FixtureDesign } = { prompt: '', busy: false };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  const publish = (next: typeof snapshot) => { snapshot = next; for (const listener of listeners) listener(); };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    prompt(prompt: string) { publish({ ...snapshot, prompt }); },
    generate() {
      if (snapshot.busy || !snapshot.prompt.trim()) return;
      publish({ prompt: snapshot.prompt, busy: true });
      timer = setTimeout(() => { publish({ ...snapshot, busy: false, pending: cannedDesign }); }, fixtureDelayMs);
    },
    seal() { if (snapshot.pending && !snapshot.busy) { apply(snapshot.pending); publish({ prompt: '', busy: false }); } },
    tear() { clearTimeout(timer); publish({ prompt: '', busy: false }); discard(); },
    dispose() { clearTimeout(timer); },
  };
}
export function focusTitle(focus: StageFocus): string {
  if (focus === 'restyle') return copy.presets_title;
  if (focus === 'custom') return copy.custom;
  const entry = copy.entries.find(entry => entry.id === focus);
  return entry ? `${entry.id === 'writ' ? '' : `${entry.id} `}${entry.title}` : copy.title;
}
export function escapeStage(event: { key: string; preventDefault: () => void }, back: () => void) {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  back();
}
