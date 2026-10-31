import { parseJson } from '@castle-control/contract/door';
import { lotsCast, lotsRollSeal } from '@castle-control/contract/lots';
import type { DrawContent } from '@castle-control/contract';
import { buildDrawScene, createDrawPlayback } from './scenes.ts';
import { paintDraw } from './paint.ts';

function contentOf(root: HTMLElement): DrawContent {
  const content = root.dataset['content'];
  if (content === 'prize' || content === 'question' || content === 'idea' || content === 'seat') return content;
  throw new Error('Missing seal-time draw content');
}

/** No query-value parser here: scale and anchor are resolved on <main> by Rust.
 * The only outcome input is the core-verified, schema-validated cast island.
 * A failed admission leaves the escaped server fallback untouched.
 */
export function mountDraw(root: HTMLElement, draw_id: string): (() => void) | undefined {
  const doc = root.ownerDocument;
  const seal_text = doc?.getElementById('cc-seal')?.textContent;
  if (!seal_text) return undefined;
  try {
    const seal: unknown = parseJson(seal_text);
    if (!lotsRollSeal.result(seal) || seal.draw_id !== draw_id) throw new Error('Invalid seal island');
    const cast_text = doc.getElementById('cc-cast')?.textContent;
    if (!cast_text) return undefined; // Waiting seal/round stays server-rendered.
    const cast: unknown = parseJson(cast_text);
    if (!lotsCast.result(cast) || cast.draw_run_id !== seal.draw_run_id
      || cast.cast.seal !== seal.sealed.seal) throw new Error('Cast does not match seal');
    const content = contentOf(root);
    const win = doc.defaultView;
    if (!win) throw new Error('No draw viewport');
    const replay_key = `cc-lots-played:${draw_id}:${seal.sealed.seal}`;
    const storage = (write = false): boolean => {
      try {
        if (write) win.sessionStorage.setItem(replay_key, 'played');
        return win.sessionStorage.getItem(replay_key) === 'played';
      } catch {
        // OBS can disable storage; playback remains available in that session.
        root.dataset['replayStorage'] = 'unavailable';
        return false;
      }
    };
    const reduced_motion = storage() || win.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // LotsDraw/RollSealResult carries no shape: use the plan's default urn.
    const scene = buildDrawScene('urn', cast.cast, { content, disclaimer: content === 'prize', reduced_motion });
    const player = createDrawPlayback(scene);
    const paint = paintDraw(root, scene);
    const fallback = root.querySelector<HTMLElement>('[data-draw-fallback]');
    if (fallback) fallback.hidden = true;
    root.dataset['drawMounted'] = 'true';
    const started_at = win.performance.now();
    let frame = 0;
    const advance = (now: number): void => {
      paint.update(player.advanceTo(now - started_at));
      if (player.finished) storage(true);
      else frame = win.requestAnimationFrame(advance);
    };
    advance(started_at);
    return () => {
      win.cancelAnimationFrame(frame);
      paint.dispose();
      if (fallback) fallback.hidden = false;
      delete root.dataset['drawMounted'];
    };
  } catch {
    root.dataset['drawError'] = 'invalid_scene';
    return undefined;
  }
}
