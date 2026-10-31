export const replay_speeds = [1, 10, 30] as const;
export type ReplaySpeed = typeof replay_speeds[number];
export type ReplayClockState = Readonly<{ position_s: number; playing: boolean; speed: ReplaySpeed; duration_s: number }>;

/** Presentation cursor over a simulated night. Time is injected by tick(), so the same
 * sequence of calls always lands on the same second; it never reads the wall clock. */
export function createReplayClock(duration_s: number, speed: ReplaySpeed = 30) {
  let state: ReplayClockState = Object.freeze({ position_s: 0, playing: false, speed, duration_s });
  const listeners = new Set<() => void>();
  const publish = (change: Partial<ReplayClockState>) => {
    const next = { ...state, ...change };
    if (next.position_s === state.position_s && next.playing === state.playing && next.speed === state.speed) return;
    state = Object.freeze(next);
    for (const listener of [...listeners]) listener();
  };
  const clamp = (seconds: number) => Math.max(0, Math.min(duration_s, seconds));
  /** Restarts from the top when the night already ended. */
  const play = () => publish({ playing: true, ...(state.position_s >= duration_s ? { position_s: 0 } : {}) });
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    play,
    pause() { publish({ playing: false }); },
    toggle() { if (state.playing) publish({ playing: false }); else play(); },
    seek(seconds: number) { if (Number.isFinite(seconds)) publish({ position_s: clamp(seconds) }); },
    setSpeed(next: ReplaySpeed) { if (replay_speeds.includes(next)) publish({ speed: next }); },
    /** Advances by real elapsed milliseconds times the speed; stops itself at the end of the night. */
    tick(elapsed_ms: number) {
      if (!state.playing || !Number.isFinite(elapsed_ms) || elapsed_ms <= 0) return;
      const position_s = clamp(state.position_s + elapsed_ms / 1000 * state.speed);
      publish({ position_s, playing: position_s < duration_s });
    },
  };
}
export type ReplayClock = ReturnType<typeof createReplayClock>;
