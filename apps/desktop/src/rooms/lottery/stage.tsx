import { useEffect, useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import { InkButton, StatusChip } from '@castle-control/ui';
import type { DrawContent } from '@castle-control/contract';
import type { DrawArtworkLayer, DrawScene, DrawShape } from '@castle-control/renderer';
import { lotsCopy as copy } from '../../lots-copy.js';
import { revealStyle } from './display.js';
import type { RevealClock } from './playback.js';
import { useReducedMotion, useReveal } from './playback.js';
import { artworkOf, call_origin, confetti, draw_shapes, layoutMarks, lift_path, sampleEntries, stage_view_box, stageScene, weightShare } from './stage-model.js';
import type { StageCast, StageEntry, StageMark } from './stage-model.js';
import './stage.css';

/** Scoreboard size: the theatre has room for eight placards, the desk view for four. */
const rail_limit = { theatre: 8, desk: 4 };
const burst = confetti();
type Burst = CSSProperties & { '--cx': string; '--cy': string; '--cr': string; '--cd': string };
const burstStyle = (piece: typeof burst[number]): Burst => ({
  '--cx': `${piece.x}%`, '--cy': `${piece.y}%`, '--cr': `${piece.turn}deg`, '--cd': `${piece.delay}ms` });
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

/** `--lot-r` lets the radius ease when weights change (the equalizer), instead of jumping. */
const markStyle = (index: number, r: number): CSSProperties & { '--lot-i': number; '--lot-r': string } =>
  ({ '--lot-i': index % 24, '--lot-r': `${r}px` });

function Marks({ marks, order }: { marks: readonly StageMark[]; order: (handle: string) => number | undefined }) {
  return <>{marks.map((mark, index) => <circle key={mark.handle} data-lot-dot={index + 1} data-cohort={mark.cohort}
    data-winner={order(mark.handle)} cx={mark.x} cy={mark.y} r={mark.r}
    style={markStyle(index, mark.r)}><title>{mark.cohort ? `${mark.handle} · ${copy.cohorts[mark.cohort]}` : mark.handle}</title></circle>)}</>;
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

function Proclamation({ handle, order, total, cohort, share }: {
  handle: string; order: number; total: number; cohort: StageEntry['cohort']; share: number | undefined;
}) {
  return <p className="lottery-stage-proclaim" aria-hidden="true">
    <small>{copy.stage.winner_of(order, total)}</small><b>{handle}</b>{cohort && <span>{copy.cohorts[cohort]}</span>}
    {share !== undefined && <em>{copy.stage.share(share)}</em>}
  </p>;
}

type Lift = CSSProperties & { '--lx1': string; '--ly1': string; '--lx2': string; '--ly2': string; '--lturn': string };
/** The called lot physically leaves its shape: out of the urn mouth, up to the wheel's pointer,
 * dealt off the deck, or up through the ballot slot. Rendered only for the latest reveal. */
function LiftToken({ shape, mark }: { shape: DrawShape; mark: StageMark }) {
  const path = lift_path[shape];
  const style: Lift = { '--lx1': `${path.via.x - mark.x}px`, '--ly1': `${path.via.y - mark.y}px`,
    '--lx2': `${path.out.x - mark.x}px`, '--ly2': `${path.out.y - mark.y}px`, '--lturn': `${path.turn}deg` };
  return <g transform={`translate(${mark.x} ${mark.y})`} aria-hidden="true">
    <g className="lottery-stage-lift" data-lift={shape} style={style}>
      {shape === 'deck' ? <rect x={-6} y={-8.5} width={12} height={17} rx={1.5} />
        : shape === 'ballot_box' ? <><rect x={-9} y={-6} width={18} height={12} rx={1} /><path d="M-4 0l2.5 2.5L4-3" /></>
          : <circle r={Math.max(4, mark.r * 1.8)} />}
    </g>
  </g>;
}

/** Closes the ceremony with the proof that let it play: a locally recomputed writ or a core-verified cast. */
function Verdict({ total, proof, on_prove }: { total: number; proof: 'local' | 'core'; on_prove: (() => void) | undefined }) {
  const [title, detail] = copy.stage.proof[proof];
  return <div className="lottery-stage-verdict" data-proof={proof}>
    <svg className="lottery-stage-verdict-seal" viewBox="0 0 24 24" aria-hidden="true"><circle cx={12} cy={12} r={11} />
      <path d="M6.5 12.5l3.6 3.6L17.5 8.2" /></svg>
    <div><small>{copy.stage.complete(total)}</small><b>{title}</b><p>{detail}</p>
      {on_prove && <InkButton size="room" onClick={on_prove}>{copy.stage.prove}</InkButton>}</div>
  </div>;
}

export function DrawStage({ shape, on_shape, entries, cast, content, sealed, seal, clock, reveal_ms, verified = true, theatre = false,
  on_theatre, proof = 'local', on_prove }: {
  shape: DrawShape; on_shape: (shape: DrawShape) => void; entries: readonly StageEntry[]; cast: StageCast | undefined;
  content: DrawContent; sealed: boolean; seal?: string | undefined; clock: RevealClock; reveal_ms: number; verified?: boolean;
  theatre?: boolean; on_theatre?: (theatre: boolean) => void; proof?: 'local' | 'core'; on_prove?: () => void;
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
  const weights = useMemo(() => new Map(entries.map(entry => [entry.handle, entry.weight])), [entries]);
  const pool_weight = useMemo(() => entries.reduce((sum, entry) => sum + entry.weight, 0), [entries]);
  const share = (handle: string) => { const weight = weights.get(handle); return weight === undefined ? undefined : weightShare(weight, pool_weight); };
  const revealed = state.revealed;
  const order = (handle: string) => { const index = revealed.indexOf(handle); return index < 0 ? undefined : index + 1; };
  const fresh = Boolean(playable) && revealed.length === 0 && !reduced;
  const group = useFlourish(scene, fresh);
  // A fresh ceremony takes the whole chamber; the streamer returns to the desk when ready.
  useEffect(() => { if (fresh && on_theatre) on_theatre(true); }, [fresh, key, on_theatre]);
  const phase = !sealed && !playable ? 'open' : !cast ? 'sealed' : !verified ? 'casting'
    : state.finished && revealed.length === winners.length ? 'revealed' : 'revealing';
  const disclaimer = scene.layers.find(layer => layer.kind === 'disclaimer');
  const latest = revealed.at(-1);
  const latest_mark = latest === undefined ? undefined : by_handle.get(latest);
  const limit = theatre ? rail_limit.theatre : rail_limit.desk;
  const lots = <Marks marks={marks} order={order} />;
  return <div className="lottery-draw-stage" data-shape={shape} data-phase={phase} data-shuffling={fresh || undefined}
    style={revealStyle(reveal_ms)}>
    <ShapePicker shape={shape} on_shape={on_shape} />
    <div className="lottery-draw-theatre">
      <svg className="lottery-draw-svg" viewBox={stage_view_box} role="img" aria-label={copy.stage.label(shapeLabel(shape), entries.length)}>
        <g className="lottery-draw-motion" ref={group}>
          <Artwork layer={artworkOf(scene)} />
          {shape === 'wheel' && <g className="lottery-draw-lots">{lots}</g>}
        </g>
        {shape !== 'wheel' && <g className="lottery-draw-lots">{lots}</g>}
        {revealed.map((handle, index) => {
          const mark = by_handle.get(handle);
          const origin = call_origin[shape];
          return mark ? <line key={`ray-${handle}`} className="lottery-stage-ray" data-latest={index === revealed.length - 1}
            x1={origin.x} y1={origin.y} x2={mark.x} y2={mark.y} pathLength={1} /> : null;
        })}
        {phase === 'revealing' && !reduced && latest_mark && <LiftToken key={`lift-${latest_mark.handle}`} shape={shape} mark={latest_mark} />}
        {revealed.map((handle, index) => {
          const mark = by_handle.get(handle);
          return mark ? <g key={handle} className="lottery-stage-medal" data-medal={index + 1} transform={`translate(${mark.x} ${mark.y})`}>
            <g className="lottery-stage-medal-body"><circle className="lottery-stage-pulse" r={9} /><circle r={6.5} />
              <text fontSize={7.5}>{index + 1}</text></g>
          </g> : null;
        })}
      </svg>
      <p className="lottery-stage-phase">{copy.stage[phase]}{seal ? <small>{copy.stage.seal(seal)}</small> : null}</p>
      {sealed && !playable && seal && <div className="lottery-stage-wax" aria-hidden="true">
        <b>{copy.stage.wax[0]}</b><span>{copy.stage.wax[1]}</span></div>}
      {revealed.length > 0 && <div className="lottery-stage-rail">
        {phase === 'revealing' && latest && <Proclamation key={latest} handle={latest} order={revealed.length}
          total={winners.length} cohort={cohorts.get(latest)} share={share(latest)} />}
        {phase === 'revealed' && theatre && <Verdict total={winners.length} proof={proof} on_prove={on_prove} />}
        <ol aria-label={copy.stage.rail}>
          {revealed.slice(0, limit).map((handle, index) => {
            const cohort = cohorts.get(handle);
            return <li key={handle} data-stage-winner={index + 1} data-cohort={cohort}
              title={cohort ? copy.cohorts[cohort] : undefined}><b>{index + 1}</b><span>{handle}</span></li>;
          })}
          {revealed.length > limit && <li className="lottery-stage-more">{copy.stage.more(revealed.length - limit)}</li>}
        </ol>
      </div>}
      {disclaimer?.kind === 'disclaimer' && <p className="lottery-stage-disclaimer">{disclaimer.text}</p>}
      {phase === 'revealed' && !reduced && <div key={state.key} className="lottery-stage-confetti" aria-hidden="true">
        {burst.map((piece, index) => <i key={index} style={burstStyle(piece)} />)}</div>}
    </div>
    <div className="lottery-stage-foot">
      {playable && <StatusChip variant="gules" stamp="label" tone={phase === 'revealed' ? 'spot' : 'neutral'}>
        {copy.stage.labels[playable.label]}</StatusChip>}
      {phase === 'revealed' && !theatre && <StatusChip variant="ok" stamp="verdict" tone="ok">{copy.stage.proof[proof][0]}</StatusChip>}
      <p className="cc-aside">{cast && !verified ? copy.stage.unverified : copy.stage.note}
        {drawn.length < entries.length ? ` ${copy.stage.sampled(drawn.length, entries.length)}` : ''}</p>
      {playable && <InkButton size="room" disabled={!state.finished} onClick={() => clock.replay()}>{copy.stage.replay}</InkButton>}
      {on_theatre && <InkButton size="room" aria-pressed={theatre} onClick={() => on_theatre(!theatre)}>
        {theatre ? copy.stage.desk : copy.stage.theatre}</InkButton>}
      <p className="lottery-stage-announce" role="status">{latest ? copy.stage.announce(revealed.length, winners.length, latest) : ''}</p>
    </div>
  </div>;
}
