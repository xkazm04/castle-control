import type { Visual, VisualId } from '@castle-control/contract';
import type { CoreBeaconsPort } from '../../beacons-core.js';

type CopyState = Readonly<{
  busy: boolean; notice: string; phase: 'idle' | 'copying' | 'copied' | 'unavailable' | 'error';
}>;

/** Room-local feedback only. URLs and launch capabilities never enter read snapshots. */
export function createBrowserSourceCopy(port: CoreBeaconsPort) {
  let state: CopyState = Object.freeze({ busy: false, notice: '', phase: 'idle' });
  const listeners = new Set<() => void>();
  function publish(change: CopyState) {
    state = Object.freeze(change);
    for (const listener of listeners) listener();
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async copy(visual_id: VisualId) {
      if (state.busy || port.getSnapshot().busy) return;
      publish({ busy: true, phase: 'copying', notice: 'Getting browser-source URL from the core.' });
      const result = await port.sourceUrl(visual_id);
      if (!result) {
        const code = port.getSnapshot().error?.code;
        const unavailable = code === 'unavailable' || code === 'not_found';
        publish({ busy: false, phase: unavailable ? 'unavailable' : 'error', notice: unavailable
          ? 'Browser-source URL unavailable in this connection. No URL was copied.'
          : `Copy failed${code ? `: ${code}` : ''}. No URL was copied. Try again when the core is ready.` });
        return;
      }
      try {
        // The port returned this exact URL only after generated loopback validation.
        await navigator.clipboard.writeText(result.url);
        publish({ busy: false, phase: 'copied', notice: 'Browser-source URL copied.' });
      } catch {
        publish({ busy: false, phase: 'error', notice: 'Copy failed. Clipboard access was denied or is unavailable. Try again explicitly.' });
      }
    },
  };
}
type SourceCopy = ReturnType<typeof createBrowserSourceCopy>;

export function BrowserSourceButton({ copy, visual, busy }: { copy: SourceCopy; visual: Visual; busy: boolean }) {
  return <button type="button" disabled={busy} aria-label={`Copy browser-source URL for ${visual.name}`}
    onClick={() => copy.copy(visual.visual_id)}>Copy browser-source URL</button>;
}

export function BrowserSourceNotice({ state }: { state: CopyState }) {
  return <p className="visuals-core-source-status" role="status" aria-live="polite" aria-atomic="true">{state.notice}</p>;
}
