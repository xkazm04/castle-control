import type { ModuleId } from '@castle-control/ui';
import { useId } from 'react';
import type { keepReadModel } from './read-model.js';
import './window-scenes.css';

/** Decorative geometry from the Four Lights reference, rendered as typed SVG. */
export function Tracery() {
  return <svg className="keep-tracery" viewBox="0 0 120 120" aria-hidden="true">
    <g fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="60" cy="60" r="54" />
      <circle cx="60" cy="60" r="18" />{[[60, 27], [60, 93], [27, 60], [93, 60]].map(([x, y], index) =>
        <circle key={index} cx={x} cy={y} r="14" />)}<path d="M60 6v108M6 60h108" opacity=".45" /></g>
  </svg>;
}

function Urn() {
  return <><svg className="keep-beads" viewBox="0 0 300 220" aria-hidden="true">
    {Array.from({ length: 87 }, (_, index) => {
      // Fixed simulated lots, laid around the urn; no random or viewer input.
      const angle = index * 2.39996;
      const radius = 25 + Math.sqrt(index / 87) * 108;
      return <circle key={index} cx={150 + Math.cos(angle) * radius} cy={110 + Math.sin(angle) * radius * .56}
        r={3.6 + index % 4} className={`keep-bead keep-bead-${index % 3}`} />;
    })}</svg><img className="keep-urn" src="/art/preset-heraldic-urn.webp" alt="" /></>;
}

function Gate({ read, simulated }: { read: ReturnType<typeof keepReadModel>; simulated: boolean }) {
  const id = useId();
  return <><div className="keep-herald"><small>The Herald · {simulated ? 'sample · simulated' : 'illustration'}</small>
    <div className="keep-banners">{read.consensus.slice(0, 4).map((direction, index) =>
      <span key={direction.key} className={`keep-banner keep-banner-${index}`} title={`${direction.label} · simulated`}>
        {Math.round(direction.share * 100)}</span>)}</div></div>
    <svg className="keep-portcullis" viewBox="0 0 200 230" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
      <defs><radialGradient id={`${id}-gate`}><stop stopColor="var(--azure)" /><stop offset="1" stopColor="var(--azure-deep)" /></radialGradient>
        <radialGradient id={`${id}-torch`}><stop stopColor="var(--or-lit)" /><stop offset="1" stopColor="var(--or)" stopOpacity="0" /></radialGradient></defs>
      <path d="M8 230V92Q8 8 100 8t92 84v138Z" fill="var(--surface-3)" stroke="var(--hair-2)" strokeWidth="3" />
      <path d="M32 230V98Q32 32 100 32t68 66v132Z" fill={`url(#${id}-gate)`} />
      <path d="M54 230V70M78 230V44M100 230V36M122 230V44M146 230V70M32 100h136M32 136h136M32 172h136M32 208h136"
        fill="none" stroke="var(--stone)" strokeWidth="6" opacity=".92" />
      {[14, 186].map(x => <g key={x}><circle cx={x} cy="104" r="20" fill={`url(#${id}-torch)`} />
        <path d={`M${x} 96c4 5 5 8 5 11a5 5 0 0 1-10 0c0-3 1-6 5-11Z`} fill="var(--or-lit)" /></g>)}
    </svg>{simulated && <span className="keep-held">HELD</span>}</>;
}

function DuelShield({ seed }: { seed: 1 | 2 }) {
  const id = useId();
  const shield = 'M6 6h88v54c0 31-23 47-44 55C29 107 6 91 6 60Z';
  return <div className="keep-crest"><b>{seed}</b><svg viewBox="0 0 100 118" aria-hidden="true">
    <defs><clipPath id={id}><path d={shield} /></clipPath></defs>
    <g clipPath={`url(#${id})`}>
      <path d="M0 0h100v118H0Z" fill={seed === 1 ? 'var(--gules)' : 'var(--emerald)'} />
      {seed === 1 ? <><path d="m-10-10 120 138m0-138L-10 128" stroke="var(--or)" strokeWidth="22" />
        <circle cx="50" cy="52" r="17" fill="var(--or)" stroke="var(--deck-gold-2)" strokeWidth="3" /></>
        : <><path d="M0 64h100v54H0Z" fill="var(--or)" /><circle cx="50" cy="58" r="22" fill="var(--emerald)" stroke="var(--deck-gold)" strokeWidth="3" />
          <path d="m50 40 5.2 10.8 11.8 1.5-8.7 8.2 2.2 11.7L50 66.3 39.5 72.2l2.2-11.7-8.7-8.2 11.8-1.5Z" fill="var(--deck-gold)" /></>}
    </g><path d={shield} fill="none" stroke="var(--deck-gold)" strokeWidth="4" /></svg></div>;
}

export function KeepScene({ room, read, simulated }: { room: ModuleId; read: ReturnType<typeof keepReadModel>; simulated: boolean }) {
  return <div className={`keep-scene keep-scene-${room}`} aria-hidden="true">
    {room === 'lottery' && <Urn />}
    {room === 'moderator' && <Gate read={read} simulated={simulated} />}
    {room === 'visuals' && <><div className="keep-altar-glow" /><img className="keep-altar" src="/art/preset-heraldic-altar.webp" alt="" /></>}
    {room === 'studio' && <><img className="keep-hex" src="/art/preset-heraldic-hexmap.webp" alt="" />
      <div className="keep-duel"><DuelShield seed={1} /><DuelShield seed={2} /></div>
      <span className="keep-duel-label">Chat duel{simulated ? ' · type 1 or 2' : ' · illustration'}</span></>}
  </div>;
}
