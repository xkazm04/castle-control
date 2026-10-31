import { mountVoteBar } from './vote-bar.ts';

const root = document.getElementById('vote-bar');
if (root) {
  const dispose = mountVoteBar(root);
  window.addEventListener('pagehide', dispose, { once: true });
}
