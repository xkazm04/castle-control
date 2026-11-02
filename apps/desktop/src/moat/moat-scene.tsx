import { Stamp } from '@castle-control/ui';
import { clockText } from './clock.js';
import { moatCopy as copy } from './moat-copy.js';
import { markerProgress, stampLevels, visibleMarkers } from './moat-model.js';
import type { MoatModel, MoatWindow } from './moat-model.js';
import './moat.css';

/** Scene units, not pixels: the SVG scales as a whole and the stamps are placed by percentage. */
export type MoatGeometry = Readonly<{
  width: number; height: number; chat_y: number; gate_y: number; stream_y: number;
  chat_h: number; gate_top: number; gate_h: number; stream_top: number; dot: number; stamp_w: number; stamp_step: number; gutter: number; levels: number;
}>;
export const fullGeometry: MoatGeometry = { width: 1200, height: 356, chat_y: 29, gate_y: 226, stream_y: 312,
  chat_h: 40, gate_top: 236, gate_h: 18, stream_top: 282, dot: 5, stamp_w: 204, stamp_step: 58, gutter: 24, levels: 3 };
/** Two of these stack in the comparison, so it trades a level of stamps for height. */
export const compareGeometry: MoatGeometry = { width: 1200, height: 274, chat_y: 25, gate_y: 168, stream_y: 236,
  chat_h: 34, gate_top: 176, gate_h: 14, stream_top: 206, dot: 4.5, stamp_w: 204, stamp_step: 58, gutter: 24, levels: 2 };
/** The Keep heartbeat: the same drawing at the size of a status bar, with no stamps or labels. */
export const compactGeometry: MoatGeometry = { width: 360, height: 72, chat_y: 8, gate_y: 31, stream_y: 62,
  chat_h: 16, gate_top: 36, gate_h: 6, stream_top: 52, dot: 3.2, stamp_w: 0, stamp_step: 0, gutter: 4, levels: 0 };
const stampLift = 16;
const pct = (value: number, of: number) => `${value / of * 100}%`;

/** A stamp near either edge slides inward; its pin, the dot below it, stays where the message was. */
const stampX = (x: number, g: MoatGeometry) => Math.min(Math.max(x, g.stamp_w / 2), g.width - g.stamp_w / 2);
const yOf = (lift: number, g: MoatGeometry) => lift <= 0.5 ? g.chat_y + (g.gate_y - g.chat_y) * (lift / 0.5)
  : g.gate_y + (g.stream_y - g.gate_y) * ((lift - 0.5) / 0.5);

/** Where a time falls on the strip, in scene units. */
const xFor = (offset_ms: number, window: MoatWindow, g: MoatGeometry) =>
  g.gutter + Math.min(Math.max((offset_ms - window.from_ms) / Math.max(window.to_ms - window.from_ms, 1), 0), 1) * (g.width - g.gutter * 2);

/** What the strip draws for one window: the dots, which stops get a stamp, and at what level. One answer for the scene and its overflow note. */
/** A gap wide enough to carry its words: they hang from its far edge, and this much of the strip is theirs. */
const gapWordsMin = 150; const gapWordsWidth = 200;
function gapZones(model: MoatModel, window: MoatWindow, g: MoatGeometry) {
  return model.gaps.filter(gap => gap.to_ms >= window.from_ms && gap.from_ms <= window.to_ms).flatMap(gap => {
    const left = xFor(gap.from_ms, window, g); const right = Math.max(xFor(gap.to_ms, window, g), left + 6);
    return right - left > gapWordsMin ? [{ left: right - 10 - gapWordsWidth, right }] : [];
  });
}
/** A stamp whose tag would cover a gap's words slides clear of them, keeping the time order; its pin stays put. */
function clearOfWords(x: number, zones: readonly { left: number; right: number }[], g: MoatGeometry) {
  const half = g.stamp_w / 2;
  for (const zone of zones) if (x + half > zone.left && x - half < zone.right) x = x < (zone.left + zone.right) / 2 ? zone.left - half : zone.right + half;
  return stampX(x, g);
}

function planStamps(model: MoatModel, window: MoatWindow, g: MoatGeometry, compact: boolean, spotlight?: string, selected?: number) {
  const drawable = visibleMarkers(model, window, undefined, selected);
  const stops = drawable.markers.filter(marker => marker.fate === 'held' && (spotlight === undefined || marker.rule_id === spotlight || marker.index === selected));
  const zones = compact ? [] : gapZones(model, window, g);
  const xs = stops.map(marker => clearOfWords(stampX(xFor(marker.offset_ms, window, g), g), zones, g));
  const stacked = compact ? { levels: [], overflow: 0 } : stampLevels(xs, g.stamp_w, g.levels);
  return { drawable, stops, x_of: new Map(stops.map((marker, position) => [marker.index, xs[position] ?? 0])),
    level_of: new Map(stops.map((marker, position) => [marker.index, stacked.levels[position] ?? -1])), overflow: stacked.overflow };
}

