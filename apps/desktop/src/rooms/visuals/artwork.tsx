import type { CSSProperties } from 'react';
import type { PreviewVisual } from '../../beacons-model.js';

/** Chamber-specific illustration, driven only by the existing local model. */
export function BeaconArtwork({ item, hero = false }: { item: PreviewVisual; hero?: boolean }) {
  const style: CSSProperties & { '--room-blaze': number } = { '--room-blaze': item.intensity };
  return <div className={`visuals-room-art${hero ? ' visuals-room-art-hero' : ''}`} style={style}>
    <svg viewBox="0 0 360 240" role="img" aria-label={`${item.visual.name} · simulated local preview`}>
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
