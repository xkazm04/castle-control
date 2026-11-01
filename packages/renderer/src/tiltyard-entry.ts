import { mountTiltyard } from './tiltyard.ts';

const root = document.getElementById('tiltyard');
if (root) {
  const dispose = mountTiltyard(root);
  window.addEventListener('pagehide', dispose, { once: true });
}
