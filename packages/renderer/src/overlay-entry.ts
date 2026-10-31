import { connectOverlay } from './overlay.ts';
import type { OverlayDisplay } from './overlay.ts';

/** URL-only presentation grammar, independent of RPC and package identity. */
export function parseOverlayDisplay(search: string): OverlayDisplay {
  const query = new URLSearchParams(search);
  const raw = query.get('scale') ?? '';
  const value = /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(raw) ? Number(raw) : NaN;
  const scale = query.getAll('scale').length === 1 && value >= 0.5 && value <= 2 ? value : 1;
  const anchor = query.get('anchor');
  return { scale, anchor: query.getAll('anchor').length === 1
    && (anchor === 'tl' || anchor === 'tr' || anchor === 'bl' || anchor === 'br' || anchor === 'center') ? anchor : 'center' };
}

// The build embeds the unchanged token sheet and renderer CSS in this one local
// module. Inline styles are allowed by the OBS host CSP; inline scripts are not.
declare const __CC_OVERLAY_STYLES__: string;
const styles = document.createElement('style');
styles.textContent = __CC_OVERLAY_STYLES__;
document.head.append(styles);

const root = document.getElementById('scene');
const match = /^\/beacons\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(location.pathname);
if (root && match?.[1]) connectOverlay(root, match[1], parseOverlayDisplay(location.search));
