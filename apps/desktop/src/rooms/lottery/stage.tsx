import { RoomKeyBadge } from '../../shell/steward-keys.jsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { InkButton, Stamp, StatusChip } from '@castle-control/ui';
import type { DrawContent } from '@castle-control/contract';
import type { DrawArtworkLayer, DrawScene, DrawShape } from '@castle-control/renderer';
import { lotsCopy as copy } from '../../lots-copy.js';
import { revealStyle } from './display.js';
import type { RevealClock } from './playback.js';
import { useReducedMotion, useReveal } from './playback.js';
import { artworkOf, call_origin, chatLine, confetti, draw_shapes, layoutMarks, lift_path, sampleEntries, stage_view_box, stageScene, weightShare, wheel_pivot } from './stage-model.js';
import type { StageCast, StageEntry, StageMark } from './stage-model.js';
import { ceremonySound } from './sound.js';
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
    <RoomKeyBadge room="lottery" action="ceremony" />
    {thumbs.map(({ item, art }) => <button key={item} type="button" aria-pressed={item === shape} disabled={disabled}
      data-shape-option={item} onClick={() => on_shape(item)}>
      <svg viewBox={stage_view_box} aria-hidden="true"><Artwork layer={art} /></svg>
      <span>{shapeLabel(item)}</span>
    </button>)}
  </div>;
}

/** Position and radius as custom properties, so lots glide to a new shape and ease to a new weight. */
const wheel_spin: CSSProperties = { transformBox: 'view-box', transformOrigin: `${wheel_pivot.x}px ${wheel_pivot.y}px` };

const markStyle = (index: number, mark: StageMark): CSSProperties & { '--lot-i': number; '--lot-r': string; '--lot-x': string; '--lot-y': string } =>
  ({ '--lot-i': index % 24, '--lot-r': `${mark.r}px`, '--lot-x': `${mark.x}px`, '--lot-y': `${mark.y}px` });

function Marks({ marks, order, focus }: { marks: readonly StageMark[]; order: (handle: string) => number | undefined; focus: number | undefined }) {
  return <>{marks.map((mark, index) => <circle key={mark.handle} data-lot-dot={index + 1} data-cohort={mark.cohort}
    data-winner={order(mark.handle)} data-focus={focus === mark.weight || undefined} cx={mark.x} cy={mark.y} r={mark.r}
    style={markStyle(index, mark)}><title>{mark.cohort ? `${mark.handle} · ${copy.cohorts[mark.cohort]}` : mark.handle}</title></circle>)}</>;
}

/** Plays the renderer's motion on the artwork group exactly as the OBS painter does. The wheel's lots ride
 * its rim, so they get the same motion; they live in their own group so they can glide between shapes. */
function useFlourish(scene: DrawScene, fresh: boolean, rides: boolean) {
  const group = useRef<SVGGElement>(null);
  const lots = useRef<SVGGElement>(null);
  useEffect(() => {
    const nodes = [group.current, rides ? lots.current : null];
    if (!fresh) return undefined;
    const transform = (property: DrawScene['motions'][number]['property'], n: number) => property === 'rotate_deg'
      ? `rotate(${n}deg)` : property === 'scale_x' ? `scaleX(${n})` : `translateY(${n}%)`;
    const animations = nodes.flatMap(node => node?.animate ? scene.motions.map(motion => node.animate(
      [{ transform: transform(motion.property, motion.from) }, { transform: transform(motion.property, motion.to) }],
      { duration: motion.duration_ms, delay: motion.at_ms, easing: motion.easing },
    )) : []);
    return () => { for (const animation of animations) animation.cancel(); };
  }, [scene, fresh, rides]);
  return { group, lots };
}

/** Follows the reveal cursor: flourish texture on a fresh cast, a bell per winner, a fanfare at the close.
 * While sound is off the cursor is still tracked, so turning it on never replays a backlog. */
