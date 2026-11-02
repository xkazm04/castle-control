import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { ArtAnchors, ArtAssetKind, ArtPoint, ArtRect } from '@castle-control/contract';
import './living-preview.css';

/**
 * The asset alive, the way the overlay will drive it (C:/t/assets/living.html): a beacon's
 * core swells with support, a frame sits over a sample webcam, vote segments move inside
 * the measured track, a vessel casts winners from its mouth. Every number is sample data
 * and the picture says SIMULATED; under reduced motion it holds one still, readable frame.
 */
export type PreviewArt = {
  kind: ArtAssetKind; label: string; base?: string; effect?: string; effect_blend?: 'screen' | 'behind'; token?: string;
  anchors: ArtAnchors; palette: readonly string[]; width: number; height: number;
};

const fallback = {
  core: { x: 0.3, y: 0.28, w: 0.4, h: 0.34 }, window: { x: 0.06, y: 0.08, w: 0.88, h: 0.84 },
  track: { x: 0.08, y: 0.38, w: 0.84, h: 0.24 }, chamber: { x: 0.3, y: 0.3, w: 0.4, h: 0.35 }, mouth: { x: 0.5, y: 0.86 },
} as const;
const pct = (value: number) => `${(Math.min(1, Math.max(0, value)) * 100).toFixed(2)}%`;
const box = (rect: ArtRect): CSSProperties => ({ left: pct(rect.x), top: pct(rect.y),
  width: pct(Math.min(rect.w, 1 - rect.x)), height: pct(Math.min(rect.h, 1 - rect.y)) });

function stillMotion(): boolean {
  return typeof window === 'undefined' || typeof window.matchMedia !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
/** A step counter that advances every `ms`; it never ticks under reduced motion. */
function useTick(ms: number): { tick: number; still: boolean } {
  const [still] = useState(stillMotion);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (still) return;
    const timer = setInterval(() => setTick(value => value + 1), ms);
    return () => clearInterval(timer);
  }, [ms, still]);
  return { tick, still };
}
const accent = (art: PreviewArt, index = 2) => art.palette[index] ?? art.palette.at(-1) ?? 'currentColor';

const support = [0.2, 0.35, 0.3, 0.55, 0.8, 1, 0.75, 0.5, 0.35, 0.25];
const supportLine = ['quiet', 'a sub', 'cooling', '3 gift subs', 'a gift wave', 'peak blaze', 'cooling', 'a sub', 'cooling', 'quiet'];
function Beacon({ art }: { art: PreviewArt }) {
  const { tick, still } = useTick(900);
  const heat = still ? 0.7 : support[tick % support.length] ?? 0.3;
  const core = art.anchors.core_rect ?? fallback.core;
  const style = { '--living-heat': heat.toFixed(2), '--living-glow': accent(art), aspectRatio: `${art.width} / ${art.height}` } as CSSProperties;
  return <>
    <div className="cc-living__beacon" data-blend={art.effect_blend ?? 'screen'} style={style}>
      <span className="cc-living__bloom" style={box(core)} />
      {art.base && <img className="cc-living__body" src={art.base} alt={`${art.label} beacon`} />}
      <span className="cc-living__core" style={box(core)}>{art.effect && <img src={art.effect} alt="" />}</span>
    </div>
    <span className="cc-living__caption">Sample support · {still ? 'a gift wave' : supportLine[tick % supportLine.length]}</span>
  </>;
}

function Frame({ art }: { art: PreviewArt }) {
  const { tick, still } = useTick(1400);
  const window_rect = art.anchors.window_rect ?? fallback.window;
  const style = { '--living-glow': accent(art), '--living-heat': still ? '0.6' : String(0.35 + (tick % 3) * 0.25), aspectRatio: `${art.width} / ${art.height}` } as CSSProperties;
  return <>
    <div className="cc-living__frame" style={style}>
      <span className="cc-living__cam" style={box(window_rect)} aria-hidden="true">
        <svg viewBox="0 0 160 90" preserveAspectRatio="xMidYMax slice"><circle cx="80" cy="38" r="17" /><path d="M42 90c2-24 18-34 38-34s36 10 38 34Z" /></svg>
      </span>
      {art.base && <img className="cc-living__overlay" src={art.base} alt={`${art.label} frame`} />}
    </div>
    <span className="cc-living__caption">Sample webcam · your face sits in the open centre</span>
  </>;
}

