import type { ModuleId } from '@castle-control/ui';
import './art.css';

/** New vector drawings of the reference's objects; no prototype HTML or scripts. */
export function ChamberArt({ chamber }: { chamber: ModuleId }) {
  return <svg className="keep-chamber-art" viewBox="0 0 200 160" aria-hidden="true">
    {chamber === 'lottery' ? <>
      <path d="M55 38h90l-10 22c35 42 20 75-35 75S30 102 65 60Z" fill="var(--gules)" />
      <ellipse cx="100" cy="38" rx="48" ry="12" fill="var(--paper)" stroke="var(--gules-text)" strokeWidth="3" />
      <path d="M76 63q24 13 48 0M64 100q36 28 72 0" fill="none" stroke="var(--paper)" strokeWidth="3" />
      {Array.from({ length: 21 }, (_, i) => <circle key={i} cx={70 + i % 7 * 10} cy={80 + Math.floor(i / 7) * 12} r="2" fill="var(--paper)" />)}
    </> : chamber === 'moderator' ? <>
      <path d="M28 144V42a72 45 0 0 1 144 0v102Z" fill="var(--azure)" />
      <path d="M48 144V48a52 28 0 0 1 104 0v96Z" fill="var(--paper-2)" />
      {[62, 88, 114, 140].map(x => <path key={x} d={`M${x} 28v116`} stroke="var(--azure-text)" strokeWidth="5" />)}
      {[62, 92, 122].map(y => <path key={y} d={`M44 ${y}h112`} stroke="var(--azure-text)" strokeWidth="4" />)}
    </> : chamber === 'visuals' ? <>
      <path className="keep-fire" d="M100 12c30 40-4 49 25 63 3-15 13-20 13-33 47 72 17 90-38 90S27 98 63 55c-1 32 31 15 37-43Z" fill="var(--or)" />
      <path d="M99 65c20 26 32 35 13 55H85c-17-17 6-34 14-55Z" fill="var(--gules)" />
      <path d="M55 119h90l-11 18H66Zm20 18h50v15H75Z" fill="var(--ink)" />
    </> : <>
      {Array.from({ length: 35 }, (_, i) => {
        const x = 20 + i % 7 * 24 + (Math.floor(i / 7) % 2) * 12;
        const y = 22 + Math.floor(i / 7) * 25;
        return <path key={i} d={`M${x} ${y}l12-7 12 7v14l-12 7-12-7Z`}
          fill={i % 5 === 0 ? 'var(--gules)' : i % 3 === 0 ? 'var(--or)' : 'var(--paper-2)'} stroke="var(--ink)" strokeWidth="1" />;
      })}
    </>}
  </svg>;
}
