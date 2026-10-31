import { parseVoteBarSnapshot, VOTE_BAR_SNAPSHOT_EVENT } from '@castle-control/contract/vote-bar';
import type { VoteBarSnapshot } from '@castle-control/contract/vote-bar';

/** Generic direction positions only: neither keys nor configured labels enter OBS. */
export function paintVoteBar(root: HTMLElement, snapshot: VoteBarSnapshot): void {
  const nodes: HTMLElement[] = [];
  if (snapshot.simulated) {
    const badge = document.createElement('p');
    badge.textContent = 'SIMULATED'; nodes.push(badge);
  }
  snapshot.directions.forEach((direction, index) => {
    const row = document.createElement('div'); row.className = 'vote-direction';
    const label = document.createElement('span');
    label.textContent = `Direction ${index + 1} · ${Math.round(direction.share * 100)}%`;
    const track = document.createElement('div'); track.className = 'vote-track';
    const fill = document.createElement('i'); fill.style.width = `${direction.share * 100}%`;
    track.append(fill); row.append(label, track); nodes.push(row);
  });
  root.replaceChildren(...nodes);
}

export function mountVoteBar(root: HTMLElement): () => void {
  const initial = document.getElementById('cc-vote-bar')?.textContent;
  if (initial) {
    try { paintVoteBar(root, parseVoteBarSnapshot(initial)); }
    catch { root.replaceChildren(); }
  }
  const source = new EventSource('/push/gatehouse');
  source.addEventListener(VOTE_BAR_SNAPSHOT_EVENT, event => {
    try { paintVoteBar(root, parseVoteBarSnapshot(event.data)); }
    catch { root.replaceChildren(); }
  });
  source.onerror = () => { root.replaceChildren(); };
  // EventSource owns bounded native reconnect; page teardown closes it.
  return () => { source.close(); root.replaceChildren(); };
}
