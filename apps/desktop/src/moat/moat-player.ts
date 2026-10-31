// A replay clock that tests can drive by hand. Time only moves when `frames` ticks.

export type MoatSpeed = 1 | 2 | 8 | 60;
export const moatSpeeds: readonly MoatSpeed[] = [1, 2, 8, 60];

export type MoatClock = {
  now: () => number;
  /** Calls `tick` every frame until the returned function is called. */
  frames: (tick: () => void) => () => void;
};

export const browserClock: MoatClock = {
  now: () => performance.now(),
  frames: tick => {
    // A tick may stop the loop from inside itself (the replay reaching its end). Cancelling the frame that is
    // running does nothing, so the loop checks a flag before it books the next one.
    let stopped = false;
    let id = 0;
    const next = () => { if (stopped) return; tick(); if (!stopped) id = requestAnimationFrame(next); };
    id = requestAnimationFrame(next);
    return () => { stopped = true; cancelAnimationFrame(id); };
  },
};

export type MoatPlayerState = Readonly<{ playhead_ms: number; run_ms: number; playing: boolean; speed: MoatSpeed }>;
export type MoatPlayer = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => MoatPlayerState;
  /** From the end, play starts the replay again. */
  play: () => void;
  pause: () => void;
  seek: (playhead_ms: number) => void;
  setSpeed: (speed: MoatSpeed) => void;
};
export type MoatPlayerOptions = {
  /** A finished replay is the resting state, so the strip never opens empty. */
  start?: 'start' | 'end';
  /** Heartbeat mode: wait `rest_ms` at the end, then run again. */
  loop?: { rest_ms: number };
  speed?: MoatSpeed;
  /** Publish at most this often. A status-bar loop does not need sixty frames a second. */
  min_frame_ms?: number;
};
// A frame after a stalled tab must not jump the playhead.
const longestFrame = 250;

export function createMoatPlayer(run_ms: number, clock: MoatClock, options: MoatPlayerOptions = {}): MoatPlayer {
  let state: MoatPlayerState = { playhead_ms: options.start === 'start' ? 0 : run_ms, run_ms, playing: false, speed: options.speed ?? 8 };
  const listeners = new Set<() => void>();
  let stop: (() => void) | undefined;
  let last = 0; let rested = 0; let owed = 0;
  const publish = (next: MoatPlayerState) => { state = next; for (const listener of [...listeners]) listener(); };
  const halt = () => { stop?.(); stop = undefined; };

  function tick() {
    const now = clock.now();
    owed += Math.min(Math.max(now - last, 0), longestFrame);
    last = now;
    if (owed < (options.min_frame_ms ?? 0)) return;
    const delta = owed;
    owed = 0;
    if (state.playhead_ms >= run_ms) {
      rested += delta;
      if (options.loop && rested >= options.loop.rest_ms) { rested = 0; publish({ ...state, playhead_ms: 0 }); }
      return;
    }
    const playhead_ms = Math.min(state.playhead_ms + delta * state.speed, run_ms);
    if (playhead_ms >= run_ms && !options.loop) { halt(); publish({ ...state, playhead_ms, playing: false }); return; }
    publish({ ...state, playhead_ms });
  }
  function play() {
    if (stop) return;
    if (state.playhead_ms >= run_ms) state = { ...state, playhead_ms: 0 };
    last = clock.now(); rested = 0; owed = 0;
    stop = clock.frames(tick);
    publish({ ...state, playing: true });
  }
  return {
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => state,
    play,
    pause: () => { if (!stop) return; halt(); publish({ ...state, playing: false }); },
    seek: playhead_ms => publish({ ...state, playhead_ms: Math.min(Math.max(playhead_ms, 0), run_ms) }),
    setSpeed: speed => publish({ ...state, speed }),
  };
}

/** A clock for tests and reduced-motion previews: the caller says when a frame happens. */
export function manualClock(): MoatClock & { advance: (ms: number) => void; running: () => boolean } {
  let time = 0; let tick: (() => void) | undefined;
  return {
    now: () => time,
    frames: callback => { tick = callback; return () => { tick = undefined; }; },
    advance: ms => { time += ms; tick?.(); },
    running: () => tick !== undefined,
  };
}
