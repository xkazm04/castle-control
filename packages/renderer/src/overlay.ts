import { BEACONS_RENDER_SNAPSHOT_EVENT, parseBeaconsRenderSnapshot } from '@castle-control/contract/beacons-render';
import type { BeaconsRenderSnapshot } from '@castle-control/contract/beacons-render';
import { applyLayerBindings, bindLayerBindings } from './bindings.ts';

export interface OverlayDisplay {
  readonly scale: number;
  readonly anchor: 'tl' | 'tr' | 'bl' | 'br' | 'center';
}
interface Bounds { x: number; y: number; width: number; height: number }

/** Conservative envelope across the entire intensity range; no zoom pumping. */
function packageBounds(snapshot: BeaconsRenderSnapshot): Bounds {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const layer of snapshot.package?.layers ?? []) {
    const a = applyLayerBindings(layer.properties, layer.bindings, 0);
    const b = applyLayerBindings(layer.properties, layer.bindings, 1);
    const scale = Math.max(a.scale, b.scale);
    left = Math.min(left, a.x, b.x);
    top = Math.min(top, a.y, b.y);
    right = Math.max(right, Math.max(a.x, b.x) + a.width * scale);
    bottom = Math.max(bottom, Math.max(a.y, b.y) + a.height * scale);
  }
  return Number.isFinite(right) && Number.isFinite(bottom)
    ? { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) }
    : { x: 0, y: 0, width: 1, height: 1 };
}

/** Invalid push data is ignored before touching the existing accepted scene. */
export function receiveSnapshot(text: string, visual_id: string, apply: (snapshot: BeaconsRenderSnapshot) => void): boolean {
  let snapshot: BeaconsRenderSnapshot;
  try { snapshot = parseBeaconsRenderSnapshot(text); }
  catch { return false; } // Explicit transport rejection; existing scene is retained.
  if (snapshot.visual.visual_id !== visual_id) return false;
  apply(snapshot);
  return true;
}

/** No animation loop: package changes build once; intensity changes update CSS. */
export class OverlayScene {
  private identity: string | undefined;
  private bindings: ((intensity: number) => boolean)[] = [];
  private readonly root: HTMLElement;
  private readonly badge: HTMLElement;
  private readonly display: OverlayDisplay;
  private bounds: Bounds = { x: 0, y: 0, width: 1, height: 1 };
  private viewport = { width: 1, height: 1 };
  constructor(root: HTMLElement, display: OverlayDisplay = { scale: 1, anchor: 'center' }) {
    this.root = root;
    this.display = { ...display };
    this.badge = root.ownerDocument.createElement('div');
    this.badge.dataset['simulatedBadge'] = '';
    this.badge.dataset['anchor'] = this.display.anchor;
    this.badge.textContent = 'SIMULATED';
    this.badge.hidden = true;
    // Scene-owned chrome stays outside the package's replaceable layer list.
    root.after(this.badge);
  }

  resize(width: number, height: number): void {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
    if (this.viewport.width === width && this.viewport.height === height) return;
    this.viewport = { width, height };
    this.fit();
  }

  clear(): void {
    this.root.replaceChildren();
    this.bindings = [];
    this.identity = undefined;
    delete this.root.dataset['packageHash'];
    delete this.root.dataset['intensity'];
    delete this.root.dataset['simulated'];
    this.badge.hidden = true;
  }

  private fit(): void {
    const { width, height } = this.viewport;
    const bounds = this.bounds;
    const scale = Math.min(this.display.scale, width / bounds.width, height / bounds.height);
    const anchor = this.display.anchor;
    const x = anchor === 'center' ? 0.5 : anchor.endsWith('r') ? 1 : 0;
    const y = anchor === 'center' ? 0.5 : anchor.startsWith('b') ? 1 : 0;
    this.root.style.setProperty('--scene-scale', String(scale));
    this.root.style.setProperty('--scene-x', `${(width - bounds.width * scale) * x}px`);
    this.root.style.setProperty('--scene-y', `${(height - bounds.height * scale) * y}px`);
    this.root.style.setProperty('--scene-left', String(bounds.x));
    this.root.style.setProperty('--scene-top', String(bounds.y));
    this.root.style.setProperty('--scene-width', `${bounds.width}px`);
    this.root.style.setProperty('--scene-height', `${bounds.height}px`);
  }

