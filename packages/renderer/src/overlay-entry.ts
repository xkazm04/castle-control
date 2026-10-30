import { connectOverlay } from './overlay.ts';

// The build embeds the unchanged token sheet and renderer CSS in this one local
// module. Inline styles are allowed by the OBS host CSP; inline scripts are not.
declare const __CC_OVERLAY_STYLES__: string;
const styles = document.createElement('style');
styles.textContent = __CC_OVERLAY_STYLES__;
document.head.append(styles);

const root = document.getElementById('scene');
const match = /^\/beacons\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(location.pathname);
if (root && match?.[1]) connectOverlay(root, match[1]);
