import type { DemoStyle } from '../../demo/model.js';
import { styles } from '../../demo/model.js';

export const sizes = ['S', 'M', 'L'] as const;
export const anchors = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;
export const colours = ['azure', 'gules', 'or', 'key'] as const;
export type OutputLayer = 'chat' | 'vote';
export type OutputPhase = 'waiting' | 'visible' | 'hidden';
export type OutputParameters = {
  size: typeof sizes[number]; anchor: typeof anchors[number]; colour: typeof colours[number];
  art_style: DemoStyle; show_ms: number; hide_ms: number;
};
export type OutputSnapshot = Readonly<Record<OutputLayer, Readonly<OutputParameters>>>;
export type OutputPort = {
  getSnapshot: () => OutputSnapshot; subscribe: (listener: () => void) => () => void;
  update: (layer: OutputLayer, field: keyof OutputParameters, value: string) => void;
};

function timing(value: string, field: 'show_ms' | 'hide_ms'): number | undefined {
  const number = Number(value);
  if (!value.trim() || !Number.isFinite(number)) return;
  return Math.round(Math.max(field === 'show_ms' ? 0 : 250, Math.min(field === 'show_ms' ? 10000 : 60000, number)));
}

/** Session-only UI parameters. No wire identifiers, storage or network capability. */
export function createOutputPreview(): OutputPort {
  let snapshot: OutputSnapshot = {
    chat: { size: 'M', anchor: 'bottom-left', colour: 'azure', art_style: 'heraldic', show_ms: 0, hide_ms: 10000 },
    vote: { size: 'M', anchor: 'bottom-right', colour: 'or', art_style: 'heraldic', show_ms: 0, hide_ms: 10000 },
  };
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    update(layer, field, value) {
      let patch: Partial<OutputParameters>;
      if (field === 'show_ms' || field === 'hide_ms') {
        const milliseconds = timing(value, field); if (milliseconds === undefined) return;
        patch = { [field]: milliseconds };
      } else if (field === 'size') {
        const choice = sizes.find(item => item === value); if (!choice) return; patch = { size: choice };
      } else if (field === 'anchor') {
        const choice = anchors.find(item => item === value); if (!choice) return; patch = { anchor: choice };
      } else if (field === 'colour') {
        const choice = colours.find(item => item === value); if (!choice) return; patch = { colour: choice };
      } else {
        const choice = styles.find(item => item.id === value); if (!choice) return; patch = { art_style: choice.id };
      }
      if (Object.entries(patch).every(([key, next]) => snapshot[layer][key as keyof OutputParameters] === next)) return;
      snapshot = { ...snapshot, [layer]: { ...snapshot[layer], ...patch } };
      for (const listener of listeners) listener();
    },
  };
}

export function playOutputTiming(parameters: Pick<OutputParameters, 'show_ms' | 'hide_ms'>, on_phase: (phase: OutputPhase) => void): () => void {
  on_phase('waiting');
  const show = setTimeout(() => on_phase('visible'), parameters.show_ms);
  const hide = setTimeout(() => on_phase('hidden'), parameters.show_ms + parameters.hide_ms);
  return () => { clearTimeout(show); clearTimeout(hide); };
}