  apply(snapshot: BeaconsRenderSnapshot): void {
    const pkg = snapshot.package;
    const identity = pkg ? `${pkg.design_id}/${pkg.content_hash}` : '';
    if (identity !== this.identity) {
      const nodes: HTMLElement[] = [];
      const bindings: ((intensity: number) => boolean)[] = [];
      const document = this.root.ownerDocument;
      for (const layer of pkg?.layers ?? []) {
        const node = document.createElement(layer.kind === 'image' ? 'img' : 'div');
        node.style.setProperty('position', 'absolute');
        node.style.setProperty('left', 'calc((var(--x) - var(--scene-left)) * 1px)');
        node.style.setProperty('top', 'calc((var(--y) - var(--scene-top)) * 1px)');
        node.style.setProperty('width', 'calc(var(--width) * 1px)');
        node.style.setProperty('height', 'calc(var(--height) * 1px)');
        node.style.setProperty('transform', 'scale(var(--scale))');
        node.style.setProperty('transform-origin', 'top left');
        node.style.setProperty('overflow', 'hidden');
        node.style.setProperty('overflow-wrap', 'anywhere');
        node.style.setProperty('opacity', 'var(--opacity)');
        if (layer.kind === 'text') node.textContent = layer.text;
        if (layer.kind === 'shape') {
          node.style.setProperty('background', 'currentColor');
          if (layer.shape === 'ellipse') node.style.setProperty('border-radius', '50%');
        }
        if (layer.kind === 'image') {
          node.setAttribute('alt', '');
          node.addEventListener('error', () => { node.hidden = true; });
          node.setAttribute('src', assetUrl(snapshot, layer.asset));
        }
        if (layer.kind === 'particle_preset' && layer.preset === 'embers') {
          // Renderer-owned, fixed artwork; a preset name is never code or a URL.
          node.textContent = '·  ˙  ·  ˙  ·';
          node.style.setProperty('color', 'gold');
        }
        nodes.push(node);
        bindings.push(bindLayerBindings(node, layer.properties, layer.bindings));
      }
      if (pkg?.privileges?.kind === 'scripts') {
        // The native host publishes and serves these entries only after consent.
        // CSP admits same-origin external modules; no inline code is created.
        for (const entry of pkg.privileges.scripts) {
          const script = document.createElement('script');
          script.type = 'module';
          script.src = assetUrl(snapshot, entry);
          nodes.push(script);
        }
      }
      this.root.replaceChildren(...nodes);
      this.bindings = bindings;
      this.identity = identity;
      this.bounds = packageBounds(snapshot);
      this.fit();
    }
    for (const bind of this.bindings) bind(snapshot.intensity.intensity);
    // Local diagnostics for the native-to-client delivery probe, not wire data.
    const hash = pkg?.content_hash ?? '';
    const intensity = String(snapshot.intensity.intensity);
    if (this.root.dataset['packageHash'] !== hash) this.root.dataset['packageHash'] = hash;
    if (this.root.dataset['intensity'] !== intensity) this.root.dataset['intensity'] = intensity;
    const simulated = String(snapshot.simulated);
    if (this.root.dataset['simulated'] !== simulated) this.root.dataset['simulated'] = simulated;
    this.badge.hidden = !snapshot.simulated;
  }
}

function assetUrl(snapshot: BeaconsRenderSnapshot, path: string): string {
  const pkg = snapshot.package;
  if (!pkg) throw new Error('No accepted package');
  return `/assets/${snapshot.visual.visual_id}/${pkg.content_hash}/${path}`;
}

export function connectOverlay(root: HTMLElement, visual_id: string, display?: OverlayDisplay): () => void {
  const scene = new OverlayScene(root, display);
  const resize = () => scene.resize(window.innerWidth, window.innerHeight);
  resize();
  window.addEventListener('resize', resize);
  let disposed = false;
  let stream: EventSource;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let backoff = 2000;
  const connect = () => {
    const source = new EventSource(`/push/beacons?visual_id=${encodeURIComponent(visual_id)}`);
    stream = source;
    const active = () => !disposed && stream === source && retry === undefined;
    source.addEventListener('open', () => { if (active()) backoff = 2000; });
    source.addEventListener(BEACONS_RENDER_SNAPSHOT_EVENT, (event: MessageEvent<string>) => {
      if (active()) receiveSnapshot(event.data, visual_id, (snapshot) => scene.apply(snapshot));
    });
    source.addEventListener('error', () => {
      if (!active()) return;
      scene.clear();
      // CONNECTING keeps the browser's native retry. HTTP refusals close it.
      if (source.readyState !== EventSource.CLOSED) return;
      source.close();
      retry = setTimeout(() => { retry = undefined; connect(); }, backoff);
      backoff = Math.min(backoff * 2, 30000);
    });
  };
  connect();
  return () => {
    disposed = true;
    if (retry !== undefined) clearTimeout(retry);
    window.removeEventListener('resize', resize);
    stream.close();
    scene.clear();
  };
}
