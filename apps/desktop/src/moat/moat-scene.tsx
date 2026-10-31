import { StatusChip } from '@castle-control/ui';
import { clockText } from './clock.js';
import { moatCopy as copy } from './moat-copy.js';
import { markerProgress, stampLevels, visibleMarkers } from './moat-model.js';
import type { MoatModel, MoatWindow } from './moat-model.js';
import './moat.css';

/** Scene units, not pixels: the SVG scales as a whole and the stamps are placed by percentage. */
export type MoatGeometry = Readonly<{
  width: number; height: number; chat_y: number; gate_y: number; stream_y: number;
  chat_h: number; gate_top: number; gate_h: number; stream_top: number; dot: number; stamp_w: number; stamp_step: number; gutter: number;
}>;
export const fullGeometry: MoatGeometry = { width: 1200, height: 340, chat_y: 22, gate_y: 226, stream_y: 312,
  chat_h: 40, gate_top: 236, gate_h: 18, stream_top: 282, dot: 5, stamp_w: 184, stamp_step: 58, gutter: 24 };
/** The Keep heartbeat: the same drawing at the size of a status bar, with no stamps or labels. */
export const compactGeometry: MoatGeometry = { width: 360, height: 44, chat_y: 5, gate_y: 19, stream_y: 38,
  chat_h: 10, gate_top: 22, gate_h: 4, stream_top: 32, dot: 2.2, stamp_w: 0, stamp_step: 0, gutter: 4 };
const maxLevels = 3;
const stampLift = 16;

/** A stamp near either edge slides inward; its pin, the dot below it, stays where the message was. */
const stampX = (x: number, g: MoatGeometry) => Math.min(Math.max(x, g.stamp_w / 2), g.width - g.stamp_w / 2);
const yOf = (lift: number, g: MoatGeometry) => lift <= 0.5 ? g.chat_y + (g.gate_y - g.chat_y) * (lift / 0.5)
  : g.gate_y + (g.stream_y - g.gate_y) * ((lift - 0.5) / 0.5);

export type MoatSceneProps = {
  model: MoatModel; playhead_ms: number; window: MoatWindow; selected?: number | undefined;
  on_select?: ((index: number) => void) | undefined; delay_s?: number | undefined; compact?: boolean;
  /** Unique per scene on the page: SVG patterns are referenced by id. */
  uid: string;
};

function Waves({ id }: { id: string }) {
  return <pattern id={`${id}-waves`} width="28" height="14" patternUnits="userSpaceOnUse">
    <path className="moat-wave" d="M0 8q7-7 14 0t14 0" /></pattern>;
}

