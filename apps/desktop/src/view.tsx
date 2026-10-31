import { ThemeFrame } from '@castle-control/ui';
import type { ModuleId } from '@castle-control/ui';
import type { Theme } from '@castle-control/tokens';
import type { Ref } from 'react';
import { lazy, Suspense, useRef } from 'react';
import type { Snapshot } from './model.js';
import type { Navigation, ShellSurface } from './navigation.js';
import { DesktopRampart } from './rampart.jsx';
import { coreStewardConnection, coreStreamConnection } from './client.js';
import type { StewardConnection } from './client.js';
import './view.css';

const Keep = lazy(() => import('./shell/keep.jsx'));
const Overview = lazy(() => import('./shell/overview.jsx'));
const Demo = lazy(() => import('./demo/demo.jsx'));
const Stream = lazy(() => import('./stream/setup.jsx'));
const Room = lazy(() => import('./shell/room.jsx'));
const Steward = lazy(() => import('./shell/steward.jsx').then(module => ({ default: module.ShellSteward })));

export type ViewProps = {
  navigation?: Navigation; snapshot: Snapshot; theme: Theme;
  on_navigate: (id: ModuleId) => void; on_theme_change: (theme: Theme) => void;
  on_surface?: (surface: ShellSurface) => void; on_back?: () => void;
  selected?: ModuleId; on_select?: (id: ModuleId) => void; steward_ref?: Ref<HTMLInputElement>;
  // Existing chamber tests render their page through this seam during Wave 1.
  current?: ModuleId; replay?: boolean;
  search?: string; on_search?: (text: string) => void; search_ref?: Ref<HTMLInputElement>;
};

export function DesktopView(props: ViewProps) {
  const navigation = props.navigation ?? { current: props.current ?? 'keep', replay: props.replay ?? false, origin: 'keep' };
  const { current } = navigation;
  // A disconnected read drops its capability lookup, not the pending writ's owner.
  // The retained adapter still checks reachability before every core operation.
  const previous = useRef<StewardConnection | undefined>(undefined);
  const connection = coreStewardConnection(props.snapshot) ?? (props.snapshot.mode === 'core' ? previous.current : undefined);
  previous.current = connection;
  const steward_connection = connection ? { connection } : {};
  const steward = <Suspense fallback={<p role="status">Opening the Steward...</p>}>
    <Steward context={current === 'stream' ? 'keep' : current} {...steward_connection} {...(props.steward_ref ? { input_ref: props.steward_ref } : {})}
      on_select={props.on_select ?? (() => undefined)} on_open={props.on_navigate} on_overview={() => props.on_surface?.('overview')} />
  </Suspense>;
  const stream_connection = coreStreamConnection(props.snapshot);
  return <ThemeFrame theme={props.theme} {...(current === 'keep' || current === 'overview' || current === 'demo' || current === 'stream' ? {} : { module: current })}>
    <div className="desktop-shell">
      <DesktopRampart snapshot={props.snapshot} theme={props.theme} on_theme_change={props.on_theme_change}
        on_steward={() => { if (props.steward_ref && 'current' in props.steward_ref) props.steward_ref.current?.focus(); }} />
      <main className="desktop-surface">
        {props.snapshot.phase !== 'ready' && <p className="desktop-notice" role="status">
          {props.snapshot.mode === 'fixture' ? 'Loading simulated snapshot.' : props.snapshot.message ?? 'Connecting to the core; status is unknown.'}
        </p>}
        <Suspense fallback={<p role="status">Opening the keep...</p>}>
          {current === 'keep' ? <Keep snapshot={props.snapshot} on_open={props.on_navigate} on_enter={() => props.on_surface?.('overview')}
            on_demo={() => props.on_surface?.('demo')} on_stream={() => props.on_surface?.('stream')} />
            : current === 'overview' ? <Overview snapshot={props.snapshot} selected={props.selected ?? 'lottery'} on_select={props.on_select ?? (() => undefined)} on_open={props.on_navigate} steward={steward} {...steward_connection} />
            : current === 'demo' ? <Demo on_back={props.on_back ?? (() => props.on_surface?.('keep'))} />
            : current === 'stream' ? <Stream mode={props.snapshot.mode} {...(stream_connection ? { connection: stream_connection } : {})}
              on_back={props.on_back ?? (() => props.on_surface?.('keep'))} />
            : <Room chamber={current} replay={navigation.replay} snapshot={props.snapshot} origin={navigation.origin}
              {...steward_connection}
              on_open={props.on_navigate} on_back={props.on_back ?? (() => undefined)} />}
        </Suspense>
      </main>
      {current !== 'overview' && steward}
    </div>
  </ThemeFrame>;
}
