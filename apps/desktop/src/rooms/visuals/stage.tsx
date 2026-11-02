import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { Visual } from '@castle-control/contract';
import { art, frames } from '../../demo/model.js';
import { sampleNight } from '../../beacons-nights.js';
import { clockLabel, nightBursts, traceAt } from '../../beacons-replay.js';
import type { ReplayTrace } from '../../beacons-replay.js';
import { decayLabel, nightPhrase, nightTrace } from './flow-model.js';
import { source_labels } from './contribution-input.js';
import { findPreset } from './presets.js';
import { useReducedMotion } from './replay-driver.js';
import { stage_pace, stageClock } from './stage-state.js';
import { narrate, offeringText, recentOfferings } from './stage-narration.js';
import type { StageView } from './stage-view.js';
import './stage.css';

type Look = { kind: 'object' | 'frame' | 'border'; url?: string; label: string };
/** The overlay look for a design: preset art, the built-in altar and frame, or the screen border. */
export function beaconLook(visual: Visual): Look {
  const preset = findPreset(visual.design_id);
  if (preset) return { kind: preset.kind, url: preset.url, label: preset.kind === 'object' ? 'On-screen object' : 'Camera frame' };
  if (visual.design_id === 'altar') return { kind: 'object', url: art('heraldic', 'altar'), label: 'On-screen object' };
  if (visual.design_id === 'camera-frame') return { kind: 'frame', url: frames.heraldic, label: 'Camera frame' };
  return { kind: 'border', label: 'Screen border' };
}

/** The stream behind the beacon and the beacon's own art layer, shared by the picture and the picker. */
function ScreenArt({ look, flare }: { look: Look; flare: string }) {
  return <>
    <img className="visuals-monitor__scene" src="/art/malakor-lair-wide.webp" alt="" />
    {look.kind === 'object' && look.url && <div className="visuals-monitor__object" key={flare}>
      <span className="visuals-monitor__halo" aria-hidden="true" />
      <img src={look.url} alt="" />
    </div>}
    {look.kind === 'frame' && look.url && <div className="visuals-monitor__cam" key={flare}>
      <img className="visuals-monitor__face" src="/art/malakor-facecam.webp" alt="" />
      <img className="visuals-monitor__frame" src={look.url} alt="" />
    </div>}
    {look.kind === 'border' && <div className="visuals-monitor__border" key={flare} aria-hidden="true" />}
  </>;
}

/** A small screen for a picker card: the same look at the beacon's own blaze. */
export function BeaconThumb({ visual, intensity, label }: { visual: Visual; intensity: number; label: string }) {
  const look = beaconLook(visual);
  return <span className="visuals-thumb" role="img" aria-label={label} data-kind={look.kind}
    style={{ '--blaze': intensity.toFixed(3) } as CSSProperties}>
    <ScreenArt look={look} flare="rest" />
  </span>;
}

