import type { CSSProperties } from 'react';
import type { PreviewVisual } from '../../beacons-model.js';
import { findPreset } from './presets.js';

/** Chamber-specific illustration, driven only by the existing local model. */
export function BeaconArtwork({ item, hero = false, label }: { item: PreviewVisual; hero?: boolean; label?: string }) {
  const preset = findPreset(item.visual.design_id);
  if (preset) return <div className={`visuals-room-art${hero ? ' visuals-room-art-hero' : ''}`}
    style={{ '--room-blaze': item.intensity } as CSSProperties}>
    <img src={preset.url} alt={label ?? `${item.visual.name} · simulated local preview`}
      width={preset.width} height={preset.height} style={{ width: '100%', height: '100%', objectFit: 'contain',
        opacity: preset.kind === 'object' ? 'calc(0.35 + var(--room-blaze) * 0.65)' : 'calc(0.25 + var(--room-blaze) * 0.75)',
        ...(preset.kind === 'object' ? { transform: 'scale(calc(0.9 + var(--room-blaze) * 0.15))' } : {}) }} />
  </div>;
  // Painted bounds: altar (90,31)–(270,237); frames (20,30)–(340,210),
  // including the glow stroke. Six units of margin on every side.
  const box = item.visual.design_id === 'altar'
    ? { x: 84, y: 25, width: 192, height: 218 }
    : { x: 14, y: 24, width: 332, height: 192 };
  const style: CSSProperties & { '--room-blaze': number; '--room-art-aspect'?: string } = {
    '--room-blaze': item.intensity,
    ...(hero ? { '--room-art-aspect': `${box.width} / ${box.height}` } : {}),
  };
  return <div className={`visuals-room-art${hero ? ' visuals-room-art-hero' : ''}`} style={style}>
    <svg viewBox={hero ? `${box.x} ${box.y} ${box.width} ${box.height}` : '0 0 360 240'}
      preserveAspectRatio={hero ? 'xMidYMax meet' : undefined}
      role="img" aria-label={label ?? `${item.visual.name} · simulated local preview`}>
      {item.visual.design_id === 'altar' ? <>
        <path className="visuals-room-stone" d="M90 197h180v12H90zm12 12h156l-20 28H122z" />
        <path className="visuals-room-fire" d="M135 194c-60-54 34-75 37-163 42 48 1 68 34 87 12-25 21-30 20-53 55 73 37 100-7 129Z" />
        <path className="visuals-room-fire-core" d="M160 194c-24-30 27-42 22-89 39 42 44 60 21 89Z" />
      </> : <>
        <rect className="visuals-room-stone" x="20" y="30" width="320" height="180" rx="6" />
        <rect className="visuals-room-cutout" x="31" y="41" width="298" height="158" />
        <path className="visuals-room-glow" d="M25 35h310v170H25Z" />
        {item.visual.design_id === 'camera-frame' ? <>
          <circle className="visuals-room-stone" cx="180" cy="98" r="26" />
          <path className="visuals-room-stone" d="M125 183c0-70 110-70 110 0Z" />
        </> : <path className="visuals-room-fire" d="m48 190 20-60 15 32 17-85 22 113zm190 0 20-75 13 42 23-36 20 69Z" />}
      </>}
    </svg>
  </div>;
}
