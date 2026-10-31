// Room session data only. These are not wire fields or design-package promises.
export const sizes = ['S', 'M', 'L'] as const;
export const anchors = ['top-left', 'top-right', 'center', 'bottom-left', 'bottom-right'] as const;
export const colours = ['or', 'gules', 'azure', 'key'] as const;
export type Appearance = Readonly<{
  size: typeof sizes[number]; anchor: typeof anchors[number]; colour: typeof colours[number];
  burst_ms: number;
}>;
export const initialAppearance: Appearance = Object.freeze({
  size: 'M', anchor: 'bottom-left', colour: 'or', burst_ms: 600,
});

export function createAppearanceSession() {
  let state: Readonly<Record<string, Appearance>> = Object.freeze({});
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    change(id: string, field: keyof Appearance, value: string | number) {
      const current = state[id] ?? initialAppearance;
      let next: Appearance | undefined;
      if (field === 'size') { const size = sizes.find(item => item === value); if (size) next = { ...current, size }; }
      if (field === 'anchor') { const anchor = anchors.find(item => item === value); if (anchor) next = { ...current, anchor }; }
      if (field === 'colour') { const colour = colours.find(item => item === value); if (colour) next = { ...current, colour }; }
      if (field === 'burst_ms' && typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 60000) {
        next = { ...current, burst_ms: value };
      }
      if (!next) return;
      state = Object.freeze({ ...state, [id]: Object.freeze(next) });
      for (const listener of listeners) listener();
    },
  };
}
export type AppearanceSession = ReturnType<typeof createAppearanceSession>;
