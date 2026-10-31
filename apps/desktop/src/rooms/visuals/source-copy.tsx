import type { Visual, VisualId } from '@castle-control/contract';
import type { CoreBeaconsPort } from '../../beacons-core.js';
import { useMemo, useSyncExternalStore } from 'react';
import type { BeaconsPort } from '../../beacons-model.js';
import { fixtureSourceUrl } from '../../beacons-fixture.js';
import { beaconsCopy as copy } from '../../beacons-copy.js';
import { displayQuery, initialAppearance } from './appearance-state.js';
import type { AppearanceSession } from './appearance-state.js';

type CopyState = Readonly<{
  busy: boolean; notice: string; phase: 'idle' | 'copying' | 'copied' | 'unavailable' | 'error';
}>;

/** Room-local feedback only. URLs and launch capabilities never enter read snapshots. */
export function createBrowserSourceCopy(port: {
  getSnapshot: () => { busy: boolean; error?: { code: string }; visuals: readonly Pick<Visual, 'visual_id' | 'name' | 'design_id'>[] };
  sourceUrl: CoreBeaconsPort['sourceUrl'];
}, simulated = false, query?: (visual_id: VisualId) => string) {
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
      const visual = port.getSnapshot().visuals.find(item => item.visual_id === visual_id);
      const name = visual?.name ?? visual_id;
      const display = query?.(visual_id);
      publish({ busy: true, phase: 'copying', notice: simulated ? copy.source_example : copy.source_loading });
      const result = await port.sourceUrl(visual_id);
      if (!result) {
        const code = port.getSnapshot().error?.code;
        const unavailable = code === 'unavailable' || code === 'not_found';
        publish({ busy: false, phase: unavailable ? 'unavailable' : 'error', notice:
          code === 'unavailable' && visual?.design_id ? copy.source_unverified(visual.design_id)
            : unavailable ? copy.source_unavailable : copy.source_failed(code) });
        return;
      }
      try {
        // The port validates the owned loopback URL. Only display keys are changed.
        const target = new URL(result.url);
        if (display) {
          const params = new URLSearchParams(display);
          for (const key of ['scale', 'anchor']) {
            const value = params.get(key);
            if (value !== null) target.searchParams.set(key, value);
          }
        }
        await navigator.clipboard.writeText(target.href);
        publish({ busy: false, phase: 'copied', notice: simulated ? copy.example_copied(name)
          : visual && !visual.design_id ? copy.source_no_design(name) : copy.source_copied(name) });
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

export function createFixtureSourceCopy(port: BeaconsPort, appearance?: AppearanceSession) {
  return createBrowserSourceCopy({
    getSnapshot: () => ({ busy: false, visuals: port.getSnapshot().visuals.map(item => item.visual) }),
    sourceUrl: async visual_id => ({ url: fixtureSourceUrl(visual_id) }),
  }, true, id => displayQuery(appearance?.getSnapshot()[id] ?? initialAppearance));
}

export function FixtureSourceCopy({ port, visual, appearance }: { port: BeaconsPort; visual: Visual; appearance: AppearanceSession }) {
  const source = useMemo(() => createFixtureSourceCopy(port, appearance), [port, appearance]);
  const state = useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot);
  return <section aria-label="Browser-source URL">
    <p className="visuals-note">{copy.source_example}</p>
    <BrowserSourceButton copy={source} visual={visual} busy={state.busy} />
    <BrowserSourceNotice state={state} />
  </section>;
}
