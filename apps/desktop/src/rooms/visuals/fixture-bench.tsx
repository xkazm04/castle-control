import type { ReactNode } from 'react';
import type { ProposalQueue } from '@castle-control/ui/steward';
import type { BeaconsPort, PreviewVisual } from '../../beacons-model.js';
import { beaconsCopy as copy } from '../../beacons-copy.js';
import type { AppearanceSession } from './appearance-state.js';
import type { CurveEditor } from './curve-editor.js';
import { Offerings } from './timeline.jsx';
import { TestFire } from './test-fire.jsx';
import { FixtureCurve } from './fixture-curve.jsx';
import { NightReplay } from './replay.jsx';
import { FixtureSourceCopy } from './source-copy.jsx';
import { AppearanceControls } from './appearance.jsx';
import { ContributionFeed } from './event-feed.jsx';
import { InputPicker } from './input-picker.jsx';
import { BeaconBay, BeaconBench, SealPanel } from './bench.jsx';

/** Existing local tools, moved intact into the chamber drawer. SIMULATED only. */
export function FixtureBench({ selected, editor, preview, adapter, queue, appearance, seal_slot }: {
  selected: PreviewVisual; editor: CurveEditor; preview: ReturnType<BeaconsPort['getSnapshot']>;
  adapter: BeaconsPort; queue: ProposalQueue; appearance: AppearanceSession; seal_slot?: ReactNode;
}) {
  return <div className="visuals-more__body">
    <NightReplay item={selected} editor={editor} visuals={preview.visuals} on_select={adapter.select} queue={queue} />
    <BeaconBench name={selected.visual.name} notice={preview.notice}>
      <BeaconBay title={copy.driven_by} gloss={copy.input_gloss}>
        <InputPicker source={selected.visual.input?.source ?? ''} busy={false} on_change={adapter.input} />
        <p className="visuals-note">{copy.fixture_input_note}</p>
        <AppearanceControls session={appearance} visual={selected.visual} design_port={adapter}
          intensity={selected.intensity} burst={preview.events[0]?.id ?? 0} />
      </BeaconBay>
      <BeaconBay title={copy.curve} gloss={copy.curve_gloss}>
        <FixtureCurve key={preview.selected} item={selected} port={adapter} editor={editor} />
      </BeaconBay>
      <BeaconBay title={copy.test_fire} gloss={copy.test_gloss}>
        <TestFire port={adapter} selected={selected} on_end={adapter.end} />
        <FixtureSourceCopy port={adapter} visual={selected.visual} appearance={appearance} />
      </BeaconBay>
    </BeaconBench>
    <div className="visuals-room-details visuals-panels">
      <Offerings />
      <ContributionFeed events={preview.events} origin="Local preview" />
      <SealPanel>{seal_slot}</SealPanel>
    </div>
  </div>;
}
