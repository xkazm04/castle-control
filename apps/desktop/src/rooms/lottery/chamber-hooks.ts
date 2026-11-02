import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react';
import type { RefObject } from 'react';
import { stewardDock } from '@castle-control/ui/steward-flow';
import { useReducedMotion } from './playback.js';

/**
 * Height of the chamber band still visible above the raised Steward sheet, so the stage
 * can shrink into it and stay the live preview. Undefined while the sheet is lowered or
 * no lottery draft is open.
 */
export function useSheetBand(root: RefObject<HTMLElement | null>, drafting: boolean): number | undefined {
  const dock = useSyncExternalStore(stewardDock.subscribe, stewardDock.getSnapshot, stewardDock.getSnapshot);
  const up = dock.expanded && drafting;
  const [band, setBand] = useState<number>();
  useLayoutEffect(() => {
    if (!up || typeof ResizeObserver === 'undefined') { setBand(undefined); return undefined; }
    let frame = 0;
    const measure = () => {
      const sheet = document.querySelector('.cc-steward-sheet');
      const node = root.current;
      if (!sheet || !node) { setBand(undefined); return; }
      const scroller = node.parentElement;
      if (scroller && scroller.scrollTop) scroller.scrollTop = 0;
      setBand(Math.max(0, Math.round(sheet.getBoundingClientRect().top - node.getBoundingClientRect().top)));
    };
    const later = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(later);
    const sheet = document.querySelector('.cc-steward-sheet');
    if (sheet) observer.observe(sheet);
    if (root.current) observer.observe(root.current);
    measure();
    addEventListener('resize', later);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); removeEventListener('resize', later); };
  }, [up, root, dock.beats.length, dock.sessions]);
  return up ? band : undefined;
}

/** The demo's roll fills lot by lot while its step is open; reduced motion shows the full roll. */
export function useFill<T>(entries: readonly T[] | undefined, filling: boolean): readonly T[] | undefined {
  const reduced = useReducedMotion();
  const [count, setCount] = useState(0);
  const total = entries?.length ?? 0;
  const animate = filling && !reduced && total > 0;
  useEffect(() => {
    if (!animate) return undefined;
    setCount(0);
    const step = Math.max(1, Math.ceil(total / 45));
    const timer = setInterval(() => setCount(current => {
      const next = Math.min(total, current + step);
      if (next >= total) clearInterval(timer);
      return next;
    }), 40);
    return () => clearInterval(timer);
  }, [animate, total]);
  if (!entries) return undefined;
  return animate ? entries.slice(0, count) : entries;
}
