import type { DrawShape } from '@castle-control/renderer';

/** Opt-in ceremony sound, synthesized with Web Audio: no assets, nothing fetched.
 * Presentation only: it follows the renderer's reveal cursor and never decides anything. */
export type CeremonySound = {
  flourish(shape: DrawShape, duration_ms: number): void;
  chime(order: number): void;
  fanfare(): void;
};

/** The parts of Web Audio this module uses; a fake satisfies it in tests. */
export type SoundContext = Pick<BaseAudioContext, 'currentTime' | 'sampleRate' | 'destination' | 'createGain'
  | 'createOscillator' | 'createBiquadFilter' | 'createBuffer' | 'createBufferSource'> & { resume?: () => Promise<void> };

/** Per-shape flourish texture: hit spacing (ms, first and last), band-pass centre (Hz) and hit length (s). */
export const flourish_texture: Readonly<Record<DrawShape, { gap: readonly [number, number]; band: number; hit: number; tone?: number }>> = {
  urn: { gap: [55, 95], band: 2600, hit: 0.03 },
  wheel: { gap: [45, 260], band: 3800, hit: 0.012, tone: 1800 },
  deck: { gap: [28, 40], band: 4200, hit: 0.018 },
  ballot_box: { gap: [70, 120], band: 1200, hit: 0.06 },
};

/** Hit onsets (ms) across the flourish: the wheel's ticks slow down as it settles, the others stay even. */
export function flourishHits(shape: DrawShape, duration_ms: number): readonly number[] {
  const [first, last] = flourish_texture[shape].gap;
  const hits: number[] = [];
  for (let at = 0; at < duration_ms && hits.length < 120;) {
    hits.push(Math.round(at));
    const progress = at / Math.max(1, duration_ms);
    at += first + (last - first) * progress * progress + (hits.length % 3) * 4;
  }
  return hits;
}

/** Bell pitch for the n-th winner: up a whole tone each time, folded back after an octave. */
export const chimeHz = (order: number) => 660 * 2 ** ((((order - 1) % 7) * 2) / 12);

export function createCeremonySound(context: SoundContext, volume = 0.16): CeremonySound {
  const master = context.createGain();
  master.gain.value = volume;
  master.connect(context.destination);
  const noise = context.createBuffer(1, Math.max(1, Math.round(context.sampleRate * 0.08)), context.sampleRate);
  const samples = noise.getChannelData(0);
  // Deterministic noise (a small LCG), so the texture is the same every ceremony.
  let seed = 7;
  for (let index = 0; index < samples.length; index++) { seed = (seed * 1103515245 + 12345) % 2147483648; samples[index] = seed / 1073741824 - 1; }
  const envelope = (at: number, peak: number, length: number) => {
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    gain.connect(master);
    return gain;
  };
  const tone = (frequency: number, at: number, length: number, peak: number, type: OscillatorType = 'sine') => {
    const oscillator = context.createOscillator();
    oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, at);
    oscillator.connect(envelope(at, peak, length));
    oscillator.start(at); oscillator.stop(at + length + 0.05);
  };
  return {
    flourish(shape, duration_ms) {
      const texture = flourish_texture[shape];
      const start = context.currentTime + 0.02;
      for (const hit of flourishHits(shape, duration_ms)) {
        const at = start + hit / 1000;
        const source = context.createBufferSource(); source.buffer = noise;
        const filter = context.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = texture.band; filter.Q.value = 3;
        source.connect(filter); filter.connect(envelope(at, 0.5, texture.hit));
        source.start(at, (hit % 5) * 0.01, texture.hit + 0.02);
        if (texture.tone) tone(texture.tone, at, texture.hit, 0.12, 'square');
      }
    },
    chime(order) {
      const at = context.currentTime + 0.01; const pitch = chimeHz(order);
      tone(pitch, at, 1.4, 0.55); tone(pitch * 2.76, at, 0.5, 0.12); tone(pitch * 5.4, at, 0.2, 0.05);
    },
    fanfare() {
      const at = context.currentTime + 0.05;
      [523.25, 659.25, 783.99, 1046.5].forEach((pitch, index) => tone(pitch, at + index * 0.11, index === 3 ? 1.2 : 0.35, 0.32, 'triangle'));
    },
  };
}

let shared: CeremonySound | undefined;
/** One context per window, created on the streamer's own click (browsers require a gesture). */
export function ceremonySound(): CeremonySound | undefined {
  if (shared) return shared;
  const Context = (globalThis as { AudioContext?: new () => AudioContext }).AudioContext;
  if (!Context) return undefined;
  const context = new Context();
  void context.resume();
  shared = createCeremonySound(context);
  return shared;
}
