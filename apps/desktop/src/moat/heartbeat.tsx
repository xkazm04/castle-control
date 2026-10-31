import { useEffect, useId, useMemo } from 'react';
import type { MoatClock } from './moat-player.js';
import { moatCopy as copy } from './moat-copy.js';
import { buildMoat, windowFor } from './moat-model.js';
import type { MoatSource } from './moat-model.js';
import { MoatScene } from './moat-scene.jsx';
import { useMoatPlayer } from './use-moat-player.js';

/** The same model as the drill, small, looping. It is a labelled sample, never a live reading. */
export function MoatHeartbeat({ source, delay_s, clock }: { source: MoatSource; delay_s?: number | undefined; clock?: MoatClock | undefined }) {
  const uid = useId();
  const model = useMemo(() => buildMoat(source, delay_s && delay_s > 0 ? delay_s * 1000 : undefined), [source, delay_s]);
  const { player, state, reduced } = useMoatPlayer(model.run_ms, { ...(clock ? { clock } : {}), start: 'start', rest_ms: 2400, speed: 8, min_frame_ms: 66 });
  useEffect(() => {
    if (!reduced) player.play();
    return () => { player.pause(); };
  }, [player, reduced]);
  // The words stay on screen beside the loop: a moving strip must never read as live traffic.
  return <span className="moat-heartbeat" role="img" aria-label={copy.heartbeat} title={copy.heartbeat}>
    <small>{copy.heartbeat_label}</small>
    <MoatScene model={model} playhead_ms={state.playhead_ms} window={windowFor(model, state.playhead_ms)} compact uid={uid} />
  </span>;
}
