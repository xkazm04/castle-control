import type { BridgeStatus, StatusResult } from '@castle-control/contract';

export type Mode = 'fixture' | 'core';
export type ReadResult = { status: StatusResult; bridge: BridgeStatus };
export type Snapshot = {
  mode: Mode; phase: 'connecting' | 'ready' | 'error';
  status?: StatusResult; bridge?: BridgeStatus; message?: string;
};
export type Source = {
  mode: Mode;
  read: () => Promise<ReadResult>;
  listen: (invalidate: () => void, unavailable: () => void) => () => void;
};

/** One authoritative read model. In-flight invalidations are drained, never lost. */
export function createReadModel(source: Source) {
  let snapshot: Snapshot = { mode: source.mode, phase: 'connecting' };
  const listeners = new Set<() => void>();
  let active = false;
  let generation = 0;
  let connection = 0;
  let dirty = false;
  let running = false;
  function publish(next: Snapshot) {
    snapshot = next;
    for (const listener of listeners) listener();
  }
  async function refresh(run: number) {
    if (!active || run !== generation) return;
    dirty = true;
    if (running) return;
    running = true;
    try {
      while (dirty && active && run === generation) {
        dirty = false;
        const readConnection = connection;
        try {
          const read = await source.read();
          if (active && run === generation && readConnection === connection) publish({ mode: source.mode, phase: 'ready', ...read });
        } catch {
          // Never expose upstream text, URLs or the launch capability in the UI.
          if (active && run === generation && readConnection === connection) publish({ mode: source.mode, phase: 'error', message: 'Core status unavailable. Retrying on connection or event.' });
        }
      }
    } finally {
      running = false;
      if (dirty && active) void refresh(generation);
    }
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start() {
      if (active) throw new Error('Desktop client already started');
      active = true;
      const run = ++generation;
      const stop = source.listen(() => { void refresh(run); }, () => {
        if (active && run === generation) {
          connection++;
          publish({ mode: source.mode, phase: 'connecting', message: 'Core connection interrupted; status is unknown.' });
        }
      });
      void refresh(run);
      return () => { active = false; generation++; dirty = false; stop(); };
    },
  };
}
export type DesktopClient = ReturnType<typeof createReadModel>;
