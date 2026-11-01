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

/** EventSource.CLOSED, spelled out so the runtime never depends on the constructor's statics. */
const CLOSED = 2;

export function mountVoteBar(root: HTMLElement): () => void {
  const initial = document.getElementById('cc-vote-bar')?.textContent;
  if (initial) {
    try { paintVoteBar(root, parseVoteBarSnapshot(initial)); }
    catch { root.replaceChildren(); }
  }
  let disposed = false;
  let stream: EventSource | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let backoff = 2000;
  const connect = () => {
    const source = new EventSource('/push/gatehouse');
    stream = source;
    const active = () => !disposed && stream === source;
    source.addEventListener('open', () => { if (active()) backoff = 2000; });
    source.addEventListener(VOTE_BAR_SNAPSHOT_EVENT, event => {
      if (!active()) return;
      try { paintVoteBar(root, parseVoteBarSnapshot(event.data)); }
      catch { root.replaceChildren(); }
    });
    source.onerror = () => {
      if (!active()) return;
      root.replaceChildren();
      // CONNECTING keeps the browser's native retry. An HTTP refusal (404/503) closes
      // the stream for good, so retry here with a 2s..30s backoff.
      if (source.readyState !== CLOSED) return;
      source.close();
      retry = setTimeout(() => { retry = undefined; connect(); }, backoff);
      backoff = Math.min(backoff * 2, 30000);
    };
  };
  connect();
  return () => {
    disposed = true;
    if (retry !== undefined) clearTimeout(retry);
    stream?.close();
    root.replaceChildren();
  };
}