export function MoatScene({ model, playhead_ms, window, selected, on_select, delay_s, compact = false, uid }: MoatSceneProps) {
  const g = compact ? compactGeometry : fullGeometry;
  const id = `moat-${uid}`;
  const inner = g.width - g.gutter * 2;
  const range = Math.max(window.to_ms - window.from_ms, 1);
  const xOf = (offset_ms: number) => g.gutter + Math.min(Math.max((offset_ms - window.from_ms) / range, 0), 1) * inner;
  const drawable = visibleMarkers(model, window);
  const stops = drawable.markers.filter(marker => marker.fate === 'held');
  const stacked = compact ? { levels: [], overflow: 0 } : stampLevels(stops.map(marker => stampX(xOf(marker.offset_ms), g)), g.stamp_w, maxLevels);
  const level_of = new Map(stops.map((marker, position) => [marker.index, stacked.levels[position] ?? -1]));
  const gaps = model.gaps.filter(gap => gap.to_ms >= window.from_ms && gap.from_ms <= window.to_ms);
  const ticks = compact ? [] : [0, 0.2, 0.4, 0.6, 0.8, 1].map(share => window.from_ms + range * share);
  return <div className="moat-scene" data-compact={compact} data-paged={window.paged}>
    <svg viewBox={`0 0 ${g.width} ${g.height}`} aria-hidden="true" focusable="false">
      <defs><Waves id={id} />
        <pattern id={`${id}-hatch`} width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line className="moat-hatch-line" x1="0" y1="0" x2="0" y2="12" /></pattern></defs>
      <rect className="moat-bank" x="0" y="0" width={g.width} height={g.chat_h} />
      <rect className="moat-water" x="0" y={g.chat_h} width={g.width} height={g.stream_top - g.chat_h} />
      <rect className="moat-water-waves" x="0" y={g.chat_h} width={g.width} height={g.stream_top - g.chat_h} fill={`url(#${id}-waves)`} />
      <rect className="moat-bank" x="0" y={g.stream_top} width={g.width} height={g.height - g.stream_top} />
      {!compact && <><text className="moat-label" fontSize="12" x="12" y="15">{copy.chat}</text>
        <text className="moat-label" fontSize="12" x="12" y={g.stream_top + 16}>{copy.stream}</text></>}
      {gaps.map(gap => {
        const left = xOf(gap.from_ms); const right = Math.max(xOf(gap.to_ms), left + 6);
        return <g key={gap.from} className="moat-gap" data-gap={gap.from}>
          <title>{`${copy.gap}: ${clockText(Date.parse(gap.from))} to ${clockText(Date.parse(gap.to))}, ${copy.gap_note}`}</title>
          <rect className="moat-gap-base" x={left} y={g.chat_h} width={right - left} height={g.stream_top - g.chat_h} />
          <rect className="moat-gap-hatch" x={left} y={g.chat_h} width={right - left} height={g.stream_top - g.chat_h} fill={`url(#${id}-hatch)`} />
          {!compact && right - left > 96 && <><text className="moat-gap-label" fontSize="13" x={(left + right) / 2} y={g.chat_h + 34} textAnchor="middle">{copy.gap}</text>
            <text className="moat-gap-note" fontSize="12" x={(left + right) / 2} y={g.chat_h + 52} textAnchor="middle">{copy.gap_note}</text></>}
        </g>;
      })}
      <rect className="moat-gate" x="0" y={g.gate_top} width={g.width} height={g.gate_h} />
      {ticks.map((tick, position) => <g key={tick} className="moat-tick"><line x1={xOf(tick)} x2={xOf(tick)} y1={g.height - 22} y2={g.height - 16} />
        <text fontSize="12" x={xOf(tick)} y={g.height - 6} textAnchor={position === 0 ? 'start' : position === ticks.length - 1 ? 'end' : 'middle'}>{clockText(model.start_ms + tick)}</text></g>)}
      {drawable.markers.map(marker => {
        const { phase, lift } = markerProgress(marker, playhead_ms, model.cross_ms);
        const x = xOf(marker.offset_ms); const y = yOf(lift, g);
        const picked = selected === marker.index;
        return <g key={marker.index} className="moat-marker" data-phase={phase} data-fate={marker.fate} data-verdict={marker.verdict}
          data-selected={picked} {...(on_select ? { onClick: () => on_select(marker.index) } : {})}>
          {phase !== 'waiting' && <line className="moat-track" x1={x} x2={x} y1={g.chat_y} y2={y} />}
          {picked && <circle className="moat-ring" cx={x} cy={y} r={g.dot * 2.4} />}
          {marker.fate === 'unresolved' && phase === 'unresolved'
            ? <rect className="moat-dot" x={x - g.dot} y={y - g.dot} width={g.dot * 2} height={g.dot * 2} transform={`rotate(45 ${x} ${y})`} />
            : <circle className="moat-dot" cx={x} cy={y} r={g.dot} />}
          <title>{copy.dot_name(marker)}</title>
        </g>;
      })}
      <line className="moat-playhead" x1={xOf(playhead_ms)} x2={xOf(playhead_ms)} y1="0" y2={g.height} />
      {!compact && <text className="moat-gate-label" fontSize="12" x={g.width - 12} y={g.gate_top + g.gate_h - 5} textAnchor="end">
        {delay_s === undefined ? copy.gate : copy.gate_delay(delay_s)}</text>}
    </svg>
    {!compact && stops.map(marker => {
      const level = level_of.get(marker.index) ?? -1;
      if (level < 0 || markerProgress(marker, playhead_ms, model.cross_ms).phase !== 'stopped') return null;
      const left = stampX(xOf(marker.offset_ms), g) / g.width * 100;
      const top = (g.gate_y - stampLift - level * g.stamp_step) / g.height * 100;
      const place = { left: `${left}%`, top: `${top}%` };
      const chip = <>
        <StatusChip variant={marker.verdict === 'bar' ? 'gules' : 'or'} stamp="verdict" tone={marker.verdict === 'bar' ? 'blocked' : 'warn'}>{copy.stamp}</StatusChip>
        <span className="moat-stamp-rule">{copy.rule_line(marker.rule_id)}</span></>;
      // Without a handler (the printed report) a stamp is a plain mark, not a button.
      return on_select ? <button key={marker.index} type="button" className="moat-stamp" data-selected={selected === marker.index} data-level={level}
        aria-pressed={selected === marker.index} aria-label={copy.stamp_name(marker)} style={place} onClick={() => on_select(marker.index)}>{chip}</button>
        : <span key={marker.index} className="moat-stamp" data-level={level} style={place}>{chip}</span>;
    })}
  </div>;
}

export type MoatSceneNotes = { thinned: number; overflow: number };
/** What the strip could not draw, so the panel can say so instead of hiding it. */
export function sceneNotes(model: MoatModel, window: MoatWindow): MoatSceneNotes {
  const drawable = visibleMarkers(model, window);
  const range = Math.max(window.to_ms - window.from_ms, 1);
  const xs = drawable.markers.filter(marker => marker.fate === 'held')
    .map(marker => stampX(fullGeometry.gutter + (marker.offset_ms - window.from_ms) / range * (fullGeometry.width - fullGeometry.gutter * 2), fullGeometry));
  return { thinned: drawable.thinned, overflow: stampLevels(xs, fullGeometry.stamp_w, maxLevels).overflow };
}
