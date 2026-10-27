import { connectOverlay } from './overlay.ts';

const root = document.getElementById('scene');
const match = /^\/beacons\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(location.pathname);
if (root && match?.[1]) connectOverlay(root, match[1]);
