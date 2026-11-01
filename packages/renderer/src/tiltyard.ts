import { parseTiltyardRenderSnapshot, TILTYARD_PUSH_ROUTE, TILTYARD_RENDER_SNAPSHOT_EVENT } from '@castle-control/contract/tiltyard-render';
import type { TiltyardRenderSnapshot } from '@castle-control/contract/tiltyard-render';

const phases = { open: 'Open', closed: 'Closed', called: 'Called', cancelled: 'Cancelled', finished: 'Finished' } as const;
function line(text: string, className = ''): HTMLElement {
  const node = document.createElement('p');
  node.textContent = text; node.className = className;
  return node;
}
export function timerText(snapshot: TiltyardRenderSnapshot, now = Date.now()): string {
  if (snapshot.window_ends_at !== undefined) {
    return `${Math.ceil(Math.max(0, Date.parse(snapshot.window_ends_at) - now) / 1000)}s remaining`;
  }
  return snapshot.window_remaining_ms === undefined ? '' : `Paused · ${Math.ceil(snapshot.window_remaining_ms / 1000)}s remaining`;
}
/** Labels only enter textContent; a snapshot always replaces the complete card. */
export function paintTiltyard(root: HTMLElement, snapshot: TiltyardRenderSnapshot, now = Date.now()): void {
  const nodes: HTMLElement[] = [];
  if (snapshot.simulated) nodes.push(line('SIMULATED', 'simulated'));
  nodes.push(line(`${snapshot.round_label} · ${snapshot.match_label} · ${phases[snapshot.phase]}`),
    line(`1 · ${snapshot.left.label} · ${snapshot.left.count}`, 'tiltyard-side'),
    line(`2 · ${snapshot.right.label} · ${snapshot.right.count}`, 'tiltyard-side'),
    line(`${snapshot.ballots} ballots`));
  const timer = timerText(snapshot, now);
  if (timer) nodes.push(line(timer));
  if (snapshot.verdict) nodes.push(line(`Winner: ${snapshot[snapshot.verdict.side].label} · ${snapshot.verdict.how}`));
  if (snapshot.champion) nodes.push(line(`Champion: ${snapshot.champion.title}`));
  root.replaceChildren(...nodes);
}
export function mountTiltyard(root: HTMLElement): () => void {
  let snapshot: TiltyardRenderSnapshot | undefined;
  const clear = () => { snapshot = undefined; root.replaceChildren(); };
  const accept = (text: string) => {
    try { snapshot = parseTiltyardRenderSnapshot(text); paintTiltyard(root, snapshot); }
    catch { clear(); }
  };
  const initial = document.getElementById('cc-tiltyard')?.textContent;
  if (initial) accept(initial);
  const source = new EventSource(TILTYARD_PUSH_ROUTE);
  source.addEventListener(TILTYARD_RENDER_SNAPSHOT_EVENT, event => { accept(event.data); });
  source.onerror = clear;
  const timer = setInterval(() => { if (snapshot?.window_ends_at) paintTiltyard(root, snapshot); }, 250);
  return () => { clearInterval(timer); source.close(); clear(); };
}
