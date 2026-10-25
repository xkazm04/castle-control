// Adapted from Shadowrunr OS, packages/stage-kit/src/playback.ts @ 7e4b6f8 (Apache-2.0).
// Reducer and timestamps are supplied locally; no contract dependency or show-specific markers.

/** Incremental playback over ordered, immutable values. No timer or DOM access. */
export class Timeline<State, Event> {
  private cursor = 0;
  private state: State;
  private applied_to_ms = -Infinity;
  private readonly times_ms: readonly number[];
  private readonly initial: () => State;
  private readonly reducer: (state: State, event: Event) => State;
  readonly events: readonly Event[];
  readonly start_ms: number;
  readonly end_ms: number;

  constructor(
    events: readonly Event[],
    initial: () => State,
    reducer: (state: State, event: Event) => State,
    timeOf: (event: Event) => number,
  ) {
    this.events = Object.freeze([...events]);
    this.times_ms = this.events.map(timeOf);
    for (let i = 0; i < this.times_ms.length; i++) {
      const at_ms = this.times_ms[i]!;
      if (!Number.isFinite(at_ms) || (i > 0 && at_ms < this.times_ms[i - 1]!)) {
        throw new RangeError('Timeline onsets must be finite and ordered');
      }
    }
    this.initial = initial;
    this.reducer = reducer;
    this.state = initial();
    this.start_ms = this.times_ms[0] ?? 0;
    this.end_ms = this.times_ms[this.times_ms.length - 1] ?? this.start_ms;
  }

  get duration_ms(): number { return this.end_ms - this.start_ms; }
  get scene(): State { return this.state; }
  get position_ms(): number { return this.applied_to_ms; }

  /** Forward steps apply only new events; backward seeks rebuild from a fresh initial state. */
  advanceTo(at_ms: number): State {
    if (Number.isNaN(at_ms)) throw new RangeError('Timeline position cannot be NaN');
    if (at_ms < this.applied_to_ms) {
      this.cursor = 0;
      this.state = this.initial();
    }
    this.applied_to_ms = at_ms;
    while (this.cursor < this.events.length && this.times_ms[this.cursor]! <= at_ms) {
      this.state = this.reducer(this.state, this.events[this.cursor]!);
      this.cursor++;
    }
    return this.state;
  }

  /** Let the host sleep until the next onset instead of ticking every frame. */
  get next_at_ms(): number | undefined { return this.times_ms[this.cursor]; }
  get finished(): boolean { return this.cursor >= this.events.length; }
}

export const CANVAS_W = 1920;
export const CANVAS_H = 1080;

/** Letterbox the fixed canvas into the host window. */
export function fitCanvas(window_width: number, window_height: number) {
  const scale = Math.min(window_width / CANVAS_W, window_height / CANVAS_H);
  return {
    scale,
    left: (window_width - CANVAS_W * scale) / 2,
    top: (window_height - CANVAS_H * scale) / 2,
  };
}
