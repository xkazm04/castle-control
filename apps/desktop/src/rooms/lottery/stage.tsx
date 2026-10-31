import { useEffect, useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import { InkButton, StatusChip } from '@castle-control/ui';
import type { DrawContent } from '@castle-control/contract';
import type { DrawArtworkLayer, DrawScene, DrawShape } from '@castle-control/renderer';
import { lotsCopy as copy } from '../../lots-copy.js';
import { revealStyle } from './display.js';
import type { RevealClock } from './playback.js';
import { useReducedMotion, useReveal } from './playback.js';
import { artworkOf, draw_shapes, layoutMarks, sampleEntries, stage_view_box, stageScene } from './stage-model.js';
import type { StageCast, StageEntry, StageMark } from './stage-model.js';
import './stage.css';

const rail_limit = 12;
const shapeLabel = (shape: DrawShape) => copy.shapes.find(item => item.value === shape)?.label ?? shape;

function Artwork({ layer }: { layer: DrawArtworkLayer | undefined }) {
  return <>{layer?.paths.map((path, index) => <path key={index} d={path.d} data-ink={path.ink} />)}</>;
}

export function ShapePicker({ shape, on_shape, disabled = false }: { shape: DrawShape; on_shape: (shape: DrawShape) => void; disabled?: boolean }) {
  const thumbs = useMemo(() => draw_shapes.map(item => ({ item, art: artworkOf(stageScene(item, undefined, 'question', true)) })), []);
  return <div className="lottery-shape-picker" role="group" aria-label={copy.stage.shape}>
    {thumbs.map(({ item, art }) => <button key={item} type="button" aria-pressed={item === shape} disabled={disabled}
      data-shape-option={item} onClick={() => on_shape(item)}>
      <svg viewBox={stage_view_box} aria-hidden="true"><Artwork layer={art} /></svg>
      <span>{shapeLabel(item)}</span>
    </button>)}
  </div>;
}

const markStyle = (index: number): CSSProperties & { '--lot-i': number } => ({ '--lot-i': index % 24 });

function Marks({ marks, order }: { marks: readonly StageMark[]; order: (handle: string) => number | undefined }) {
  return <>{marks.map((mark, index) => <circle key={mark.handle} data-lot-dot={index + 1} data-cohort={mark.cohort}
    data-winner={order(mark.handle)} cx={mark.x} cy={mark.y} r={mark.r}
    style={markStyle(index)}><title>{mark.cohort ? `${mark.handle} · ${copy.cohorts[mark.cohort]}` : mark.handle}</title></circle>)}</>;
}

/** Plays the renderer's motion on the artwork group exactly as the OBS painter does. */
function useFlourish(scene: DrawScene, fresh: boolean) {
  const group = useRef<SVGGElement>(null);
  useEffect(() => {
    const node = group.current;
    if (!fresh || !node?.animate) return undefined;
    const transform = (property: DrawScene['motions'][number]['property'], n: number) => property === 'rotate_deg'
      ? `rotate(${n}deg)` : property === 'scale_x' ? `scaleX(${n})` : `translateY(${n}%)`;
    const animations = scene.motions.map(motion => node.animate(
      [{ transform: transform(motion.property, motion.from) }, { transform: transform(motion.property, motion.to) }],
      { duration: motion.duration_ms, delay: motion.at_ms, easing: motion.easing },
    ));
    return () => { for (const animation of animations) animation.cancel(); };
  }, [scene, fresh]);
  return group;
}

export function DrawStage({ shape, on_shape, entries, cast, content, sealed, seal, clock, reveal_ms, verified = true }: {
  shape: DrawShape; on_shape: (shape: DrawShape) => void; entries: readonly StageEntry[]; cast: StageCast | undefined;
  content: DrawContent; sealed: boolean; seal?: string | undefined; clock: RevealClock; reveal_ms: number; verified?: boolean;
}) {
  const reduced = useReducedMotion();
  const playable = cast && verified ? cast : undefined;
  const scene = useMemo(() => stageScene(shape, playable, content, reduced), [shape, playable, content, reduced]);
  const take = clock.getSnapshot().take;
  const key = playable ? `${seal ?? 'cast'}:${shape}:${take}` : undefined;
  const state = useReveal(clock, playable ? scene : undefined, key);
  const winners = playable?.winners ?? [];
  const drawn = useMemo(() => sampleEntries(entries, winners), [entries, winners]);
  const marks = useMemo(() => layoutMarks(shape, drawn), [shape, drawn]);
  const by_handle = useMemo(() => new Map(marks.map(mark => [mark.handle, mark])), [marks]);
  const cohorts = useMemo(() => new Map(entries.map(entry => [entry.handle, entry.cohort])), [entries]);
  const revealed = state.revealed;
  const order = (handle: string) => { const index = revealed.indexOf(handle); return index < 0 ? undefined : index + 1; };
  const fresh = Boolean(playable) && revealed.length === 0 && !reduced;
  const group = useFlourish(scene, fresh);
  const phase = !sealed && !playable ? 'open' : !cast ? 'sealed' : !verified ? 'casting'
    : state.finished && revealed.length === winners.length ? 'revealed' : 'revealing';
  const disclaimer = scene.layers.find(layer => layer.kind === 'disclaimer');
  const latest = revealed.at(-1);
  const lots = <Marks marks={marks} order={order} />;
  return <div className="lottery-draw-stage" data-shape={shape} data-phase={phase} style={revealStyle(reveal_ms)}>
    <div className="lottery-draw-head">
      <ShapePicker shape={shape} on_shape={on_shape} />
      {playable && <StatusChip variant="gules" stamp="label" tone={phase === 'revealed' ? 'spot' : 'neutral'}>
        {copy.stage.labels[playable.label]}</StatusChip>}
    </div>
    <div className="lottery-draw-theatre">
      <svg className="lottery-draw-svg" viewBox={stage_view_box} role="img" aria-label={copy.stage.label(shapeLabel(shape), entries.length)}>
        <g className="lottery-draw-motion" ref={group}>
          <Artwork layer={artworkOf(scene)} />
          {shape === 'wheel' && <g className="lottery-draw-lots">{lots}</g>}
        </g>
        {shape !== 'wheel' && <g className="lottery-draw-lots">{lots}</g>}
        {revealed.map((handle, index) => {
          const mark = by_handle.get(handle);
          return mark ? <g key={handle} className="lottery-stage-medal" data-medal={index + 1} transform={`translate(${mark.x} ${mark.y})`}>
            <g className="lottery-stage-medal-body"><circle className="lottery-stage-pulse" r={9} /><circle r={6.5} />
              <text fontSize={7.5}>{index + 1}</text></g>
          </g> : null;
        })}
      </svg>
      {sealed && !playable && seal && <div className="lottery-stage-wax" aria-hidden="true">
        <b>{copy.stage.wax[0]}</b><span>{copy.stage.wax[1]}</span></div>}
    </div>
    <p className="lottery-stage-phase">{copy.stage[phase]}{seal ? ` · ${copy.stage.seal(seal)}` : ''}</p>
    {revealed.length > 0 && <ol className="lottery-stage-rail" aria-label={copy.stage.rail}>
      {revealed.slice(0, rail_limit).map((handle, index) => {
        const cohort = cohorts.get(handle);
        return <li key={handle} data-stage-winner={index + 1}><b>{index + 1}</b><span>{handle}</span>
          {cohort && <small>{copy.cohorts[cohort]}</small>}</li>;
      })}
      {revealed.length > rail_limit && <li className="lottery-stage-more">{copy.stage.more(revealed.length - rail_limit)}</li>}
    </ol>}
    <p className="cc-status" role="status">{latest ? copy.stage.announce(revealed.length, winners.length, latest) : ''}</p>
    {disclaimer?.kind === 'disclaimer' && <p className="lottery-stage-disclaimer">{disclaimer.text}</p>}
    <div className="lottery-stage-foot">
      <p className="cc-aside">{cast && !verified ? copy.stage.unverified : copy.stage.note}
        {drawn.length < entries.length ? ` ${copy.stage.sampled(drawn.length, entries.length)}` : ''} {copy.stage.weight_hint}</p>
      {playable && <InkButton size="room" disabled={!state.finished} onClick={() => clock.replay()}>{copy.stage.replay}</InkButton>}
    </div>
  </div>;
}
