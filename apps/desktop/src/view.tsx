import { ThemeFrame } from '@castle-control/ui';
import type { ModuleId } from '@castle-control/ui';
import type { Theme } from '@castle-control/tokens';
import type { Ref } from 'react';
import { lazy, Suspense } from 'react';
import type { Snapshot } from './model.js';
import type { Navigation, Surface } from './navigation.js';
import { DesktopRampart } from './rampart.jsx';
import { simulatedSourceLabel } from './simulated.js';
import { ShellSteward } from './shell/steward.jsx';
import './view.css';

const Keep = lazy(() => import('./shell/keep.jsx'));
const Overview = lazy(() => import('./shell/overview.jsx'));
const Room = lazy(() => import('./shell/room.jsx'));

export type ViewProps = {
  navigation?: Navigation; snapshot: Snapshot; theme: Theme;
  on_navigate: (id: ModuleId) => void; on_theme_change: (theme: Theme) => void;
  on_surface?: (surface: Surface) => void; on_back?: () => void;
  selected?: ModuleId; on_select?: (id: ModuleId) => void; steward_ref?: Ref<HTMLInputElement>;
  // Existing chamber tests render their page through this seam during Wave 1.
  current?: ModuleId; replay?: boolean;
  search?: string; on_search?: (text: string) => void; search_ref?: Ref<HTMLInputElement>;
};

export function DesktopView(props: ViewProps) {
  const navigation = props.navigation ?? { current: props.current ?? 'keep', replay: props.replay ?? false, origin: 'keep' };
  const { current } = navigation;
  const simulated = props.snapshot.mode === 'fixture' || props.snapshot.status?.simulated === true;
  return <ThemeFrame theme={props.theme} {...(current === 'keep' || current === 'overview' ? {} : { module: current })}>
    <div className="desktop-shell">
      <DesktopRampart snapshot={props.snapshot} theme={props.theme} on_theme_change={props.on_theme_change}
        on_steward={() => { if (props.steward_ref && 'current' in props.steward_ref) props.steward_ref.current?.focus(); }} />
      <main className="desktop-surface">
        {simulated && <div className="desktop-simulated" role="status">{props.snapshot.mode === 'fixture'
          ? simulatedSourceLabel : 'SIMULATED SOURCE · core reports simulated data'}</div>}
        {props.snapshot.phase !== 'ready' && <p className="desktop-notice" role="status">
          {props.snapshot.mode === 'fixture' ? 'Loading simulated snapshot.' : props.snapshot.message ?? 'Connecting to the core; status is unknown.'}
        </p>}
        <Suspense fallback={<p role="status">Opening the keep...</p>}>
          {current === 'keep' ? <Keep on_open={props.on_navigate} on_enter={() => props.on_surface?.('overview')} />
            : current === 'overview' ? <Overview selected={props.selected ?? 'lottery'} on_select={props.on_select ?? (() => undefined)} on_open={props.on_navigate} />
            : <Room chamber={current} replay={navigation.replay} snapshot={props.snapshot} origin={navigation.origin}
              on_open={props.on_navigate} on_back={props.on_back ?? (() => undefined)} />}
        </Suspense>
      </main>
      <ShellSteward context={current} {...(props.steward_ref ? { input_ref: props.steward_ref } : {})} />
    </div>
  </ThemeFrame>;
}