function useCeremonySound(on: boolean, shape: DrawShape, scene: DrawScene, key: string | undefined, fresh: boolean, count: number, done: boolean) {
  const heard = useRef<{ key: string | undefined; count: number; done: boolean }>({ key: undefined, count: 0, done: false });
  useEffect(() => {
    const last = heard.current;
    heard.current = { key, count, done };
    const sound = on && key !== undefined ? ceremonySound() : undefined;
    if (!sound) return;
    if (last.key !== key) { if (fresh && count === 0) sound.flourish(shape, scene.events[0]?.at_ms ?? 1200); return; }
    // One bell per newly revealed winner, staggered when several arrive at once (reduced motion).
    for (let order = last.count + 1; order <= Math.min(count, last.count + 12); order++) sound.chime(order, (order - last.count - 1) * 0.14);
    if (done && !last.done) sound.fanfare();
  }, [on, shape, scene, key, fresh, count, done]);
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
function Verdict({ total, proof, on_prove, line }: { total: number; proof: 'local' | 'core'; on_prove: (() => void) | undefined; line: string }) {
  const [title, detail] = copy.stage.proof[proof];
  const [copied, setCopied] = useState<'copied' | 'failed'>();
  const copyLine = () => {
    const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
    if (!clipboard) { setCopied('failed'); return; }
    clipboard.writeText(line).then(() => setCopied('copied'), () => setCopied('failed'));
  };
  return <div className="lottery-stage-verdict" data-proof={proof}>
    <svg className="lottery-stage-verdict-seal" viewBox="0 0 24 24" aria-hidden="true"><circle cx={12} cy={12} r={11} />
      <path d="M6.5 12.5l3.6 3.6L17.5 8.2" /></svg>
    <div><small>{copy.stage.complete(total)}</small><b>{title}</b><p>{detail}</p>
      <span className="lottery-stage-verdict-actions">
        {on_prove && <InkButton size="room" onClick={on_prove}><RoomKeyBadge room="lottery" action="prove" />{copy.stage.prove}</InkButton>}
        <InkButton size="room" title={line} onClick={copyLine}>{copy.stage.chat}</InkButton>
      </span>
      <small className="lottery-stage-copied" role="status">{copied ? copy.stage.chat_done[copied] : ''}</small></div>
  </div>;
}

export type CeremonyControlsProps = {
  shape: DrawShape; on_shape: (shape: DrawShape) => void;
  theatre?: boolean; on_theatre?: ((theatre: boolean) => void) | undefined;
  sound?: boolean; on_sound?: ((sound: boolean) => void) | undefined;
  by_hand?: boolean; on_by_hand?: ((by_hand: boolean) => void) | undefined;
  unverified?: boolean; sampled?: number; total?: number;
};

export function CeremonyControls({ shape, on_shape, theatre = false, on_theatre, sound = false,
  on_sound, by_hand = false, on_by_hand, unverified = false, sampled, total = 0 }: CeremonyControlsProps) {
  return <div className="lottery-stage-top">
      <ShapePicker shape={shape} on_shape={on_shape} />
      {(on_by_hand || on_sound) && <div className="lottery-stage-options" role="group" aria-label={copy.stage.options}>
        {on_by_hand && <InkButton size="room" className="lottery-stage-toggle" aria-pressed={by_hand} title={copy.stage.by_hand_hint}
          onClick={() => on_by_hand(!by_hand)}><RoomKeyBadge room="lottery" action="by_hand" />{copy.stage.by_hand}</InkButton>}
        {on_sound && <InkButton size="room" className="lottery-stage-toggle" aria-pressed={sound} title={copy.stage.sound_hint}
          onClick={() => { if (!sound) ceremonySound(); on_sound(!sound); }}><RoomKeyBadge room="lottery" action="sound" />{copy.stage.sound}</InkButton>}
      </div>}
      <details className="lottery-stage-notes">
        <summary aria-label={copy.stage.title} title={copy.stage.title}><span aria-hidden="true">i</span><RoomKeyBadge room="lottery" action="info" /></summary>
        <p className="cc-aside">{unverified ? copy.stage.unverified : copy.stage.note}
          {sampled !== undefined && sampled < total ? ` ${copy.stage.sampled(sampled, total)}` : ''}</p>
      </details>
      {on_theatre && <InkButton size="room" className="lottery-stage-expand" data-theatre-toggle aria-pressed={theatre}
        aria-label={theatre ? copy.stage.desk : copy.stage.theatre} title={theatre ? copy.stage.desk : copy.stage.theatre}
        onClick={() => on_theatre(!theatre)}><span aria-hidden="true">{theatre ? '\u21a9' : '\u26f6'}</span></InkButton>}
    </div>;
}

export function DrawStage({ shape, on_shape, entries, cast, content, sealed, seal, clock, reveal_ms, verified = true, theatre = false,
  on_theatre, proof = 'local', on_prove, sound = false, on_sound, by_hand = false, on_by_hand, focus_weight, live = false, idle_label, controls = true }: {
  shape: DrawShape; on_shape: (shape: DrawShape) => void; entries: readonly StageEntry[]; cast: StageCast | undefined;
  content: DrawContent; sealed: boolean; seal?: string | undefined; clock: RevealClock; reveal_ms: number; verified?: boolean;
  theatre?: boolean; on_theatre?: (theatre: boolean) => void; proof?: 'local' | 'core'; on_prove?: () => void;
  sound?: boolean; on_sound?: (sound: boolean) => void; by_hand?: boolean; on_by_hand?: (by_hand: boolean) => void;
  focus_weight?: number | undefined;
  /** Only an explicitly live core cast is announced without the simulated label. */
  live?: boolean;
  /** Replaces the open-roll caption when there is no draw at all (core mode before the first setup). */
  idle_label?: string | undefined;
  /** Room controls live in column one; theatre retains its own controls. */
  controls?: boolean;
}) {
  const reduced = useReducedMotion();
  const playable = cast && verified ? cast : undefined;
  // By hand needs one onset per winner, so it keeps the renderer's timed events even under reduced motion
  // (no motion plays either way: the flourish and CSS animations stay off).
  const timed = reduced && !by_hand;
  const scene = useMemo(() => stageScene(shape, playable, content, timed), [shape, playable, content, timed]);
  const take = clock.getSnapshot().take;
  const key = playable ? `${seal ?? 'cast'}:${shape}:${take}` : undefined;
  useEffect(() => { clock.pace(by_hand, performance.now()); }, [clock, by_hand]);
  const state = useReveal(clock, playable ? scene : undefined, key);
  const call = useRef<HTMLSpanElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const previous_theatre = useRef(theatre);
  useEffect(() => {
    if (previous_theatre.current === theatre) return undefined;
    previous_theatre.current = theatre;
    const frame = requestAnimationFrame(() => {
      const room = root.current?.closest('.lottery-room');
      const target = theatre ? root.current?.querySelector<HTMLButtonElement>('.lottery-stage-call button')
        ?? root.current?.querySelector<HTMLButtonElement>('[data-theatre-toggle]')
        : room?.querySelector<HTMLButtonElement>('.cc-chamber-column [data-theatre-toggle]');
      target?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [theatre]);
  // Held for the streamer's call: the call button takes focus, so Space calls each winner in turn.
  useEffect(() => { if (state.waiting) call.current?.querySelector('button')?.focus({ preventScroll: true }); }, [state.waiting, state.revealed.length]);
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
  const flourish = useFlourish(scene, fresh, shape === 'wheel');
  // A fresh ceremony takes the whole chamber; the streamer returns to the desk when ready.
  useEffect(() => {
    if (!fresh || !on_theatre) return undefined;
    on_theatre(true);
    // The cast button that started this sits in the desk, which theatre hides: keep keyboard users on the stage.
    const frame = requestAnimationFrame(() => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || active === document.body || active.offsetParent === null) {
        root.current?.querySelector<HTMLButtonElement>('[data-theatre-toggle]')?.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [fresh, key, on_theatre]);
  const phase = !sealed && !playable ? 'open' : !cast ? 'sealed' : !verified ? 'casting'
    : state.finished && revealed.length === winners.length ? 'revealed' : 'revealing';
  const phase_label = state.waiting ? copy.stage.held : phase === 'open' && idle_label ? idle_label : copy.stage[phase];
  const disclaimer = scene.layers.find(layer => layer.kind === 'disclaimer');
  useCeremonySound(sound, shape, scene, key, fresh, revealed.length, phase === 'revealed');
  // The last call removes its button; hand focus to the verdict's proof button instead of the page.
  useEffect(() => {
    if (phase === 'revealed' && by_hand && typeof document !== 'undefined' && document.activeElement === document.body) {
      root.current?.querySelector<HTMLButtonElement>('.lottery-stage-verdict button')?.focus({ preventScroll: true });
    }
  }, [phase, by_hand]);
  const latest = revealed.at(-1);
  const latest_mark = latest === undefined ? undefined : by_handle.get(latest);
  const limit = theatre ? rail_limit.theatre : rail_limit.desk;
  const lots = <Marks marks={marks} order={order} focus={focus_weight} />;
  return <div ref={root} className="lottery-draw-stage" data-shape={shape} data-focusing={focus_weight === undefined ? undefined : true} data-phase={phase} data-shuffling={fresh || undefined}
    style={revealStyle(reveal_ms)}>
    {controls && <CeremonyControls shape={shape} on_shape={on_shape} theatre={theatre} on_theatre={on_theatre}
      sound={sound} on_sound={on_sound} by_hand={by_hand} on_by_hand={on_by_hand}
      unverified={Boolean(cast) && !verified} sampled={drawn.length} total={entries.length} />}
    <div className="lottery-draw-theatre">
      <svg className="lottery-draw-svg" viewBox={stage_view_box} role="img" aria-label={copy.stage.label(shapeLabel(shape), entries.length)}>
        <g className="lottery-draw-motion" ref={flourish.group}>
          <Artwork layer={artworkOf(scene)} />
        </g>
        <g className="lottery-draw-lots" ref={flourish.lots} style={shape === 'wheel' ? wheel_spin : undefined}>{lots}</g>
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
              <path d="M-2 0l1.5 1.5L2-2" /></g>
          </g> : null;
        })}
      </svg>
      <p className="lottery-stage-phase" title={phase_label}><span className="lottery-stage-state">{phase_label}</span>{seal ? <small>{copy.stage.seal(seal)}</small> : null}</p>
      {sealed && !playable && seal && <div className="lottery-stage-wax" aria-hidden="true">
        <Stamp kind="sealed" word={copy.stage.wax.join(" ")} land /></div>}
      {(revealed.length > 0 || state.waiting) && <div className="lottery-stage-rail" role="region" aria-label={copy.stage.rail} tabIndex={0}>
        {phase === 'revealing' && latest && <Proclamation key={latest} handle={latest} order={revealed.length}
          total={winners.length} cohort={cohorts.get(latest)} share={share(latest)} />}
        {phase === 'revealed' && theatre && <Verdict total={winners.length} proof={proof} on_prove={on_prove}
          line={chatLine(winners, seal, live)} />}
        {state.waiting && <span ref={call} className="lottery-stage-call"><InkButton size="room" variant="primary" aria-keyshortcuts="Space"
          onClick={() => clock.callNext(performance.now())}><RoomKeyBadge room="lottery" action="reveal" />
          {revealed.length ? copy.stage.call_next(revealed.length + 1, winners.length) : copy.stage.call_first}</InkButton>
          <small aria-hidden="true">{copy.stage.call_key}</small></span>}
        {revealed.length > 0 && <ol aria-label={copy.stage.rail}>
          {revealed.slice(0, limit).map((handle, index) => {
            const cohort = cohorts.get(handle);
            return <li key={handle} data-stage-winner={index + 1} data-cohort={cohort}
              title={cohort ? copy.cohorts[cohort] : undefined}><b>{index + 1}</b><span>{handle}</span></li>;
          })}
          {revealed.length > limit && <li className="lottery-stage-more">{copy.stage.more(revealed.length - limit)}</li>}
        </ol>}
      </div>}
      {disclaimer?.kind === 'disclaimer' && <p className="lottery-stage-disclaimer">{disclaimer.text}</p>}
      {phase === 'revealed' && !reduced && <div key={state.key} className="lottery-stage-confetti" aria-hidden="true">
        {burst.map((piece, index) => <i key={index} style={burstStyle(piece)} />)}</div>}
    </div>
    {playable && <div className="lottery-stage-foot" title={copy.stage.labels[playable.label]}>
      <StatusChip variant="gules">{copy.stage.labels[playable.label]}</StatusChip>
      {phase === 'revealed' && !theatre && <Stamp kind="ok" word={copy.stage.proof[proof][0]} />}
      <InkButton size="room" className="lottery-stage-replay" disabled={!state.finished} aria-label={copy.stage.replay}
        title={copy.stage.replay} onClick={() => clock.replay()}><span aria-hidden="true">{'\u21bb'}</span></InkButton>
    </div>}
    <p className="lottery-stage-announce" role="status">{latest ? copy.stage.announce(revealed.length, winners.length, latest) : ''}</p>
  </div>;
}
