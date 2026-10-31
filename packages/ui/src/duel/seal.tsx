import type { ReactNode } from 'react';

export function Countdown({ window_ms, elapsed, speed, paused, closed, seconds, closed_label }: {
  window_ms: number; elapsed: number; speed: number; paused: boolean; closed: boolean;
  seconds: string; closed_label: string;
}) {
  return <>
    <svg className="ty-ring" data-role="ty-ring" viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="60" r="56" fill="none" strokeWidth="5" />
      <circle key={`${elapsed}-${speed}-${paused}-${closed}`} className="ty-ring-progress"
        cx="60" cy="60" r="56" fill="none" strokeWidth="5" strokeDasharray="351.9" transform="rotate(-90 60 60)"
        style={{ animationDuration: `${window_ms / speed}ms`, animationDelay: `-${(closed ? window_ms : elapsed) / speed}ms`,
          strokeDashoffset: 351.9 * (closed ? 1 : elapsed / window_ms),
          animationPlayState: paused || closed ? 'paused' : 'running' }} />
    </svg>
    <span className="ty-secs"><b data-role="ty-secs">{closed ? 0 : Math.ceil(Math.max(0, window_ms - elapsed) / 1000)}</b>
      <small>{closed ? closed_label : seconds}</small></span>
  </>;
}

const star_path = Array.from({ length: 36 }, (_, index) => {
  const angle = index / 36 * Math.PI * 2;
  const radius = index % 2 ? 46 : 50;
  return `${index ? 'L' : 'M'}${(50 + radius * Math.cos(angle)).toFixed(1)} ${(50 + radius * Math.sin(angle)).toFixed(1)}`;
}).join('') + 'Z';

export function Seal({ children, enter = false }: { children: ReactNode; enter?: boolean }) {
  return <div className={`ty-seal${enter ? ' ty-pop' : ''}`} data-role="ty-seal">
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <path d={star_path} fill="var(--gules)" />
      <circle cx="50" cy="50" r="38" fill="none" strokeWidth="2" />
      <circle cx="50" cy="50" r="33" fill="none" stroke="var(--or)" strokeWidth="1" strokeDasharray="2 3" />
    </svg>
    {children}
  </div>;
}
