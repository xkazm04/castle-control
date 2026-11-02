import { RoomKeyBadge } from '../../shell/steward-keys.jsx';
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import type { Visual } from '@castle-control/contract';
import { HeroReadout, Plate, PlateBand, StatusChip } from '@castle-control/ui';
import { beaconsCopy as copy } from '../../beacons-copy.js';
import { source_labels } from './contribution-input.js';
import { BeaconThumb } from './stage.jsx';
import { findPreset } from './presets.js';

export type PlateVisual = { visual: Visual; total?: number; intensity?: number; gift_weight?: number };

function Stair({ item, core }: { item: PlateVisual; core: boolean }) {
  return <span className="visuals-stair" aria-label={core ? copy.core_ranges(item.visual.name) : copy.ranges(item.visual.name)}>
    {item.visual.curve.ranges.map((point, index, points) => {
      const next = points[index + 1];
      const active = item.total !== undefined && item.total >= point.total && (!next || item.total < next.total);
      const fraction = item.total === undefined ? 0 : next ? Math.max(0, Math.min(1, (item.total - point.total) / (next.total - point.total))) : 1;
      const style: CSSProperties & { '--from': number; '--to': number; '--frac': string } = {
        '--from': point.intensity, '--to': next?.intensity ?? point.intensity, '--frac': `${fraction * 100}%`,
      };
      return <span className="visuals-stair-step" key={point.total} data-tier-start={point.total}
        data-state={active ? 'active' : item.total !== undefined && item.total > point.total ? 'passed' : 'ahead'} style={style}>
        <i aria-hidden="true" /><b>{point.total}{next ? `–${next.total}` : '+'}</b>
        <span>{Math.round(point.intensity * 100)}{next ? `→${Math.round(next.intensity * 100)}` : ''}%</span>
      </span>;
    })}
  </span>;
}

/** Native radios: a single Tab stop, with local arrows kept out of shell navigation. */
export function selectPlate<T>(event: KeyboardEvent<HTMLButtonElement>, index: number, items: readonly T[], select: (item: T) => void) {
  if (event.ctrlKey || event.metaKey || event.altKey || event.nativeEvent.isComposing) return;
  const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1
    : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
  const next = direction ? (index + direction + items.length) % items.length
    : event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : index;
  if (!direction && !['Home', 'End', 'Enter', ' '].includes(event.key)) return;
  event.preventDefault(); event.stopPropagation();
  const item = items[next];
  if (!item) return;
  select(item);
  event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
}

export function BeaconPlates<T extends PlateVisual>({ visuals, selected, on_select, draft, core = false, busy = false, compact = false }: {
  visuals: readonly T[]; selected: string; on_select: (item: T) => void;
  draft?: ReactNode; core?: boolean; busy?: boolean; compact?: boolean;
}) {
  if (compact) return <div className="visuals-plates--compact visuals-beacon-list" role="radiogroup" aria-label={copy.visuals}>
    {visuals.map((item, index) => {
      const chosen = item.visual.visual_id === selected;
      const percent = item.intensity === undefined ? 'n/a' : `${Math.round(item.intensity * 100)}%`;
      return <button type="button" role="radio" key={item.visual.visual_id} className="visuals-beacon"
        aria-checked={chosen} tabIndex={chosen ? 0 : -1} disabled={busy}
        aria-label={`${item.visual.name}, ${item.intensity === undefined ? copy.live_unavailable : `${percent} ${copy.blaze}`}`}
        onClick={() => on_select(item)} onKeyDown={event => selectPlate(event, index, visuals, on_select)}>
        <span className="visuals-beacon-name"><RoomKeyBadge room="visuals" action={`beacon_${index}`} />{item.visual.name}</span>
        <span className="visuals-beacon-blaze">{percent}</span>
        <span className="visuals-beacon-state">{chosen ? 'In the picture' : 'Show in the picture'}</span>
        {chosen && <>
          <Stair item={item} core={core} />
          <span className="visuals-beacon-chips">
            <span>{item.gift_weight === undefined
              ? item.visual.input ? source_labels[item.visual.input.source] : copy.not_routed
              : `${item.gift_weight}× gift weighting`}</span>
            <span>{item.visual.curve.decay.kind === 'none' ? copy.no_decay : copy.half_life(item.visual.curve.decay.half_life_s / 60)}</span>
          </span>
        </>}
      </button>;
    })}
  </div>;
  return <div className="visuals-plates" role="radiogroup" aria-label={copy.visuals}>
    {visuals.map((item, index) => {
      const chosen = item.visual.visual_id === selected;
      const preset = findPreset(item.visual.design_id);
      const kind = preset ? preset.kind === 'object' ? copy.object : copy.camera
        : item.visual.design_id === 'altar' ? copy.object : item.visual.design_id === 'camera-frame' ? copy.camera : copy.border;
      return <Plate key={item.visual.visual_id} selection="radio" variant="choice" ink="or" checked={chosen}
        className="visuals-plate" tabIndex={chosen ? 0 : -1} disabled={busy}
        aria-label={`${item.visual.name}, ${item.intensity === undefined ? copy.live_unavailable : `${Math.round(item.intensity * 100)}% ${copy.blaze}`}`}
        onClick={() => on_select(item)} onKeyDown={event => selectPlate(event, index, visuals, on_select)}
        band={<PlateBand variant="chief" title={`${copy.beacon} ${copy.numerals[index] ?? index + 1} · ${kind}`}
          count={<span className="visuals-plate-state" data-idle={!chosen}><RoomKeyBadge room="visuals" action={`beacon_${index}`} />{chosen ? 'In the picture' : 'Show in the picture'}</span>} />}>
        <span className="visuals-plate-name">{item.visual.name}</span>
        <span className="visuals-plate-art" data-on-air="false">
          <BeaconThumb visual={item.visual} intensity={item.intensity ?? 0}
            label={core ? copy.core_art(item.visual.name) : `${item.visual.name} · simulated local preview`} />
          {chosen && draft}
        </span>
        <span className="visuals-plate-row">
          <HeroReadout as="span" scale="numeric" ghost="none" value={item.intensity === undefined ? copy.unavailable : String(Math.round(item.intensity * 100))}
            caption={core ? item.intensity === undefined ? copy.live_unavailable : copy.core_simulation : copy.blaze}
            {...(item.intensity === undefined ? {} : { unit: '%' })} />
          <Stair item={item} core={core} />
        </span>
        <span className="visuals-plate-meta">{item.total === undefined ? copy.core_curve : `${item.total.toFixed(1)} ${copy.simulated_meta}`}</span>
        <span className="visuals-plate-foot">
          <StatusChip variant="or">{item.visual.input ? source_labels[item.visual.input.source] : copy.not_routed}</StatusChip>
          <StatusChip variant="dash">{item.visual.curve.decay.kind === 'none' ? copy.no_decay : copy.half_life(item.visual.curve.decay.half_life_s / 60)}</StatusChip>
        </span>
      </Plate>;
    })}
  </div>;
}
