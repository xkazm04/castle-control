import { useId } from 'react';
import type { ReactNode } from 'react';
import './section.css';

export type ChamberSectionProps = {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
};

export function ChamberSection({ title, aside, children }: ChamberSectionProps) {
  const id = useId();
  return <section className="cc-chamber-section" data-role="room-section" aria-labelledby={id}>
    <header className="cc-chamber-section-heading"><h3 id={id}>{title}</h3>{aside}</header>
    {children}
  </section>;
}
