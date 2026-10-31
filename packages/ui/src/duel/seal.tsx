import type { ReactNode } from 'react';

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