export type MoatSceneProps = {
  model: MoatModel; playhead_ms: number; window: MoatWindow; selected?: number | undefined;
  on_select?: ((index: number) => void) | undefined; delay_s?: number | undefined; compact?: boolean;
  /** Overrides the size, for the stacked comparison. */
  geometry?: MoatGeometry;
  /** Text for the chat bank, in place of the default caption. */
  caption?: string;
  /** Show the clock axis along the stream bank. */
  axis?: boolean;
  /** Message ids to ring: outcomes a candidate changes. */
  changed?: ReadonlySet<string> | undefined;
  /** One rule to look at: only its stamps are drawn, and the other stops dim. The picked message always keeps its stamp. */
  spotlight?: string | undefined;
  /** Unique per scene on the page: SVG patterns are referenced by id. */
  uid: string;
};

function Waves({ id }: { id: string }) {
  return <pattern id={`${id}-waves`} width="28" height="14" patternUnits="userSpaceOnUse">
    <path className="moat-wave" d="M0 8q7-7 14 0t14 0" /></pattern>;
}

export function MoatScene({ model, playhead_ms, window, selected, on_select, delay_s, compact = false, uid, geometry, caption, axis = !compact, changed, spotlight }: MoatSceneProps) {
  const g = geometry ?? (compact ? compactGeometry : fullGeometry);
  const id = `moat-${uid}`;
  const range = Math.max(window.to_ms - window.from_ms, 1);
  const xOf = (offset_ms: number) => xFor(offset_ms, window, g);
  const { drawable, stops, level_of, x_of } = planStamps(model, window, g, compact, spotlight, selected);
  const gaps = model.gaps.filter(gap => gap.to_ms >= window.from_ms && gap.from_ms <= window.to_ms);
  const ticks = !axis ? [] : [0, 0.2, 0.4, 0.6, 0.8, 1].map(share => window.from_ms + range * share);
  return <div className="moat-scene" data-compact={compact} data-paged={window.paged} style={{ aspectRatio: `${g.width} / ${g.height}` }}>
    <svg viewBox={`0 0 ${g.width} ${g.height}`} aria-hidden="true" focusable="false">
      <defs><Waves id={id} />
        <pattern id={`${id}-hatch`} width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line className="moat-hatch-line" x1="0" y1="0" x2="0" y2="12" /></pattern></defs>
      <rect className="moat-bank" x="0" y="0" width={g.width} height={g.chat_h} />
      <rect className="moat-water" x="0" y={g.chat_h} width={g.width} height={g.stream_top - g.chat_h} />
      <rect className="moat-water-waves" x="0" y={g.chat_h} width={g.width} height={g.stream_top - g.chat_h} fill={`url(#${id}-waves)`} />
      <rect className="moat-bank" x="0" y={g.stream_top} width={g.width} height={g.height - g.stream_top} />
      {gaps.map((gap, position) => {
        const left = xOf(gap.from_ms); const right = Math.max(xOf(gap.to_ms), left + 6);
        return <g key={`${position}-${gap.from}`} className="moat-gap" data-gap={gap.from}>
          <title>{`${copy.gap}: ${clockText(Date.parse(gap.from))} to ${clockText(Date.parse(gap.to))}, ${copy.gap_note}`}</title>
          <rect className="moat-gap-base" x={left} y={g.chat_h} width={right - left} height={g.stream_top - g.chat_h} />
          <rect className="moat-gap-hatch" x={left} y={g.chat_h} width={right - left} height={g.stream_top - g.chat_h} fill={`url(#${id}-hatch)`} />
        </g>;
      })}
      <rect className="moat-gate" x="0" y={g.gate_top} width={g.width} height={g.gate_h} />
      {ticks.map(tick => <line key={tick} className="moat-tick" x1={xOf(tick)} x2={xOf(tick)} y1={g.height - 32} y2={g.height - 25} />)}
      {drawable.markers.map(marker => {
        const { phase, lift } = markerProgress(marker, playhead_ms, model.cross_ms);
        const x = xOf(marker.offset_ms); const y = yOf(lift, g);
        const picked = selected === marker.index;
        const dim = spotlight !== undefined && marker.fate === 'held' && marker.rule_id !== spotlight;
        return <g key={marker.index} className="moat-marker" data-phase={phase} data-fate={marker.fate} data-verdict={marker.verdict}
          data-selected={picked} data-dim={dim || undefined} {...(on_select ? { onClick: () => on_select(marker.index) } : {})}>
          {phase !== 'waiting' && <line className="moat-track" x1={x} x2={x} y1={g.chat_y} y2={y} />}
          {picked && <circle className="moat-ring" cx={x} cy={y} r={g.dot * 2.4} />}
          {!compact && phase === 'stopped' && <circle className="moat-thud" cx={x} cy={y} r={g.dot} />}
          {phase !== 'waiting' && changed?.has(marker.message_id) && <circle className="moat-changed" cx={x} cy={y} r={g.dot * 1.9} />}
          {marker.fate === 'unresolved' && phase === 'unresolved'
            ? <rect className="moat-dot" x={x - g.dot} y={y - g.dot} width={g.dot * 2} height={g.dot * 2} transform={`rotate(45 ${x} ${y})`} />
            : <circle className="moat-dot" cx={x} cy={y} r={g.dot} />}
          {on_select && <circle className="moat-hit" cx={x} cy={y} r={g.dot * 2} />}
          <title>{copy.dot_name(marker)}</title>
        </g>;
      })}
      <line className="moat-playhead" x1={xOf(playhead_ms)} x2={xOf(playhead_ms)} y1="0" y2={g.height} />
    </svg>
    {/* Words are HTML laid over the drawing, so they keep a legible size however far the strip scales down. */}
    {!compact && <div className="moat-words" aria-hidden="true">
      <span className="moat-label" style={{ left: pct(12, g.width), top: pct(g.chat_h / 2, g.height) }}>{caption ?? copy.chat}</span>
      <span className="moat-label" data-bank="stream" style={{ left: pct(12, g.width), top: pct(g.stream_top + 3, g.height) }}>{copy.stream}</span>
      <span className="moat-gate-label" style={{ right: pct(12, g.width), top: pct(g.gate_top + g.gate_h / 2, g.height) }}>
        {delay_s === undefined ? copy.gate : copy.gate_delay(delay_s)}</span>
      {gaps.map((gap, position) => {
        const left = xOf(gap.from_ms); const right = Math.max(xOf(gap.to_ms), left + 6);
        // Stamps gather where stops are, usually before the gap; the label hangs from the far edge.
        return right - left > gapWordsMin && <span key={`${position}-${gap.from}`} className="moat-gap-words" style={{ right: pct(g.width - right + 10, g.width), top: pct(g.chat_h + 8, g.height) }}>
          <b className="moat-gap-label">{copy.gap}</b><i className="moat-gap-note">{copy.gap_note}</i></span>;
      })}
      {ticks.map((tick, position) => <span key={tick} className="moat-tick-label" data-edge={position === 0 ? 'start' : position === ticks.length - 1 ? 'end' : undefined}
        style={{ left: pct(xOf(tick), g.width) }}>{clockText(model.start_ms + tick)}</span>)}
    </div>}
    {!compact && stops.map(marker => {
      const level = level_of.get(marker.index) ?? -1;
      if (level < 0 || markerProgress(marker, playhead_ms, model.cross_ms).phase !== 'stopped') return null;
      const left = (x_of.get(marker.index) ?? stampX(xOf(marker.offset_ms), g)) / g.width * 100;
      const top = (g.gate_y - stampLift - level * g.stamp_step) / g.height * 100;
      const place = { left: `${left}%`, top: `${top}%` };
      const chip = <>
        <Stamp kind={marker.verdict === 'bar' ? 'blocked' : 'held'} word={copy.stamp} />
        <span className="moat-stamp-rule">{copy.rule_line(marker.rule_id)}</span></>;
      // Without a handler (the printed report) a stamp is a plain mark, not a button.
      return on_select ? <button key={marker.index} type="button" className="moat-stamp" data-selected={selected === marker.index} data-level={level}
        aria-pressed={selected === marker.index} aria-label={copy.stamp_name(marker)} data-changed={changed?.has(marker.message_id) || undefined} style={place} onClick={() => on_select(marker.index)}>{chip}</button>
        : <span key={marker.index} className="moat-stamp" data-level={level} style={place}>{chip}</span>;
    })}
  </div>;
}

export type MoatSceneNotes = { thinned: number; overflow: number };
/** What the strip could not draw, so the panel can say so instead of hiding it. */
export function sceneNotes(model: MoatModel, window: MoatWindow, spotlight?: string, selected?: number): MoatSceneNotes {
  const plan = planStamps(model, window, fullGeometry, false, spotlight, selected);
  return { thinned: plan.drawable.thinned, overflow: plan.overflow };
}
