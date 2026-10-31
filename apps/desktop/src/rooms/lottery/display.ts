import type { DemoStyle } from '../../demo/model.js';
import type { CSSProperties } from 'react';
import type { DrawShape } from '@castle-control/renderer';

/** Presentation only: LotsDraw has no display payload. Never sent to RPC. */
export type DrawDisplay = {
  size: 'S' | 'M' | 'L'; anchor: 'tl' | 'tr' | 'bl' | 'br' | 'center';
  colour: 'gules' | 'azure' | 'or' | 'key'; art_style: DemoStyle; reveal_ms: number; shape: DrawShape;
  /** Full-chamber stage for the broadcast moment; the desk returns with one click. */
  theatre: boolean;
};
export function createDrawDisplay() {
  let state: DrawDisplay = { size: 'M', anchor: 'br', colour: 'gules', art_style: 'heraldic', reveal_ms: 1500, shape: 'urn', theatre: false };
  const listeners = new Set<() => void>();
  const edit = (change: Partial<DrawDisplay>) => {
    const value = change.reveal_ms ?? state.reveal_ms;
    const reveal_ms = Number.isFinite(value) ? Math.min(10_000, Math.max(100, Math.round(value))) : 1500;
    state = { ...state, ...change, reveal_ms };
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    edit,
    theatre(theatre: boolean) { if (state.theatre !== theatre) edit({ theatre }); },
    commitReveal(value: string) {
      edit({ reveal_ms: value.trim() === '' ? Number.NaN : Number(value) });
    },
  };
}
export type DrawDisplayPort = ReturnType<typeof createDrawDisplay>;
export function revealStyle(reveal_ms: number): CSSProperties & { '--draw-reveal': string } {
  return { '--draw-reveal': `${reveal_ms}ms` };
}