const options = ['Go left', 'Go right', 'Skip the boss'];
const swings = [[40, 33, 27], [44, 30, 26], [38, 31, 31], [30, 28, 42], [34, 25, 41], [41, 29, 30]];
function VoteBar({ art }: { art: PreviewArt }) {
  const { tick, still } = useTick(1600);
  const votes = swings[still ? 0 : tick % swings.length] ?? [34, 33, 33];
  const track = art.anchors.track_rect ?? fallback.track;
  const colours = art.anchors.segments ?? [accent(art, 1), accent(art, 2), accent(art, 3)];
  const ratio = (track.w * art.width) / Math.max(1, track.h * art.height);
  const radius = art.anchors.track_radius ?? 0.2;
  const total = votes.reduce((sum, value) => sum + value, 0);
  return <div className="cc-living__votebar">
    <div className="cc-living__bar" style={{ aspectRatio: `${art.width} / ${art.height}` }}>
      <span className="cc-living__track" style={{ ...box(track), borderRadius: `${(radius * 100 / ratio).toFixed(2)}% / ${(radius * 100).toFixed(2)}%` }}>
        {votes.map((value, index) => <i key={index} style={{ flexGrow: value, background: colours[index] }} />)}
      </span>
      {art.base && <img className="cc-living__overlay" src={art.base} alt={`${art.label} vote bar housing`} />}
    </div>
    <span className="cc-living__legend">{options.map((name, index) => <span key={name}>
      <i style={{ background: colours[index] }} />{name} {Math.round(100 * (votes[index] ?? 0) / total)}%</span>)}</span>
  </div>;
}

const floats: readonly ArtPoint[] = [{ x: 0.2, y: 0.3 }, { x: 0.6, y: 0.2 }, { x: 0.4, y: 0.62 }, { x: 0.75, y: 0.55 }, { x: 0.1, y: 0.7 }, { x: 0.5, y: 0.4 }];
function Vessel({ art }: { art: PreviewArt }) {
  const { tick, still } = useTick(2600);
  const chamber = art.anchors.chamber_rect ?? fallback.chamber;
  const mouth = art.anchors.mouth ?? fallback.mouth;
  const casting = !still && tick > 0;
  const winner = 10 + (tick * 37) % 89;
  const style = { '--living-glow': accent(art), aspectRatio: `${art.width} / ${art.height}` } as CSSProperties;
  return <>
    <div className="cc-living__vessel" style={style}>
    {art.base && <img className="cc-living__body" src={art.base} alt={`${art.label} vessel`} />}
    <span className="cc-living__chamber" style={box(chamber)} aria-hidden="true">
      {floats.map((point, index) => <span key={index} className="cc-living__token" style={{ left: pct(point.x * 0.8), top: pct(point.y * 0.8), animationDelay: `${index * 0.3}s` }}>
        {art.token ? <img src={art.token} alt="" /> : null}</span>)}
    </span>
    {casting && <span key={tick} className="cc-living__cast" style={{ left: pct(mouth.x), top: pct(mouth.y) }} aria-hidden="true">
      {art.token ? <img src={art.token} alt="" /> : null}</span>}
    </div>
    <span className="cc-living__winner" key={`w${tick}`}><small>Winner · simulated</small>Sample viewer {still ? 42 : winner}</span>
    <span className="cc-living__caption">Sample draw · a winner cast from the mouth</span>
  </>;
}

const kind_names: Record<ArtAssetKind, string> = { beacon: 'Beacon', frame: 'Facecam frame', vote_bar: 'Vote bar', draw_vessel: 'Draw vessel' };

export function LivingPreview({ art, note }: { art: PreviewArt; note?: string }) {
  const body = art.kind === 'beacon' ? <Beacon art={art} /> : art.kind === 'frame' ? <Frame art={art} />
    : art.kind === 'vote_bar' ? <VoteBar art={art} /> : <Vessel art={art} />;
  return <figure className="cc-living" data-kind={art.kind} aria-label={`${kind_names[art.kind]} living preview · ${art.label} · SIMULATED`}>
    <div className="cc-living__scene">
      <span className="cc-living__sim">SIMULATED</span>
      {body}
    </div>
    <figcaption><b>{art.label}</b>{art.palette.length > 0 && <span className="cc-living__palette" aria-label="Palette">
      {art.palette.map(colour => <i key={colour} style={{ background: colour }} title={colour} />)}</span>}
      <span>{note ?? 'Animated with sample data. Nothing here reaches your stream until you seal.'}</span></figcaption>
  </figure>;
}
