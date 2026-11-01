import { useEffect, useRef, useState } from 'react';
import type { TransitionEvent } from 'react';
import type { ModuleId } from '@castle-control/ui';

export const diorama = { w: 1060, h: 698 } as const;

export function fitDiorama(width: number, height: number) {
  return Math.min(width / diorama.w, height / diorama.h) || 1;
}

export function useDiorama() {
  const host = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const measure = () => setScale(fitDiorama(element.clientWidth, element.clientHeight));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { host, scale };
}

export function dollyMilliseconds(duration: string) {
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)(?:ms|s)$/.test(duration.trim())) throw new Error('Missing Keep dolly duration token');
  const amount = Number.parseFloat(duration);
  return duration.trim().endsWith('ms') ? amount : amount * 1000;
}

export function useKeepCamera(on_open: (id: ModuleId) => void) {
  const castle = useRef<HTMLDivElement>(null);
  const pending = useRef<ModuleId | undefined>(undefined);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const duration = useRef(0);
  const [opening, setOpening] = useState<ModuleId | undefined>(undefined);
  useEffect(() => {
    if (castle.current) duration.current = dollyMilliseconds(getComputedStyle(castle.current).getPropertyValue('--m-dolly'));
    return () => { clearTimeout(timeout.current); pending.current = undefined; };
  }, []);
  function finish() {
    const id = pending.current;
    if (!id) return;
    pending.current = undefined;
    clearTimeout(timeout.current);
    on_open(id);
  }
  function open(id: ModuleId) {
    if (pending.current) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { on_open(id); return; }
    pending.current = id;
    setOpening(id);
    timeout.current = setTimeout(finish, duration.current);
  }
  function transitionEnd(event: TransitionEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget && event.propertyName === 'transform') finish();
  }
  return { castle, opening, open, transitionEnd };
}
