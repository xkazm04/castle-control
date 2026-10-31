import type { Visual, VisualId } from '@castle-control/contract';
import type { CoreBeaconsPort } from '../../beacons-core.js';
import { useMemo, useSyncExternalStore } from 'react';
import type { BeaconsPort } from '../../beacons-model.js';
import { fixtureSourceUrl } from '../../beacons-fixture.js';
import { beaconsCopy as copy } from '../../beacons-copy.js';

type CopyState = Readonly<{
  busy: boolean; notice: string; phase: 'idle' | 'copying' | 'copied' | 'unavailable' | 'error';
}>;

/** Room-local feedback only. URLs and launch capabilities never enter read snapshots. */
export function createBrowserSourceCopy(port: {
  getSnapshot: () => { busy: boolean; error?: { code: string }; visuals: readonly Pick<Visual, 'visual_id' | 'name'>[] };
  sourceUrl: CoreBeaconsPort['sourceUrl'];
}, simulated = false) {
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
      const name = port.getSnapshot().visuals.find(item => item.visual_id === visual_id)?.name ?? visual_id;
      publish({ busy: true, phase: 'copying', notice: simulated ? copy.source_example : copy.source_loading });
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
        publish({ busy: false, phase: 'copied', notice: simulated ? copy.example_copied(name) : copy.source_copied(name) });
      } catch {
        publish({ busy: false, phase: 'error', notice: copy.source_clipboard_error });
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

export function createFixtureSourceCopy(port: BeaconsPort) {
  return createBrowserSourceCopy({
    getSnapshot: () => ({ busy: false, visuals: port.getSnapshot().visuals.map(item => item.visual) }),
    sourceUrl: async visual_id => ({ url: fixtureSourceUrl(visual_id) }),
  }, true);
}

export function FixtureSourceCopy({ port, visual }: { port: BeaconsPort; visual: Visual }) {
  const source = useMemo(() => createFixtureSourceCopy(port), [port]);
  const state = useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot);
  return <section aria-label="Browser-source URL">
    <p className="visuals-note">{copy.source_example}</p>
    <BrowserSourceButton copy={source} visual={visual} busy={state.busy} />
    <BrowserSourceNotice state={state} />
  </section>;
}
