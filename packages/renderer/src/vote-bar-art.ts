import type { VoteBarSnapshot } from '@castle-control/contract/vote-bar';

export type VoteBarArt = NonNullable<VoteBarSnapshot['art']>;
interface Painted { readonly key: string; readonly wrap: HTMLElement; readonly badge: HTMLElement; readonly segs: HTMLElement[] }

// Housing art, measured track, segment shading, sheen and lead glow. The page CSP admits inline styles.
const STYLE = '#vote-bar:has(.vba){background:none;padding:0}.vba{position:relative}.vba img{display:block;width:100%}'
  + '.vbs{margin:0;color:#fff;text-shadow:0 1px 3px #000}.vbt{position:absolute;display:flex;overflow:hidden;box-shadow:inset 0 3px 8px #000a}'
  + '.vbt i{position:relative;flex:none;transition:width 1s;box-shadow:inset 0 2px 6px #fff5,inset 0 -6px 10px #0006}'
  + '.vbt i:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,#0000,#fff4,#0000) 0/200%;animation:vbs 2.6s linear infinite}'
  + '.vbt .lead{filter:brightness(1.2) drop-shadow(0 0 6px currentColor)}@keyframes vbs{to{background-position:-200%}}'
  + '@media (prefers-reduced-motion:reduce){.vbt i,.vbt i:after{transition:none;animation:none}}';

// One vote bar per page; nodes are retained so share changes animate their width.
let painted: Painted | undefined;
const pct = (n: number): string => `${n * 100}%`;

/** The three art colours in order; a fourth+ direction blends two neighbours channel by channel. */
export function segmentColour(segments: readonly string[], index: number): string {
  const at = (i: number): string => String(segments[i % segments.length]);
  if (index < 3) return at(index);
  const hex = (i: number): number => (parseInt(at(i).slice(1), 16) & 0xfefefe) >> 1;
  return `#${(hex(index) + hex(index + 1)).toString(16).padStart(6, '0')}`;
}

/** Aggregate shares only: no direction text, keys or labels reach the art path. */
export function paintVoteBarArt(root: HTMLElement, snapshot: VoteBarSnapshot, art: VoteBarArt): void {
  const shares = snapshot.directions.map(direction => direction.share);
  const key = JSON.stringify([art, shares.length]);
  let state = painted;
  if (state?.key !== key || state.wrap.parentNode !== root) {
    const style = document.createElement('style'); style.textContent = STYLE;
    const badge = document.createElement('p'); badge.className = 'vbs'; badge.textContent = 'SIMULATED';
    const wrap = document.createElement('div'); wrap.className = 'vba';
    const img = document.createElement('img'); img.alt = ''; img.src = art.asset_url;
    const track = document.createElement('div'); track.className = 'vbt';
    const { x, y, w, h } = art.track_rect;
    // x and y are schema-bounded 0..1; the extent is clamped to the image.
    Object.assign(track.style, { left: pct(x), top: pct(y), width: pct(Math.min(w, 1 - x)), height: pct(Math.min(h, 1 - y)) });
    const segs = shares.map((_, index) => {
      const seg = document.createElement('i'), colour = segmentColour(art.segments, index);
      seg.style.background = `linear-gradient(${colour},${colour}b0)`;
      seg.style.color = colour;
      return seg;
    });
    track.append(...segs); wrap.append(img, track);
    // track_radius is a fraction of the rendered track height, so follow its size.
    new ResizeObserver(() => { track.style.borderRadius = `${track.clientHeight * art.track_radius}px`; }).observe(track);
    root.replaceChildren(style, badge, wrap);
    state = { key, wrap, badge, segs };
    painted = state;
  }
  const lead = shares.indexOf(Math.max(...shares));
  state.segs.forEach((seg, index) => {
    const share = shares[index] ?? 0;
    seg.style.width = pct(share);
    seg.className = index === lead && share > 0 ? 'lead' : '';
  });
  state.badge.hidden = !snapshot.simulated;
}
