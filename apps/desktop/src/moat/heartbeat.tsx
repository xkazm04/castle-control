import { useEffect, useId, useMemo, useState } from 'react';
import type { MoatClock } from './moat-player.js';
import { moatCopy as copy } from './moat-copy.js';
import { buildMoat, windowFor } from './moat-model.js';
import type { MoatSource } from './moat-model.js';
import { MoatScene, compactGeometry } from './moat-scene.jsx';
import { InkButton } from '@castle-control/ui';
import { useMoatPlayer } from './use-moat-player.js';

/** The same model as the drill, small, looping. It is a labelled sample, never a live reading. */
export function MoatHeartbeat({ source, delay_s, clock }: { source: MoatSource; delay_s?: number | undefined; clock?: MoatClock | undefined }) {
  const uid = useId();
  const model = useMemo(() => buildMoat(source, delay_s && delay_s > 0 ? delay_s * 1000 : undefined), [source, delay_s]);
  const { player, state, reduced } = useMoatPlayer(model.run_ms, { ...(clock ? { clock } : {}), start: 'start', rest_ms: 2400, speed: 8, min_frame_ms: 66 });
  // A loop that starts by itself needs a way to stop it (WCAG 2.2.2); reduced motion never starts it at all.
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (!reduced && !paused) player.play();
    return () => { player.pause(); };
  }, [player, reduced, paused]);
  // The words stay on screen beside the loop: a moving strip must never read as live traffic.
  return <span className="moat-heartbeat">
    <small>{copy.heartbeat_label}</small>
    <span className="moat-heartbeat-strip" role="img" aria-label={copy.heartbeat} title={copy.heartbeat}>
      <MoatScene model={model} playhead_ms={state.playhead_ms} window={windowFor(model, state.playhead_ms)} compact uid={uid} /></span>
    {!reduced && <InkButton type="button" size="small" variant="ghost" aria-pressed={paused} aria-label={paused ? copy.loop_play : copy.loop_pause}
      onClick={() => { setPaused(!paused); }}>{paused ? copy.play : copy.pause}</InkButton>}
  </span>;
}

/** Core mode before any replay: the lanes drawn quiet, with one line saying why they are empty. Nothing moves. */
export function MoatQuiet() {
  const g = compactGeometry;
  return <span className="moat-heartbeat" data-quiet="true">
    <small>{copy.quiet}</small>
    <span className="moat-heartbeat-strip" role="img" aria-label={copy.quiet_name}>
      <span className="moat-scene" data-compact="true" style={{ aspectRatio: `${g.width} / ${g.height}` }}>
        <svg viewBox={`0 0 ${g.width} ${g.height}`} aria-hidden="true" focusable="false">
          <rect className="moat-bank" x="0" y="0" width={g.width} height={g.chat_h} />
          <rect className="moat-water" x="0" y={g.chat_h} width={g.width} height={g.stream_top - g.chat_h} />
          <rect className="moat-bank" x="0" y={g.stream_top} width={g.width} height={g.height - g.stream_top} />
          <rect className="moat-gate" x="0" y={g.gate_top} width={g.width} height={g.gate_h} />
        </svg></span></span>
  </span>;
}
