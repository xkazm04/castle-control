import { useState, useSyncExternalStore } from 'react';
import { InkButton, NumberedPanel, PageHeader, StatusChip } from '@castle-control/ui';
import type { BeaconsPort } from './beacons-model.js';
import { createBeaconsPreview } from './beacons-model.js';
import { fixtureSourceUrl } from './beacons-fixture.js';
import { beaconsCopy as copy } from './beacons-copy.js';
import { BeaconCards, BeaconPreview, BeaconsFeed } from './beacons-visuals.jsx';
import { CurveEditor } from './beacons-curve.jsx';
import './beacons.css';

export async function copyFixtureUrl(url: string, clipboard: Pick<Clipboard, 'writeText'> | undefined): Promise<string> {
  if (!clipboard) return 'Clipboard unavailable. Select the fixture placeholder below to copy manually.';
  try {
    await clipboard.writeText(url);
    return 'Copied fixture placeholder · NOT LIVE · not served.';
  } catch {
    return 'Copy failed. Select the fixture placeholder below to copy manually.';
  }
}

export function BeaconsPage({ port }: { port?: BeaconsPort }) {
  const [local] = useState(createBeaconsPreview);
  const adapter = port ?? local;
  const snapshot = useSyncExternalStore(adapter.subscribe, adapter.getSnapshot, adapter.getSnapshot);
  const [copy_status, setCopyStatus] = useState('');
  const selected = snapshot.visuals.find(item => item.visual.visual_id === snapshot.selected);
  if (!selected) return <p role="status">No fixture visual is available.</p>;
  const url = fixtureSourceUrl(selected.visual.visual_id);
  return <>
    <PageHeader number={3} title={copy.title} description={copy.description} actions={<StatusChip variant="or">Simulated visuals</StatusChip>} />
    <p className="beacons-notice">{copy.notice}</p>
    <BeaconCards visuals={snapshot.visuals} selected={snapshot.selected} on_select={id => { adapter.select(id); setCopyStatus(''); }} />
    <div className="beacons-grid">
      <div className="beacons-column">
        <NumberedPanel number="3.2" title={copy.curve} gloss={copy.curve_gloss} meta={selected.visual.name}>
          <CurveEditor item={selected} port={adapter} />
        </NumberedPanel>
        <NumberedPanel number="3.1" title={copy.feed} meta={`${snapshot.events.length} simulated events`}>
          <p className="beacons-meta">Generated subscriptions and gifts only · money affects visuals only.</p>
          <BeaconsFeed events={snapshot.events} />
        </NumberedPanel>
      </div>
      <aside className="beacons-column" aria-label="Selected visual preview and source">
        <NumberedPanel number="3.3" title={copy.test} gloss="Before it meets an audience">
          <p className="beacons-meta">Stylised local preview · not a stream capture</p>
          <BeaconPreview item={selected} />
          <p className="beacons-value"><b>{Math.round(selected.intensity * 100)}%</b> blaze · {selected.total.toFixed(1)} weighted subs</p>
          <div className="beacons-tools">
            <InkButton variant="plate" onClick={() => adapter.fire('gift', 50)}>{copy.bomb}</InkButton>
            <InkButton size="small" onClick={() => adapter.fire('subscribe', 1)}>Test fire: 1 sub</InkButton>
            <InkButton size="small" variant="ghost" onClick={adapter.advance}>Advance simulated clock 60 s</InkButton>
          </div>
          <p className="beacons-meta">Simulated clock: +{snapshot.elapsed_s} s. Decay advances only on click.</p>
          <p className="beacons-meta">{copy.source_notice}</p>
          <label className="beacons-source">Browser-source URL · fixture placeholder
            <input readOnly value={url} aria-label="Fixture browser-source URL · NOT LIVE" onFocus={event => event.currentTarget.select()} />
          </label>
          <InkButton size="small" onClick={async () => setCopyStatus(await copyFixtureUrl(url, globalThis.navigator?.clipboard))}>{copy.source}</InkButton>
          <p className="beacons-meta" role="status">{copy_status}</p>
        </NumberedPanel>
        <NumberedPanel number="3.4" title={copy.layers} gloss="Illustration only">
          <p className="beacons-meta">{selected.visual.name} · data-only fixture · no asset is loaded.</p>
          <ol className="beacons-layers"><li>Paper and halftone</li><li>Frame or object silhouette</li><li>Gold intensity layer</li></ol>
          <p className="beacons-meta">This local illustration reads <code>--blaze</code> from 0 to 1. Design-package rendering and OBS delivery are separate work.</p>
        </NumberedPanel>
      </aside>
    </div>
    <p className="beacons-notice" role="status" aria-live="polite">{snapshot.notice}</p>
  </>;
}
