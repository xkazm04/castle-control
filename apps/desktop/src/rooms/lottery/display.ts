import type { DemoStyle } from '../../demo/model.js';
import type { CSSProperties } from 'react';
import type { Display } from '@castle-control/contract';

/** Local control state; core mode adapts it to the existing upsert display. */
export type DrawDisplay = {
  size: 'S' | 'M' | 'L'; anchor: 'tl' | 'tr' | 'bl' | 'br' | 'center';
  colour: 'gules' | 'azure' | 'or' | 'key'; art_style: DemoStyle; reveal_ms: number;
};
export function createDrawDisplay() {
  let state: DrawDisplay = { size: 'M', anchor: 'br', colour: 'gules', art_style: 'heraldic', reveal_ms: 1500 };
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
    commitReveal(value: string) {
      edit({ reveal_ms: value.trim() === '' ? Number.NaN : Number(value) });
    },
  };
}
export type DrawDisplayPort = ReturnType<typeof createDrawDisplay>;
export function drawDisplayParams(display: DrawDisplay): Display {
  const anchors = { tl: 'top-left', tr: 'top-right', bl: 'bottom-left', br: 'bottom-right', center: 'center' } as const;
  return { size: display.size, anchor: anchors[display.anchor], colour_token: display.colour,
    art_style: display.art_style, timing_ms: display.reveal_ms };
}
export function revealStyle(reveal_ms: number): CSSProperties & { '--draw-reveal': string } {
  return { '--draw-reveal': `${reveal_ms}ms` };
}
