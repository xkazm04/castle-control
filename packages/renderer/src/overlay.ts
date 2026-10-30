import { BEACONS_RENDER_SNAPSHOT_EVENT, parseBeaconsRenderSnapshot } from '@castle-control/contract/beacons-render';
import type { BeaconsRenderSnapshot } from '@castle-control/contract/beacons-render';
import { bindLayerBindings } from './bindings.ts';

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
  constructor(root: HTMLElement) {
    this.root = root;
    this.badge = root.ownerDocument.createElement('div');
    this.badge.dataset['simulatedBadge'] = '';
    this.badge.textContent = 'SIMULATED';
    this.badge.hidden = true;
    // Scene-owned chrome stays outside the package's replaceable layer list.
    root.after(this.badge);
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
        node.style.setProperty('left', 'calc(var(--x) * 1px)');
        node.style.setProperty('top', 'calc(var(--y) * 1px)');
        node.style.setProperty('width', 'calc(var(--width) * 1px)');
        node.style.setProperty('height', 'calc(var(--height) * 1px)');
        node.style.setProperty('transform', 'scale(var(--scale))');
        node.style.setProperty('opacity', 'var(--opacity)');
        if (layer.kind === 'text') node.textContent = layer.text;
        if (layer.kind === 'shape') {
          node.style.setProperty('background', 'currentColor');
          if (layer.shape === 'ellipse') node.style.setProperty('border-radius', '50%');
        }
        if (layer.kind === 'image') node.setAttribute('src', assetUrl(snapshot, layer.asset));
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

export function connectOverlay(root: HTMLElement, visual_id: string): () => void {
  const scene = new OverlayScene(root);
  const stream = new EventSource(`/push/beacons?visual_id=${encodeURIComponent(visual_id)}`);
  stream.addEventListener(BEACONS_RENDER_SNAPSHOT_EVENT, (event: MessageEvent<string>) => {
    receiveSnapshot(event.data, visual_id, (snapshot) => scene.apply(snapshot));
  });
  return () => stream.close();
}