/** Plays the night the picture shows. Reduced motion: no playhead runs; the night rests at its peak. */
function usePlayback(key: string | undefined, trace: ReplayTrace | undefined) {
  const reduced = useReducedMotion();
  const peak = trace?.peak.t ?? 0;
  useEffect(() => {
    stageClock.pause();
    stageClock.seek(key && reduced ? peak : 0);
    if (key && !reduced) stageClock.play();
  }, [key, reduced, peak]);
  const time = useSyncExternalStore(stageClock.subscribe, stageClock.getSnapshot, stageClock.getSnapshot);
  useEffect(() => {
    if (!time.playing || reduced) return;
    let frame = 0;
    let last = performance.now();
    const step = (now: number) => {
      stageClock.tick(Math.min(250, now - last) * stage_pace);
      last = now;
      if (stageClock.getSnapshot().playing) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [time.playing, reduced]);
  return { position: key ? time.position_s : undefined, playing: time.playing, reduced };
}

function Spark({ trace, position, label }: { trace: ReplayTrace; position: number | undefined; label: string }) {
  const width = 240; const height = 48;
  const step = Math.max(1, Math.floor(trace.points.length / 160));
  const points = trace.points.filter((_, index) => index % step === 0 || index === trace.points.length - 1)
    .map(point => `${(point.t / trace.duration_s * width).toFixed(1)},${(height - point.intensity * height).toFixed(1)}`).join(' ');
  return <svg className="visuals-spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={label}>
    <polygon className="visuals-spark__area" points={`0,${height} ${points} ${width},${height}`} />
    <polyline className="visuals-spark__line" points={points} />
    {position !== undefined && <line className="visuals-spark__head" x1={position / trace.duration_s * width} x2={position / trace.duration_s * width} y1="0" y2={height} />}
  </svg>;
}

/** The chamber's one picture: the selected beacon as a viewer would see it on stream, live with any draft. */
export function BeaconStage({ view, burst, actions, notice, reading, eyebrow, compose }: {
  compose?: (picture: ReactNode, reading: ReactNode) => ReactNode;
  view: StageView; burst: string; actions?: ReactNode; notice?: ReactNode;
  /** Replaces the weighted-subs line at rest (core mode: no live total is read here). */
  reading?: string;
  /** A mark after the look's name (core mode: "In your core"). */
  eyebrow?: string;
}) {
  const { item } = view;
  const curve = item.visual.curve;
  const look = beaconLook(item.visual);
  const spark = nightTrace(curve, view.spark, item.gift_weight);
  const night = view.night ? sampleNight(view.night) : undefined;
  const play_key = view.mode === 'night' && night ? `${view.flow}:${night.id}:${item.visual.visual_id}:${JSON.stringify(curve)}` : undefined;
  const playback = usePlayback(play_key, view.mode === 'night' ? spark : undefined);
  const counted = useMemo(() => new Set(night ? nightBursts(night.offerings).map(burst => burst.offering) : []), [night]);
  const at = playback.position;
  const now = at !== undefined ? traceAt(spark, curve, at) : { total: item.total, intensity: item.intensity };
  const intensity = now.intensity;
  const percent = Math.round(intensity * 100);
  const ticks = night && at !== undefined ? recentOfferings(night.offerings, at) : [];
  const flare = night ? `n-${ticks.find(index => counted.has(index)) ?? 'none'}` : `e-${burst}-${view.shot ?? ''}`;
  const top = curve.ranges.at(-1)?.total ?? 0;
  const pinned = now.total >= top && top > 0;
  const style = { '--blaze': intensity.toFixed(3) } as CSSProperties;
  const line = night && at !== undefined
    ? narrate({ name: item.visual.name.toLowerCase(), offerings: night.offerings, counted, trace: spark, curve, position: at })
    : view.before !== undefined ? `${view.shot}: ${Math.round(view.before * 100)}% → ${percent}% once you hold to fire.`
    : undefined;
  const picture = <figure className="visuals-monitor" style={style} data-intensity={intensity.toFixed(3)} data-pinned={pinned}>
      <div className="visuals-monitor__screen">
        <ScreenArt look={look} flare={flare} />
        {ticks.length > 0 && night && <ol className="visuals-monitor__ticker" aria-label="Latest simulated offerings">
          {ticks.map(index => {
            const offering = night.offerings[index];
            return offering && <li key={index} data-counted={counted.has(index)}>{offeringText(offering)}</li>;
          })}
        </ol>}
        {/* One SIMULATED mark per picture: a simulated draft stamp already carries it. */}
        {!/simulated/i.test(view.stamp ?? '') && <span className="cc-sim visuals-monitor__sim">Simulated</span>}
        {view.stamp && <span className="visuals-monitor__stamp">{view.stamp}</span>}
        {pinned && view.mode === 'night' && <span className="visuals-monitor__pin">At full blaze</span>}
      </div>
      <figcaption className="cc-sr">{`${item.visual.name} as viewers would see it · ${percent}% blaze · simulated`}</figcaption>
    </figure>;
  const readout = <div className="visuals-stage__read">
      <p className="visuals-stage__eyebrow">{look.label}{eyebrow && view.mode === 'rest' && <b> · {eyebrow}</b>}{view.mode !== 'rest' && <b> · {view.flow === 'visuals-demo' ? 'demo' : 'draft'}</b>}</p>
      <h2 className="visuals-stage__name">{item.visual.name}</h2>
      <p className="visuals-stage__blaze" aria-live={view.mode === 'night' ? 'off' : 'polite'}>
        <b>{view.before !== undefined && <s>{Math.round(view.before * 100)}</s>}{percent}<small>%</small></b><span>blaze</span></p>
      <span className="cc-meter cc-meter--gilt visuals-stage__meter" aria-hidden="true"><i style={{ '--v': `${percent}%` } as CSSProperties} /></span>
      <p className="visuals-stage__total">{reading !== undefined && view.mode !== 'night' ? reading
        : `${now.total.toFixed(1)} weighted subs${at !== undefined ? ` · ${clockLabel(at)} of 48:00` : ''}`}</p>
      <div className="visuals-stage__spark">
        <Spark trace={spark} position={at} label={`${item.visual.name} across the ${sampleNight(view.spark).name.toLowerCase()} · ${nightPhrase(spark)} · simulated`} />
        <span>{sampleNight(view.spark).name} · {nightPhrase(spark)}</span>
      </div>
      <p className="visuals-stage__tags">
        <span className="cc-stamp cc-stamp--waiting visuals-tag--ch">{item.visual.input ? source_labels[item.visual.input.source] : 'Not routed'}</span>
        <span className="cc-stamp cc-stamp--waiting">{decayLabel(curve.decay)}</span>
      </p>
      {line && <p className="visuals-stage__line" data-testid="stage-line">{line}</p>}
      {notice && <p className="visuals-stage__notice" role="status" aria-live="polite">{notice}</p>}
      {actions && <div className="visuals-stage__actions">{actions}</div>}
    </div>;
  if (compose) return compose(<section className="visuals-stage visuals-stage--picture" aria-label="Beacon picture"
    data-mode={view.mode} data-kind={look.kind}>{picture}</section>, readout);
  return <section className="visuals-stage" aria-label="Beacon picture" data-mode={view.mode} data-kind={look.kind}>
    {picture}{readout}
  </section>;
}
